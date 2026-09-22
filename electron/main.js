'use strict'

const path = require('node:path')
const { app, BrowserWindow, ipcMain, dialog, shell, session } = require('electron')

const { createContext } = require('./runtime/context')
const { bootstrap, registerSchemes } = require('./runtime')
const { parseArguments } = require('./runtime/options')

/* ------------------------------------------------------------------ *
 * 自定义协议必须在 app ready 之前声明特权，否则 elva:// 拿不到 hostname
 * ------------------------------------------------------------------ */
registerSchemes()

const isDev = process.argv.includes('--dev')
const DEV_SERVER_URL = 'http://127.0.0.1:5173'
const args = parseArguments()

/**
 * 两种运行模式（与 Niva 自己的形态对齐：Niva 的开发者工具本身就是一个 Niva 项目）
 *
 *   项目模式：给了 --debug-config / --debug-resource
 *            → 完全按 niva.json 起窗口，就是原版 Niva 的运行时行为
 *   工作台模式：否则
 *            → 起 elva 自己的界面（dev server 或 dist），同时运行时也可用
 *
 * 判定与原版 NivaArguments 一致：这三个参数就是原版用来「以调试方式跑某项目」的入口。
 */
const isProjectMode = Boolean(args.debugConfig || args.debugResource)

/**
 * 工作台的窗口配置。
 *
 * 字段与原版 `packages/devtools/niva.json` 对应（窗口尺寸、无边框策略），
 * 但**标题栏策略按平台分开** —— 这是刻意偏离原版的一处改进：
 *
 *   macOS：`titleBarButtonsHidden: false`
 *        → 保留系统原生红绿灯。mac 会把它们固定在左上角，位置/间距/hover 行为
 *          都由系统负责，自绘反而不准（且会与系统那套重叠）。标题栏透明 +
 *          内容充满，视觉上仍是一体化的自绘外观。
 *   Windows：`decorations: false`
 *        → 没有系统原生按钮，必须自绘 Minimize / Maximize / Close。
 *
 * 另外两处既定差异：
 *   - name/uuid 用 elva 自己的（id_name 稳定为 elva_00000000，data_dir 不会漂）
 *   - devtools 跟随 --dev：开发时自动开调试面板，生产关闭
 */
function workbenchOptions() {
  return {
    name: 'elva',
    uuid: '00000000-0000-0000-0000-000000000000',
    window: {
      title: 'Elva',
      icon: 'logo.png',
      size: { width: 900, height: 600 },
      minSize: { width: 720, height: 480 },
      resizable: true,
      // 必须显式给 true：macOS 上窗口不可缩放时绿色按钮不会做「缩放（zoom）」，
      // 表现就是「点了没反应 / 只是动了一下」。
      maximizable: true,
      minimizable: true,
      devtools: isDev,
      // 与页面背景一致，消除启动时的白闪
      backgroundColor: '#ffffff',
    },
    macos: {
      window: {
        titleBarTransparent: true,
        // 关键：**不隐藏**系统红绿灯，交由 macOS 固定在左上角
        titleBarButtonsHidden: false,
        titleHidden: true,
        fullSizeContentView: true,
      },
    },
    windows: {
      window: {
        undecoratedShadow: true,
        decorations: false,
      },
    },
    shortcuts: [],
    tray: null,
  }
}

/* ------------------------------------------------------------------ *
 * 工作台自身的 IPC（渲染进程只能通过 preload 的白名单方法触达）
 * ------------------------------------------------------------------ */

function registerWorkbenchIpc(runtime) {
  const currentWindow = () => {
    try {
      return runtime.windows.get(0)
    } catch {
      return null
    }
  }

  ipcMain.handle('app:info', () => ({
    name: runtime.ctx.name,
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    v8: process.versions.v8,
    platform: process.platform,
    arch: process.arch,
    isDev,
    isProjectMode,
    // 兼容运行时信息（elva 自己实现的那套 Niva 兼容层）
    runtime: {
      idName: runtime.ctx.idName,
      apiCount: runtime.api.registry.size,
      workers: runtime.ctx.workers,
      baseUrl: `elva://${runtime.ctx.idName}`,
    },
    userData: app.getPath('userData'),
  }))

  ipcMain.handle('app:open-external', async (_event, url) => {
    // 只放行 http/https，避免被 file:// 或自定义协议利用
    if (typeof url !== 'string' || !/^https?:\/\//.test(url)) {
      throw new Error(`拒绝打开非 http(s) 链接: ${url}`)
    }
    await shell.openExternal(url)
    return true
  })

  /**
   * elva 自己的工作台目录（`<repo>/app`）。
   *
   * 构建一个能双击运行的 .app 时，需要把 elva 的运行时（`electron/` 目录）
   * 装进产物的 `Contents/Resources/app/`。渲染进程无法从 exe 路径推出这个位置，
   * 所以由主进程给出 —— 它就在 main.js 的上一级，稳定且与打包形态无关。
   */
  ipcMain.handle('app:runtime-dir', () => path.join(__dirname, '..'))

  ipcMain.handle('dialog:open-file', async () => {
    const target = currentWindow()
    const { canceled, filePaths } = await dialog.showOpenDialog(target ? target.win : undefined, {
      title: '选择一个文件',
      properties: ['openFile'],
    })
    return canceled ? null : filePaths[0]
  })

  ipcMain.on('window:minimize', () => currentWindow()?.win.minimize())
  ipcMain.on('window:toggle-maximize', () => {
    const target = currentWindow()
    if (!target) return
    target.win.isMaximized() ? target.win.unmaximize() : target.win.maximize()
  })
  ipcMain.on('window:close', () => currentWindow()?.win.close())
}

/* ------------------------------------------------------------------ *
 * 启动
 * ------------------------------------------------------------------ */

app.whenReady().then(() => {
  // 生产环境下收紧权限：默认全部拒绝，需要什么再单独放行
  if (!isDev) {
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) =>
      callback(false),
    )
  }

  let runtime
  try {
    const ctx = isProjectMode
      ? createContext()
      : createContext(workbenchOptions(), {
          resourceRoot: path.join(__dirname, '..', 'dist'),
          debugEntry: isDev ? DEV_SERVER_URL : null,
        })
    runtime = bootstrap(ctx)
  } catch (error) {
    console.error(`[elva] 启动失败: ${error && error.stack ? error.stack : error}`)
    app.quit()
    return
  }

  registerWorkbenchIpc(runtime)

  console.log(
    `[elva] 运行时就绪 | 模式=${isProjectMode ? '项目' : '工作台'} | id_name=${runtime.ctx.idName} | API=${runtime.api.registry.size} | workers=${runtime.ctx.workers}`,
  )

  // macOS：点 Dock 图标且没有窗口时重新开一个
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) runtime.windows.open(runtime.ctx.options.window || {})
  })
})

/**
 * 注意：这里**故意不注册** window-all-closed → app.quit()。
 * 原版 Niva 的语义是「关闭 id===0 的窗口才退出应用」（window.rs::close 里 ControlFlow::Exit），
 * 所以退出逻辑在 WindowManager 里按窗口 id 判定，不在这里兜底。
 */
