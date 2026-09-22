'use strict'

/**
 * webview 命名空间 —— 5 个方法，对齐 crates/niva/src/app/api/webview.rs
 *
 * baseUrl() 的形态是 D4 决策点：原版 macOS 返回 `niva://{id_name}`、
 * Windows 返回 `https://niva.{id_name}`（WebView2 的限制导致的不一致）。
 * elva 没有这个限制，统一用自有 scheme `elva://{id_name}` —— 返回值与原版不同，
 * 已作为**已知差异**记入 docs/niva-parity.md。
 */

function register(api) {
  api.registerEvent('webview.isDevtoolsOpen', ({ window: w }) => w.win.webContents.isDevToolsOpened())

  api.registerEvent('webview.openDevtools', ({ window: w }) => {
    if (!w.win.webContents.isDevToolsOpened()) w.win.webContents.openDevTools({ mode: 'detach' })
    return null
  })

  api.registerEvent('webview.closeDevtools', ({ window: w }) => {
    w.win.webContents.closeDevTools()
    return null
  })

  api.register('webview.baseUrl', ({ ctx }) => `elva://${ctx.idName}`)

  api.register('webview.baseFileSystemUrl', () => 'elva://filesystem')
}

module.exports = { register }
