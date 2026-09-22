/**
 * 渲染进程入口
 *
 * 1. 屏蔽右键菜单与 Ctrl+R（桌面应用不做浏览器那套）
 * 2. 事件与 API 调用日志：**仅开发模式**打印（生产静默，避免控制台噪音与无谓开销）
 * 3. window.blockCloseRequested(true) —— 关闭按钮改为走 window.closeRequested 事件，
 *    由 AppModel 决定是否真的退出（有未保存改动/模态框时会拦下来）
 *
 * 注意第 3 条会拦截窗口 close，而 Electron 的 `app.quit()` 也是靠关窗实现的：
 * 渲染层在确认退出后必须调用 `window.close()`（id=0），主进程侧会先放行再 quit
 * （见 electron/runtime/windows.js 的 quitConfirmed 说明）。**不要改成直接 app.quit()**，
 * 那会形成关不掉的死循环。
 *
 * 最后等环境预取（baseFileSystemUrl / sep / dirs / currentDir）完成后才挂载，
 * 因为 pathJoin 等工具依赖 sep。
 */

import { createApp } from 'vue'

import './assets/devtools/base.css'
import './assets/devtools/app.css'
import './assets/devtools/pages.css'

import App from './App.vue'
import { envReady } from './devtools/utils'

const isDev = import.meta.env.DEV

window.addEventListener('contextmenu', (event) => {
  event.preventDefault()
})

window.addEventListener('keydown', (event) => {
  if (event.key === 'r' && event.ctrlKey) {
    event.preventDefault()
  }
})

if (isDev) {
  Niva.addEventListener('*', (event, data) => {
    console.log(`[Event] ${event}`, data)
  })

  const _call = Niva.call
  Niva.call = function (method, args) {
    console.log(`[Call] ${method}`, args)
    return _call.call(Niva, method, args)
  }
}

Niva.api.window.blockCloseRequested(true)

const app = createApp(App)

envReady(() => app.mount('#app'))
