'use strict'

const path = require('node:path')
const { BrowserWindow, screen } = require('electron')

const { IdCounter } = require('./ids')
const { emitToWindow, flush } = require('./events')

const PRELOAD = path.join(__dirname, '..', 'preload.js')

/**
 * 窗口注册表 —— 对齐 crates/niva/src/app/window_manager/mod.rs
 *
 * 关键语义（全部照做）：
 *   - 窗口 id 是 u8，主窗口固定 0（IdCounter 从 0 起扫，0 被占用后自然落到 1）
 *   - id 是「粘性」的：关闭后会被复用
 *   - 关闭 id===0 的窗口 = 应用退出
 *   - 关闭任意窗口时，连带注销它的全部快捷键与托盘（WindowManager::close_window）
 */

class NivaWindow {
  constructor({ id, win, menuOptions }) {
    this.id = id
    this.win = win
    /** 对齐 NivaWindowState::is_block_closed_requested */
    this.blockCloseRequested = false
    /** 对齐 NivaWindow::menu_options */
    this.menuOptions = menuOptions === undefined ? null : menuOptions
    /** 创建时 frame 是否为真，用于 Decorated() 的回读（Electron 无运行时查询 API） */
    this.decorated = true
    this.domReady = false
    this.pendingExpressions = []
    /** 当前挂上的菜单；与「可见性」状态（Electron 无 isMenuVisible 查询 API，只能自己记） */
    this.appliedMenu = null
    /** 仅非 macOS 有意义；macOS 上 is_menu_visible 恒为 true（见 isMenuVisible） */
    this.menuVisible = false
    /** 创建时就抓住的 webContents.id（窗口销毁后再读会抛错） */
    this.webContentsId = -1
    /** 由 WindowManager 注入，供 API 层解析目标窗口 */
    this.deps = null
  }

  get title() {
    return this.win.getTitle()
  }

  isVisible() {
    return this.win.isVisible()
  }

  /**
   * 对齐 NivaWindow::switch_menu（原版这个方法本身就是 #[cfg(target_os = "macos")]）。
   *
   * 原版在 WindowEvent::Focused 里调它（event_handler.rs:74-77），
   * 作用是「重新把菜单挂回去」—— 这是 macOS 应用级菜单栏的必要补偿动作。
   * 非 macOS 上原版没有这个调用，所以这里也只在 macOS 生效。
   */
  switchMenu() {
    if (process.platform !== 'darwin') return
    this.rebuildMenu()
  }

  /**
   * 对齐 NivaWindow::set_menu 里的重建动作：
   * 无条件重建，挂载与否由调用方（setMenu / switchMenu）按 is_focused && is_menu_visible 判定。
   */
  rebuildMenu() {
    const { buildWindowMenu } = require('./menu')
    const menu = buildWindowMenu(this.id, this.menuOptions, (itemId, windowId) => {
      if (this.deps && this.deps.emit) this.deps.emit(this.deps.windows.get(windowId), 'menu.clicked', itemId)
    })
    this.appliedMenu = menu
    // macOS 上菜单栏永远可见，状态不受这里影响
    if (process.platform !== 'darwin') this.menuVisible = Boolean(menu)
    applyMenuFor(this, menu)
  }

  /**
   * 对齐 tao::window::Window::hide_menu()
   *
   * macOS：tao 明确标为 Unsupported（空操作）—— 系统不允许隐藏应用菜单栏，
   *        所以这里必须什么都不做。若真去 setApplicationMenu(null)，
   *        会把整个菜单栏抹掉，属于对原版行为的可见偏离。
   * 其它平台：Windows/Linux 支持隐藏窗口菜单。
   */
  hideMenu() {
    if (process.platform === 'darwin') return
    this.menuVisible = false
    applyMenuFor(this, null)
  }

  /**
   * 对齐 tao::window::Window::show_menu()
   *
   * macOS：同 hideMenu，tao 标为 Unsupported（空操作）。原版 show_menu API 的实现里
   *        调的其实是 hide_menu()（crates/niva/src/app/api/window.rs:147，笔误），
   *        在 macOS 上两者同为空操作，故这里保持空操作 = 与原版行为完全一致。
   * 其它平台：按正确语义显示（即重建窗口菜单），修复原版笔误 —— 见差异表 D2。
   */
  showMenu() {
    if (process.platform === 'darwin') return
    if (!this.menuOptions) return
    this.rebuildMenu()
  }

