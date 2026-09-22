'use strict'

/**
 * 主进程 → 渲染进程的事件通道。
 *
 * 原版走 wry 的 `webview.evaluate_script("Niva.__emit__(\"event\", payload)")`
 * （见 window_manager/window.rs::send_ipc_event）。elva 用 executeJavaScript 等价实现，
 * 表达式形式逐字保持，这样注入脚本里的三个 key 派发逻辑完全不用改。
 */

/** 尚未 dom-ready 时排队，避免早期事件被丢掉（原版此处会静默失败，见差异表） */
function send(nivaWindow, expression) {
  if (!nivaWindow || !nivaWindow.win || nivaWindow.win.isDestroyed()) return

  const wc = nivaWindow.win.webContents
  if (wc.isDestroyed()) return

  if (nivaWindow.domReady) {
    wc.executeJavaScript(expression, true).catch(() => {})
    return
  }

  nivaWindow.pendingExpressions.push(expression)
}

function flush(nivaWindow) {
  nivaWindow.domReady = true
  const wc = nivaWindow.win.webContents
  if (wc.isDestroyed()) return
  for (const expression of nivaWindow.pendingExpressions) {
    wc.executeJavaScript(expression, true).catch(() => {})
  }
  nivaWindow.pendingExpressions.length = 0
}

/** 派发一个 Niva 事件（对齐 NivaWindow::send_ipc_event） */
function emitToWindow(nivaWindow, event, payload) {
  const expr = `window.Niva && window.Niva.__emit__(${JSON.stringify(event)}, ${JSON.stringify(
    payload === undefined ? null : payload,
  )})`
  send(nivaWindow, expr)
}

/** 派发一条 IPC 响应（对齐 NivaWindow::send_ipc_callback，走 ipc.callback 事件） */
function sendIpcCallback(nivaWindow, response) {
  emitToWindow(nivaWindow, 'ipc.callback', response)
}

module.exports = { emitToWindow, sendIpcCallback, flush, send }
