'use strict'

const { app, screen, nativeTheme } = require('electron')

const { arg, optional, resolveWindow } = require('./helpers')

/**
 * window 命名空间 —— 54 个方法，逐条对齐 crates/niva/src/app/api/window.rs
 *
 * 必须保留的行为：
 *   - close(0) 退出整个应用（原版是 ControlFlow::Exit）
 *   - sendMessage(message, id) 的参数顺序是「消息在前、窗口 id 在后」
 *   - 所有尺寸/位置都是**逻辑像素**（Electron 的窗口 API 本就返回 DIP，语义天然一致）
 *   - innerSize=客户区、outerSize=含边框；innerPosition/outerPosition 同理
 *   - blockCloseRequested(true) 后，关闭动作改为派发 window.closeRequested
 *
 * 命名别名（D2 决策：原版注册名与类型声明名都注册，两种写法都能跑）：
 *   fullscreen / isFullscreen      Decorated / isDecorated
 */

/** tao 的 CursorIcon → CSS cursor（Electron 无窗口级光标 API，降级为渲染进程样式） */
const CURSOR_CSS = {
  default: 'default',
  crosshair: 'crosshair',
  hand: 'pointer',
  arrow: 'default',
  move: 'move',
  text: 'text',
  wait: 'wait',
  help: 'help',
  progress: 'progress',
  not_allowed: 'not-allowed',
  context_menu: 'context-menu',
  cell: 'cell',
  vertical_text: 'vertical-text',
  alias: 'alias',
  copy: 'copy',
  no_drop: 'no-drop',
  grab: 'grab',
  grabbing: 'grabbing',
  all_scroll: 'all-scroll',
  zoom_in: 'zoom-in',
  zoom_out: 'zoom-out',
  e_resize: 'e-resize',
  n_resize: 'n-resize',
  ne_resize: 'ne-resize',
  nw_resize: 'nw-resize',
  s_resize: 's-resize',
  se_resize: 'se-resize',
  sw_resize: 'sw-resize',
  w_resize: 'w-resize',
  ew_resize: 'ew-resize',
  ns_resize: 'ns-resize',
  nesw_resize: 'nesw-resize',
  nwse_resize: 'nwse-resize',
  col_resize: 'col-resize',
  row_resize: 'row-resize',
}

/** 在主进程控制台给出「已降级」提示，便于发现能力缺口（不抛异常，对齐 §4.3 原则） */
const warned = new Set()
function warnDegraded(api, detail) {
  if (warned.has(api)) return
  warned.add(api)
  console.warn(`[elva:niva] ${api} 已降级/无对应能力：${detail}（详见 docs/niva-parity.md）`)
}

function evalIn(nivaWindow, expression) {
  // 窗口销毁后再读 win.webContents 会抛 "Object has been destroyed"
  if (!nivaWindow || !nivaWindow.win || nivaWindow.win.isDestroyed()) return
  const wc = nivaWindow.win.webContents
  if (!wc || wc.isDestroyed()) return
  wc.executeJavaScript(expression, true).catch(() => {})
}

/** 逻辑像素：Electron 的窗口/屏幕 API 均以 DIP 表示，与原版 to_logical 结果一致 */
function contentSize(win) {
  const [width, height] = win.getContentSize()
  return { width, height }
}

function contentPosition(win) {
  const bounds = win.getContentBounds()
  return { x: bounds.x, y: bounds.y }
}

function pixelSize(win) {
  const [width, height] = win.getSize()
  return { width, height }
}

function pixelPosition(win) {
  const [x, y] = win.getPosition()
  return { x, y }
}

function scaleFactorOf(win) {
  try {
    return screen.getDisplayMatching(win.getBounds()).scaleFactor
  } catch {
    return 1
  }
}

