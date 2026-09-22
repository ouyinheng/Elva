'use strict'

/**
 * 打包产物的启动入口
 * ============================================================================
 * 这个文件**不在开发/工作台运行时被加载**（`package.json` 的 main 是
 * `electron/main.js`）。它是「构建」功能的产物之一：
 *
 *   build-macos.js 会把整个 `electron/` 目录原样复制到产物的
 *   `<App>.app/Contents/Resources/app/electron/`，并把本文件写成产物的入口。
 *   Electron 启动时读 `Contents/Resources/app/package.json` 的 main，
 *   于是走到这里。
 *
 * 与 `main.js`（工作台入口）的区别：
 *   - 工作台：界面来自 dev server 或 `dist/`，同时提供 Niva 兼容运行时
 *   - 本入口：界面来自**用户项目的资源**（`Contents/Resources/resources/`，
 *     即 elva.json 里 `build.resource` 指向的目录），完全按配置起窗口
 *
 * 资源根不需要显式指定：`createContext()` 未拿到 resourceRoot 时会走
 * `createResource(args, appPath, process.resourcesPath)`，而
 * `process.resourcesPath` 正是 `<App>.app/Contents/Resources` ——
 * 我们把项目资源放在它下面的 `resources/` 里，恰好命中。
 * ============================================================================
 */

const path = require('node:path')
const fs = require('node:fs')
const { app, BrowserWindow, ipcMain, session } = require('electron')

const { createContext } = require('./runtime/context')
const { bootstrap, registerSchemes } = require('./runtime')

// 自定义协议必须在 app ready 之前声明特权
registerSchemes()

/** 配置文件名与 utils.js 的 CONFIG_FILE_NAMES 保持一致（elva 优先，兼容 niva） */
const CONFIG_FILE_NAMES = ['elva.json', 'niva.json']

/** 打包时配置文件放在 `Contents/Resources/app/` 下，即本文件的上一级 */
function readConfig() {
  for (const name of CONFIG_FILE_NAMES) {
    const configPath = path.join(__dirname, '..', name)
    if (fs.existsSync(configPath)) {
      return { name, configPath, config: JSON.parse(fs.readFileSync(configPath, 'utf8')) }
    }
  }
  throw new Error(
    `[elva] 产物里找不到配置文件（${CONFIG_FILE_NAMES.join(' / ')}），无法确定应用配置。`,
  )
}

/** 让工作台状态栏里的「打开文档 / 版本信息」等能力在产物里也可用 */
function registerPackagedIpc(runtime) {
  ipcMain.handle('app:info', () => ({
    name: runtime.ctx.name,
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    v8: process.versions.v8,
    platform: process.platform,
    arch: process.arch,
    isDev: false,
    isProjectMode: true,
    runtime: {
      idName: runtime.ctx.idName,
      apiCount: runtime.api.registry.size,
      baseUrl: `elva://${runtime.ctx.idName}`,
    },
    userData: app.getPath('userData'),
  }))
}

app.whenReady().then(() => {
  // 产物面向最终用户：默认拒绝一切权限请求（与工作台的生产行为一致）
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) =>
    callback(false),
  )

  let runtime
  try {
    const { name, configPath, config } = readConfig()
    runtime = bootstrap(createContext(config))
    console.log(
      `[elva] 运行时就绪 | id_name=${runtime.ctx.idName} | 配置=${name} | API=${runtime.api.registry.size}`,
    )
    console.log(`[elva] 配置文件: ${configPath}`)
    console.log(`[elva] 资源根: ${path.join(process.resourcesPath, 'resources')}`)
  } catch (error) {
    console.error(`[elva] 启动失败: ${error && error.stack ? error.stack : error}`)
    app.quit()
    return
  }

  registerPackagedIpc(runtime)

  // macOS：点 Dock 图标且没有窗口时重新开一个
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      runtime.windows.open(runtime.ctx.options.window || {})
    }
  })
})

/**
 * 与工作台一致：**不注册** window-all-closed → app.quit()。
 * 原版语义是「关闭 id===0 的窗口才退出应用」，退出逻辑在 WindowManager 里。
 */
