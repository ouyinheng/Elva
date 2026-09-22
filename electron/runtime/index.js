'use strict'

const { app, ipcMain, protocol, nativeTheme } = require('electron')

const { ApiManager } = require('./api-manager')
const { registerAll } = require('./api')
const { WindowManager } = require('./windows')
const { ShortcutManager } = require('./shortcut')
const { TrayManager } = require('./tray')
const { emitToWindow } = require('./events')
const { guessMime } = require('./mime')

/**
 * 运行时总装 —— 对齐 crates/niva/src/app/mod.rs::NivaApp
 *
 * 对应关系：
 *   NivaApp::new        → 构造 context / 三个 manager / 注册全部 API
 *   NivaApp::run        → 开主窗口 → 注册配置里的快捷键 → 建配置里的托盘 → 跑事件循环
 *   ApiManager::call    → ipcMain.on('niva:ipc')
 *   with_custom_protocol→ protocol.handle('elva')
 */

/**
 * 自定义协议特权声明。**必须在 app ready 之前调用**，
 * 否则 elva:// 不会按 standard scheme 解析（拿不到 hostname，相对路径也会失效）。
 */
function registerSchemes() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'elva',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ])
}

/**
 * 自定义协议处理器 —— 对齐 builder.rs::build_webview 里的 with_custom_protocol
 *
 * 规则照做：
 *   host === id_name    → 从资源根读（path 以 / 结尾时补 index.html）
 *   host === 'filesystem'→ 读本地绝对路径
 *   其它 host           → 404
 *   MIME 未知回落 text/plain；带 Access-Control-Allow-Origin
 */