  /**
   * 对齐 tao::window::Window::is_menu_visible()
   *
   * tao 的实现里 macOS 分支恒返回 true —— 文档原话：
   *   "macOS: Always return true, as the menu is always visible."
   * 所以 macOS 上无论有没有配置菜单、有没有调过 hideMenu，都必须返回 true。
   *
   * 这一点还会连带影响 window.setMenu 的判定：
   * 原版 set_menu 的 `is_focused() && is_menu_visible()` 在 macOS 上等价于只看 is_focused()。
   */
  isMenuVisible() {
    if (process.platform === 'darwin') return true
    return this.menuVisible
  }
}

/** macOS 走应用级菜单，其余平台走窗口级菜单（见 menu.js::applyMenu 的说明） */
function applyMenuFor(nivaWindow, menu) {
  const { applyMenu } = require('./menu')
  applyMenu(nivaWindow, menu)
}

/**
 * 「退出已被确认」的全局标志。
 *
 * 为什么需要它：`blockCloseRequested` 会拦截窗口的 close 事件（用来做「未保存就确认」），
 * 而 Electron 的 `app.quit()` **也是靠关闭窗口来实现的** —— 于是会形成死循环：
 *
 *     app.quit() → 触发 close → 被 preventDefault → 发 window.closeRequested
 *                → 渲染层调 window.close() → 又 app.quit() → ...
 *
 * 结果就是**应用永远关不掉**（Cmd+Q、点红绿灯、脚本里的 app.quit() 全部失效）。
 * 原版没有这个问题：Niva 的 `ControlFlow::Exit` 直接终止事件循环，不经过窗口关闭回调。
 *
 * 修法：一旦「要退出」这件事被确认（渲染层处理完未保存确认后调用 window.close()，
 * 或者已经没有窗口在拦截），就置位该标志，之后所有 close 回调不再拦截。
 */
let quitConfirmed = false

function markQuitConfirmed() {
  quitConfirmed = true
}

function isQuitConfirmed() {
  return quitConfirmed
}

class WindowManager {
  constructor(ctx, hooks) {
    this.ctx = ctx
    /** { onClose: (id) => void } —— 关闭窗口时清理该窗口的快捷键/托盘 */
    this.hooks = hooks || {}
    /** 由 runtime/index.js 注入 { windows, emit, ... }，供 NivaWindow/API 层使用 */
    this.deps = null
    this.idCounter = new IdCounter()
    /** @type {Map<number, NivaWindow>} */
    this.windows = new Map()
    /** @type {Map<number, webContents.id -> niva window id>} */
    this.byWebContents = new Map()

    // Cmd+Q / 菜单退出走的是 app.quit()，同样要先问渲染层（未保存的配置改动不能丢），
    // 但渲染层确认之后必须真的能退 —— quitConfirmed 就是那个「放行」开关。
    const { app } = require('electron')
    app.on('before-quit', (event) => {
      if (quitConfirmed) return
      const main = this.windows.get(0)
      if (main && main.blockCloseRequested && !main.win.isDestroyed()) {
        event.preventDefault()
        emitToWindow(main, 'window.closeRequested', null)
      }
    })
  }

  /** 渲染层已完成退出确认：放行所有后续关闭 */
  confirmQuit() {
    markQuitConfirmed()
  }

  /** 对齐 WindowManager::open_window */
  open(options) {
    const opts = options || {}
    const taken = new Set(this.windows.keys())
    const id = this.idCounter.next(taken)

    const nivaWindow = this._build(id, opts)
    this.windows.set(id, nivaWindow)
    this.byWebContents.set(nivaWindow.webContentsId, id)
    return nivaWindow
  }

  /** 对齐 WindowManager::get_window */
  get(id) {
    const found = this.windows.get(id)
    if (!found) throw new Error(`Window ${id} not found`)
    return found
  }

  has(id) {
    return this.windows.has(id)
  }

  /** 对齐 WindowManager::get_window_inner（按 wry 的 WindowId 反查，这里用 webContents.id） */
  getByWebContents(wcId) {
    const id = this.byWebContents.get(wcId)
    if (id === undefined) throw new Error('Window not found')
    return this.get(id)
  }

  /** 对齐 WindowManager::list_windows（HashMap::values()，顺序不保证——原版也不保证） */
  list() {
    return [...this.windows.values()]
  }

  /** 对齐 WindowManager::close_window */
  close(id) {
    const nivaWindow = this.windows.get(id)
    if (!nivaWindow) throw new Error(`Window ${id} not found`)

    this.windows.delete(id)
    this.byWebContents.delete(nivaWindow.webContentsId)

    if (this.hooks.onClose) this.hooks.onClose(id)

    if (!nivaWindow.win.isDestroyed()) nivaWindow.win.destroy()
  }