function register(api, _deps) {
  /* ---------- 窗口本体 ---------- */

  api.register('window.current', ({ window: w }) => w.id)

  api.registerEvent('window.open', ({ args, ctx, deps: d }) => {
    const options = optional(args, 0) || {}
    return d.windows.open(options).id
  })

  api.registerEvent('window.close', ({ window: w, args, deps: d }) => {
    const id = optional(args, 0) === null ? w.id : Number(args[0])
    if (id === 0) {
      // 对齐 window.rs::close：id===0 直接 ControlFlow::Exit
      // 注意：必须先放行再 quit —— 否则窗口的 close 拦截器会把这次 quit 挡回来，
      // 形成「渲染层要退出 → 被拦截 → 再要退出」的死循环（应用关不掉）。
      d.windows.confirmQuit()
      app.quit()
      return null
    }
    d.windows.close(id)
    return null
  })

  api.register('window.list', ({ deps }) =>
    deps.windows.list().map((item) => ({
      id: item.id,
      title: item.title,
      visible: item.isVisible(),
    })),
  )

  // 参数顺序：message 在前，窗口 id 在后（原版签名 fn send_message(message: String, id: u8)）
  api.register('window.sendMessage', ({ window: w, args, deps }) => {
    const message = arg(args, 0)
    const id = Number(arg(args, 1))
    const remote = deps.windows.get(id)
    emit(remote, 'window.message', { from: w.id, message })
    return null
  })

  /* ---------- 菜单 ---------- */

  api.register('window.setMenu', ({ window: w, args }) => {
    const options = optional(args, 0)
    const target = resolveWindow(w.deps, w, optional(args, 1))
    target.menuOptions = options
    // 对齐 NivaWindow::set_menu：先存配置，只有「聚焦中且菜单可见」时才真正重建
    if (target.win.isFocused() && target.isMenuVisible()) target.rebuildMenu()
    return null
  })

  api.register('window.hideMenu', ({ window: w, args }) => {
    const target = resolveWindow(w.deps, w, optional(args, 0))
    target.hideMenu()
    return null
  })

  // D2：原版 showMenu 的实现里调的是 hide_menu()（语义反向），这里按正确语义修复
  api.register('window.showMenu', ({ window: w, args }) => {
    const target = resolveWindow(w.deps, w, optional(args, 0))
    target.showMenu()
    return null
  })

  api.register('window.isMenuVisible', ({ window: w, args }) => {
    const target = resolveWindow(w.deps, w, optional(args, 0))
    return target.isMenuVisible()
  })

  /* ---------- 度量 ---------- */

  api.register('window.scaleFactor', ({ window: w, args }) =>
    scaleFactorOf(resolveWindow(w.deps, w, optional(args, 0)).win),
  )

  api.register('window.innerPosition', ({ window: w, args }) =>
    contentPosition(resolveWindow(w.deps, w, optional(args, 0)).win),
  )

  api.register('window.outerPosition', ({ window: w, args }) =>
    pixelPosition(resolveWindow(w.deps, w, optional(args, 0)).win),
  )

  api.register('window.setOuterPosition', ({ window: w, args }) => {
    const position = arg(args, 0) || {}
    const target = resolveWindow(w.deps, w, optional(args, 1))
    target.win.setPosition(Math.round(position.x), Math.round(position.y))
    return null
  })

  api.register('window.innerSize', ({ window: w, args }) =>
    contentSize(resolveWindow(w.deps, w, optional(args, 0)).win),
  )

  api.register('window.setInnerSize', ({ window: w, args }) => {
    const size = arg(args, 0) || {}
    const target = resolveWindow(w.deps, w, optional(args, 1))
    target.win.setContentSize(Math.round(size.width), Math.round(size.height))
    return null
  })

  api.register('window.outerSize', ({ window: w, args }) =>
    pixelSize(resolveWindow(w.deps, w, optional(args, 0)).win),
  )

  api.register('window.setMinInnerSize', ({ window: w, args }) => {
    const size = arg(args, 0) || {}
    const target = resolveWindow(w.deps, w, optional(args, 1))
    // 注意：Electron 的 setMinimumSize 是窗口级而非客户区级（记入差异表）
    target.win.setMinimumSize(Math.round(size.width), Math.round(size.height))
    return null
  })

  api.register('window.setMaxInnerSize', ({ window: w, args }) => {
    const size = arg(args, 0) || {}
    const target = resolveWindow(w.deps, w, optional(args, 1))
    target.win.setMaximumSize(Math.round(size.width), Math.round(size.height))
    return null
  })

  /* ---------- 标题 ---------- */

  api.register('window.title', ({ window: w, args }) =>
    resolveWindow(w.deps, w, optional(args, 0)).win.getTitle(),
  )

  api.register('window.setTitle', ({ window: w, args }) => {
    const target = resolveWindow(w.deps, w, optional(args, 1))
    target.win.setTitle(String(arg(args, 0) ?? ''))
    return null
  })

  /* ---------- 可见性 / 焦点 ---------- */

  api.register('window.isVisible', ({ window: w, args }) =>
    resolveWindow(w.deps, w, optional(args, 0)).win.isVisible(),
  )

  api.register('window.setVisible', ({ window: w, args }) => {
    const visible = Boolean(arg(args, 0))
    const target = resolveWindow(w.deps, w, optional(args, 1))
    if (visible) target.win.show()
    else target.win.hide()
    return null
  })

  api.register('window.isFocused', ({ window: w, args }) =>
    resolveWindow(w.deps, w, optional(args, 0)).win.isFocused(),
  )

  api.register('window.setFocus', ({ window: w, args }) => {
    resolveWindow(w.deps, w, optional(args, 0)).win.focus()
    return null
  })

  /* ---------- 可操作性开关 ---------- */

  const passthrough = [
    ['isResizable', 'setResizable', (win) => win.isResizable(), (win, v) => win.setResizable(v)],
    ['isMinimizable', 'setMinimizable', (win) => win.isMinimizable(), (win, v) => win.setMinimizable(v)],
    ['isMaximizable', 'setMaximizable', (win) => win.isMaximizable(), (win, v) => win.setMaximizable(v)],
    ['isClosable', 'setClosable', (win) => win.isClosable(), (win, v) => win.setClosable(v)],
  ]
  for (const [getter, setter, read, write] of passthrough) {
    api.register(`window.${getter}`, ({ window: w, args }) =>
      read(resolveWindow(w.deps, w, optional(args, 0)).win),
    )
    api.register(`window.${setter}`, ({ window: w, args }) => {
      const value = Boolean(arg(args, 0))
      const target = resolveWindow(w.deps, w, optional(args, 1))
      write(target.win, value)
      return null
    })
  }

  /* ---------- 窗口状态 ---------- */

  api.register('window.isMinimized', ({ window: w, args }) =>
    resolveWindow(w.deps, w, optional(args, 0)).win.isMinimized(),
  )

  api.register('window.setMinimized', ({ window: w, args }) => {
    const value = Boolean(arg(args, 0))
    const target = resolveWindow(w.deps, w, optional(args, 1))
    if (value) target.win.minimize()
    else target.win.restore()
    return null
  })

  api.register('window.isMaximized', ({ window: w, args }) =>
    resolveWindow(w.deps, w, optional(args, 0)).win.isMaximized(),
  )

  api.register('window.setMaximized', ({ window: w, args }) => {
    const value = Boolean(arg(args, 0))
    const target = resolveWindow(w.deps, w, optional(args, 1))
    if (value) target.win.maximize()
    else target.win.unmaximize()
    return null
  })

  // 原版注册名是 Decorated（大写开头），类型声明写的是 isDecorated → 两个都注册
  api.register('window.Decorated', ({ window: w, args }) =>
    resolveWindow(w.deps, w, optional(args, 0)).decorated,
  )
  api.register('window.isDecorated', ({ window: w, args }) =>
    resolveWindow(w.deps, w, optional(args, 0)).decorated,
  )

  api.register('window.setDecorated', ({ window: w, args }) => {
    const value = Boolean(arg(args, 0))
    const target = resolveWindow(w.deps, w, optional(args, 1))
    target.decorated = value
    // Electron 没有运行时切换窗口装饰的公开 API：macOS 退化为隐藏红绿灯，其余平台 no-op
    if (process.platform === 'darwin' && typeof target.win.setWindowButtonVisibility === 'function') {
      target.win.setWindowButtonVisibility(value)
    } else {
      warnDegraded('window.setDecorated', 'Electron 无运行时切换窗口装饰的 API')
    }
    return null
  })

  api.register('window.fullscreen', ({ window: w, args }) =>
    resolveWindow(w.deps, w, optional(args, 0)).win.isFullScreen(),
  )
  api.register('window.isFullscreen', ({ window: w, args }) =>
    resolveWindow(w.deps, w, optional(args, 0)).win.isFullScreen(),
  )

  api.register('window.setFullscreen', ({ window: w, args }) => {
    const value = Boolean(arg(args, 0))
    const monitorName = optional(args, 1)
    const target = resolveWindow(w.deps, w, optional(args, 2))
    if (monitorName) {
      // 原版找不到显示器时报 "Monitornotfound"，这里保持同样的失败语义
      const display = screen.getAllDisplays().find((d) => d.label === monitorName)
      if (!display) throw new Error('Monitornotfound')
    }
    target.win.setFullScreen(value)
    return null
  })

  /* ---------- 层级 / 系统集成 ---------- */

  api.register('window.setAlwaysOnTop', ({ window: w, args }) => {
    const value = Boolean(arg(args, 0))
    resolveWindow(w.deps, w, optional(args, 1)).win.setAlwaysOnTop(value)
    return null
  })

  api.register('window.setAlwaysOnBottom', ({ window: w, args }) => {
    // Electron 无置底 API；原版调用返回 Promise，这里保持「不抛异常」的降级原则
    const value = Boolean(arg(args, 0))
    warnDegraded('window.setAlwaysOnBottom', `请求置底=${value}，Electron 无对应能力，已忽略`)
    return null
  })

  api.register('window.requestUserAttention', ({ window: w, args }) => {
    const level = optional(args, 0)
    const target = resolveWindow(w.deps, w, optional(args, 1))
    if (process.platform === 'darwin' && app.dock) {
      app.dock.bounce(level === 'critical' ? 'critical' : 'informational')
    } else {
      target.win.flashFrame(true)
    }
    return null
  })

  api.register('window.setContentProtection', ({ window: w, args }) => {
    const value = Boolean(arg(args, 0))
    resolveWindow(w.deps, w, optional(args, 1)).win.setContentProtection(value)
    return null
  })

  api.register('window.setVisibleOnAllWorkspaces', ({ window: w, args }) => {
    const value = Boolean(arg(args, 0))
    resolveWindow(w.deps, w, optional(args, 1)).win.setVisibleOnAllWorkspaces(value, {
      visibleOnFullScreen: true,
    })
    return null
  })

  /* ---------- 光标 ---------- */

  api.register('window.setCursorIcon', ({ window: w, args }) => {
    const icon = String(arg(args, 0) ?? '')
    const target = resolveWindow(w.deps, w, optional(args, 1))
    const css = CURSOR_CSS[icon] || 'default'
    evalIn(target, `document.documentElement.style.cursor = ${JSON.stringify(css)}`)
    return null
  })

  api.register('window.cursorPosition', () => screen.getCursorScreenPoint())

  api.register('window.setCursorPosition', ({ args }) => {
    warnDegraded('window.setCursorPosition', 'Electron 无移动系统光标的 API，已忽略')
    return null
  })

  api.register('window.setCursorGrab', ({ window: w, args }) => {
    const grab = Boolean(arg(args, 0))
    const target = resolveWindow(w.deps, w, optional(args, 1))
    // 降级：用 Pointer Lock 近似「抓取光标」
    if (grab) evalIn(target, 'document.documentElement.requestPointerLock && document.documentElement.requestPointerLock()')
    else evalIn(target, 'document.exitPointerLock && document.exitPointerLock()')
    warnDegraded('window.setCursorGrab', 'Electron 无窗口级光标抓取 API，降级为 Pointer Lock')
    return null
  })

  api.register('window.setCursorVisible', ({ window: w, args }) => {
    const visible = Boolean(arg(args, 0))
    const target = resolveWindow(w.deps, w, optional(args, 1))
    evalIn(target, `document.documentElement.style.cursor = ${JSON.stringify(visible ? '' : 'none')}`)
    return null
  })

  /* ---------- 拖拽 / 穿透 ---------- */

  api.register('window.dragWindow', () => {
    warnDegraded('window.dragWindow', 'Electron 用 CSS -webkit-app-region: drag 实现，API 侧已忽略')
    return null
  })

  api.register('window.setIgnoreCursorEvents', ({ window: w, args }) => {
    const ignore = Boolean(arg(args, 0))
    resolveWindow(w.deps, w, optional(args, 1)).win.setIgnoreMouseEvents(ignore, { forward: true })
    return null
  })

  /* ---------- 其他 ---------- */

  api.register('window.theme', ({ window: w, args }) => {
    resolveWindow(w.deps, w, optional(args, 0))
    // 原版返回 light | dark | system；Electron 只能区分亮暗，「system」实际不可达
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  })

  api.register('window.blockCloseRequested', ({ window: w, args }) => {
    const blocked = Boolean(arg(args, 0))
    const target = resolveWindow(w.deps, w, optional(args, 1))
    target.blockCloseRequested = blocked
    return null
  })
}

module.exports = { register }