function createProtocolHandler(ctx) {
  return async (request) => {
    let url
    try {
      url = new URL(request.url)
    } catch {
      return new Response('bad request', { status: 400 })
    }

    const host = url.hostname || ''
    let pathname = decodeURIComponent(url.pathname)
    if (pathname.endsWith('/')) pathname += 'index.html'
    if (!pathname || pathname === '/') pathname = 'index.html'

    const origin = url.origin || '*'
    const relative = pathname.replace(/^\//, '')

    const notFound = (message) =>
      new Response(message, {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })

    try {
      if (host === ctx.idName) {
        if (!ctx.resource.exists(relative)) return notFound('File not found.')
        const data = ctx.resource.load(relative)
        return new Response(data, {
          status: 200,
          headers: {
            'Content-Type': guessMime(relative),
            'Access-Control-Allow-Origin': origin,
          },
        })
      }

      if (host === 'filesystem') {
        const fs = require('node:fs')
        // Windows 上原版会剥掉前导 '/'，macOS 直接用原路径
        const absolute =
          process.platform === 'win32' ? pathname.replace(/^\//, '') : pathname
        if (!fs.existsSync(absolute)) return notFound('File not found.')
        const data = fs.readFileSync(absolute)
        return new Response(data, {
          status: 200,
          headers: {
            'Content-Type': guessMime(absolute),
            'Access-Control-Allow-Origin': origin,
          },
        })
      }

      return notFound(`Invalid hostname: ${host}`)
    } catch (error) {
      return notFound(error.message)
    }
  }
}

/**
 * 启动运行时，返回运行时句柄。
 * @param {import('./context').NivaContext} ctx
 */
function bootstrap(ctx) {
  let shortcuts = null
  let trays = null

  /** 统一事件出口：允许传窗口 id 或 NivaWindow（对齐 NivaWindow::send_ipc_event） */
  const emit = (target, event, payload) => {
    let nivaWindow = target
    if (typeof target === 'number') {
      if (!windows.has(target)) return
      nivaWindow = windows.get(target)
    }
    if (!nivaWindow) return
    emitToWindow(nivaWindow, event, payload)
  }

  const deps = { ctx, windows: null, shortcuts: null, trays: null, emit }

  /* 三个 manager。关闭窗口时连带清理它的快捷键与托盘
     （对齐 WindowManager::close_window 里的 unregister_all / destroy_all） */
  shortcuts = new ShortcutManager({ emit })
  trays = new TrayManager({ emit, loadIcon: (iconPath) => ctx.resource.loadIcon(iconPath) })

  const windows = new WindowManager(ctx, {
    onClose: (id) => {
      try {
        shortcuts.unregisterAll(id)
      } catch {
        /* 该窗口没有快捷键 */
      }
      try {
        trays.destroyAll(id)
      } catch {
        /* 该窗口没有托盘 */
      }
    },
    // 对齐 event_handler.rs:74-77：WindowEvent::Focused → switch_menu()（仅 macOS 有意义）。
    // 这是 macOS 应用级菜单栏的补偿动作：窗口重新获得焦点时把菜单切回自己那一份。
    onFocus: (nivaWindow) => {
      try {
        nivaWindow.switchMenu()
      } catch (error) {
        console.warn(`[elva:niva] 切换菜单失败: ${error.message}`)
      }
    },
  })

  deps.windows = windows
  deps.shortcuts = shortcuts
  deps.trays = trays
  windows.deps = deps

  /* API 注册（136 个方法） */
  const api = new ApiManager(ctx, deps)
  registerAll(api)

  /* IPC 入口 —— 对齐 builder.rs::build_webview 的 with_ipc_handler */
  ipcMain.on('niva:ipc', (event, requestStr) => {
    let nivaWindow
    try {
      nivaWindow = windows.getByWebContents(event.sender.id)
    } catch {
      return
    }
    try {
      api.call(nivaWindow, requestStr)
    } catch (error) {
      // 对齐原版：派发一条 { "ipc.error": msg } 的 callback
      emitToWindow(nivaWindow, 'ipc.callback', { 'ipc.error': error.message })
    }
  })

  /* 文件拖放 —— 对齐 builder.rs::with_file_drop_handler（270-307 行）
     绝对路径只能在 renderer 侧用 webUtils 解析，所以 preload 收 DOM 事件后转发到这里，
     再按窗口派发与原版同名同形的三个事件。 */
  ipcMain.on('niva:file-drop', (event, payload) => {
    let nivaWindow
    try {
      nivaWindow = windows.getByWebContents(event.sender.id)
    } catch {
      return
    }
    if (!payload || typeof payload !== 'object') return

    if (payload.kind === 'cancelled') {
      emitToWindow(nivaWindow, 'fileDrop.cancelled', null)
      return
    }

    const paths = Array.isArray(payload.paths) ? payload.paths : []
    if (paths.length === 0) return
    // 原版是 to_logical::<f64>，即「窗口内的逻辑像素」，等价于 DOM 的 clientX/clientY
    const position = { x: Number(payload.x) || 0, y: Number(payload.y) || 0 }
    emitToWindow(
      nivaWindow,
      payload.kind === 'dropped' ? 'fileDrop.dropped' : 'fileDrop.hovered',
      { paths, position },
    )
  })

  /* 系统主题变化 —— 对齐 event_handler.rs::handle_window_event 的 ThemeChanged 分支
     （原版把 tao::window::Theme 映射成 "dark" | "light" | "system" 后逐窗口派发）。
     Electron 的 nativeTheme 是应用级的，所以这里给所有窗口各发一份。 */
  nativeTheme.on('updated', () => {
    const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
    for (const nivaWindow of windows.list()) {
      emitToWindow(nivaWindow, 'window.themeChanged', theme)
    }
  })

  /* 自定义协议 */
  protocol.handle('elva', createProtocolHandler(ctx))

  /* 开主窗口（对齐 NivaApp::run） */
  const mainWindow = windows.open(ctx.options.window || {})

  /* 配置里的全局快捷键 */
  const shortcutOptions = ctx.options.shortcuts
  if (Array.isArray(shortcutOptions)) {
    for (const item of shortcutOptions) {
      try {
        shortcuts.registerWithId(mainWindow.id, Number(item.id) & 0xff, item.accelerator)
      } catch (error) {
        console.warn(`[elva:niva] 启动快捷键失败 (id=${item.id}): ${error.message}`)
      }
    }
  }

  /* 配置里的托盘 */
  if (ctx.options.tray) {
    try {
      trays.create(mainWindow.id, ctx.options.tray, mainWindow)
    } catch (error) {
      console.warn(`[elva:niva] 创建托盘失败: ${error.message}`)
    }
  }

  return { ctx, deps, api, windows, shortcuts, trays, mainWindow }
}

module.exports = { bootstrap, registerSchemes, createProtocolHandler }