  /* ------------------------------------------------------------------ */

  _build(id, options) {
    const ctx = this.ctx

    // 标题：options.title 缺省回落 launch_info.name（对齐 builder.rs）
    const title = options.title === undefined || options.title === null ? ctx.name : options.title

    const ctor = {
      title,
      // 原版用 with_inner_size（客户区），Electron 的 width/height 是窗口尺寸，
      // 用 useContentSize 让两者语义对齐
      useContentSize: true,
      show: false,
      webPreferences: {
        preload: PRELOAD,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        // 原版只在显式配置 devtools 时才覆盖；这里同理，不配就沿用默认（开启）
        ...(options.devtools === false ? { devTools: false } : {}),
      },
    }

    if (options.size) {
      ctor.width = options.size.width
      ctor.height = options.size.height
    }
    if (options.position) {
      ctor.x = Math.round(options.position.x)
      ctor.y = Math.round(options.position.y)
    }
    if (options.resizable !== undefined) ctor.resizable = options.resizable
    if (options.minimizable !== undefined) ctor.minimizable = options.minimizable
    if (options.maximizable !== undefined) ctor.maximizable = options.maximizable
    if (options.closable !== undefined) ctor.closable = options.closable
    if (options.transparent !== undefined) ctor.transparent = options.transparent
    if (options.decorations !== undefined) ctor.frame = options.decorations
    if (options.alwaysOnTop !== undefined) ctor.alwaysOnTop = options.alwaysOnTop
    if (options.hasShadow !== undefined) ctor.hasShadow = options.hasShadow
    if (options.tabbingIdentifier !== undefined) ctor.tabbingIdentifier = options.tabbingIdentifier
    if (options.movableByWindowBackground !== undefined) ctor.movable = true
    // 原版 with_accept_first_mouse(true)：点未激活窗口时第一次点击就生效
    if (process.platform === 'darwin') ctor.acceptFirstMouse = true

    // macOS 标题栏相关：Electron 用一个 titleBarStyle 表达，粒度不如 tao 细（见差异表）
    if (
      options.titleBarHidden ||
      options.titleBarTransparent ||
      options.fullSizeContentView
    ) {
      ctor.titleBarStyle = 'hidden'
      if (options.fullSizeContentView) ctor.titleBarStyle = 'hiddenInset'
    }

    if (options.icon && ctx.resource.exists(options.icon)) {
      ctor.icon = ctx.resource.loadIcon(options.icon)
    }

    // parentWindow：原版是 u8 窗口 id，Electron 需要 BrowserWindow 实例
    if (options.parentWindow !== undefined && this.windows.has(options.parentWindow)) {
      ctor.parent = this.windows.get(options.parentWindow).win
    }

    const win = new BrowserWindow(ctor)
    // 必须在窗口存活时就抓住 webContents.id：
    // 'closed' 事件触发时 win.webContents 已经销毁，再去读 .id 会抛
    // "TypeError: Object has been destroyed"。
    const wcId = win.webContents.id

    const nivaWindow = new NivaWindow({ id, win, menuOptions: options.menu || null })
    nivaWindow.decorated = ctor.frame === undefined ? true : Boolean(ctor.frame)
    nivaWindow.webContentsId = wcId
    // 注入依赖（manager 的 deps 对象是稳定引用，bootstrap 里在任何窗口创建前就已赋值）：
    //   - API 层用 nivaWindow.deps 解析「按 id 指定的目标窗口」
    //   - 菜单点击回调用 nivaWindow.deps.emit 派发 menu.clicked
    nivaWindow.deps = this.deps

    // 对齐 builder.rs:104-106：创建窗口时就把菜单挂上（with_menu）。
    // macOS 上 build_menu 因为有「默认菜单」兜底，永远返回 Some —— 也就是
    // macOS 新建窗口必定带菜单栏，这一点必须复现。
    nivaWindow.rebuildMenu()

    // useStateContentSize 后 min/max 是窗口级而非客户区级 —— Electron 的能力边界，
    // 已记入差异表；这里仍按原版意图设置
    // macOS 隐藏系统红绿灯（tao: with_title_bar_buttons_hidden）。
    // 必须显式处理：titleBarStyle:'hiddenInset' 只是把红绿灯内嵌，并不会隐藏它们；
    // 而 Niva Devtools 这类自绘标题栏的应用会画出自己的一套圆点，
    // 不隐藏系统按钮就会出现两套并排/重叠。
    if (process.platform === 'darwin' && options.titleBarButtonsHidden !== undefined) {
      try {
        win.setWindowButtonVisibility(!options.titleBarButtonsHidden)
      } catch (error) {
        console.warn(`[elva:niva] 设置窗口按钮可见性失败: ${error.message}`)
      }
    }

    if (options.minSize) win.setMinimumSize(options.minSize.width, options.minSize.height)
    if (options.maxSize) win.setMaximumSize(options.maxSize.width, options.maxSize.height)
    if (options.contentProtection !== undefined) win.setContentProtection(options.contentProtection)
    if (options.visibleOnAllWorkspaces !== undefined) {
      win.setVisibleOnAllWorkspaces(options.visibleOnAllWorkspaces, { visibleOnFullScreen: true })
    }

    // 原版 with_focused(false)：创建时不抢焦点
    const shouldFocus = options.focused === undefined ? true : options.focused
    win.once('ready-to-show', () => {
      if (options.visible === false) return
      if (shouldFocus) win.show()
      else win.showInactive()
    })
    if (options.visible === false) {
      // 显式不可见：等 ready-to-show 后什么都不做（原版 with_visible(false)）
      win.once('ready-to-show', () => {})
    }
    if (options.maximized) win.once('ready-to-show', () => win.maximize())

    win.webContents.on('dom-ready', () => flush(nivaWindow))

    // CloseRequested 语义（对齐 event_handler.rs::handle_window_event）
    win.on('close', (event) => {
      // quitConfirmed 之后不再拦截，否则 app.quit() / Cmd+Q 会被自己挡死（见文件头说明）
      if (nivaWindow.blockCloseRequested && !quitConfirmed) {
        event.preventDefault()
        emitToWindow(nivaWindow, 'window.closeRequested', null)
        return
      }
      // is_block_closed_requested=false 时：关闭窗口；id===0 则退出应用
    })

    win.on('closed', () => {
      if (!this.windows.has(id)) {
        // 已经通过 window.close 走完清理流程
        if (id === 0) this._quit()
        return
      }
      this.windows.delete(id)
      this.byWebContents.delete(wcId)
      if (this.hooks.onClose) this.hooks.onClose(id)
      if (id === 0) this._quit()
    })

    win.on('focus', () => {
      if (this.hooks.onFocus) this.hooks.onFocus(nivaWindow)
      emitToWindow(nivaWindow, 'window.focused', true)
    })
    win.on('blur', () => emitToWindow(nivaWindow, 'window.focused', false))

    win.on('enter-full-screen', () => {})
    win.on('leave-full-screen', () => {})

    // 缩放因子变化（对齐 WindowEvent::ScaleFactorChanged）
    win.on('resize', () => {
      if (win.isDestroyed()) return
      const display = screen.getDisplayMatching(win.getBounds())
      const previous = nivaWindow.lastScaleFactor
      nivaWindow.lastScaleFactor = display.scaleFactor
      if (previous !== undefined && previous !== display.scaleFactor) {
        emitToWindow(nivaWindow, 'window.scaleFactorChanged', {
          scaleFactor: display.scaleFactor,
          newInnerSize: this.contentSize(win),
        })
      }
    })

    // 导航白名单（对齐 builder.rs 的 with_navigation_handler）
    const entryUrl = this.entryUrl(options)
    const prefix = this.navigationPrefix(entryUrl)
    win.webContents.on('will-navigate', (event, url) => {
      if (!url.startsWith(prefix)) event.preventDefault()
    })
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith(prefix)) return { action: 'deny' }
      return { action: 'deny' }
    })

    win.loadURL(entryUrl)
    if (options.devtools === true) win.webContents.openDevTools({ mode: 'detach' })

    return nivaWindow
  }

  /** 入口 URL（对齐 builder.rs::build_webview：debug_entry 优先，否则自造 base_url） */
  entryUrl(options) {
    const baseUrl = this.ctx.arguments.debugEntry || `elva://${this.ctx.idName}`
    return `${baseUrl}${joinSuffix(baseUrl, (options && options.entry) || '')}`
  }

  navigationPrefix(entryUrl) {
    try {
      const parsed = new URL(entryUrl)
      return `${parsed.protocol}//${parsed.host}`
    } catch {
      return entryUrl
    }
  }

  contentSize(win) {
    const [width, height] = win.getContentSize()
    return { width, height }
  }

  _quit() {
    // 走这条路说明关闭流程已经走完（窗口都没了或已清理），放行退出
    markQuitConfirmed()
    const { app } = require('electron')
    app.quit()
  }
}

/** url_join 的等价实现 */
function joinSuffix(left, right) {
  if (!right) return ''
  if (left.endsWith('/')) return right
  return `/${right}`
}

module.exports = { WindowManager, NivaWindow }
