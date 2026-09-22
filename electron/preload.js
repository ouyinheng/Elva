const { contextBridge, ipcRenderer } = require('electron')

/**
 * ============================================================================
 * preload 的两件事
 * ============================================================================
 * 1) 暴露 elva 工作台自己用的 electronAPI（具名方法白名单，不做通用透传）
 * 2) 把 Niva 兼容运行时注入**主世界**，让未经改动的 Niva 项目直接能跑
 *
 * 为什么必须注入主世界而不是 preload 的隔离世界：
 *   原版是 wry 的 initialization script，跑在页面自己的 JS 上下文里，
 *   页面脚本能直接读到 window.Niva / window.ipc.postMessage。
 *   而 preload 在 contextIsolation:true 下跑在隔离世界，直接赋值 window.Niva
 *   页面是看不见的。所以用 contextBridge.executeInMainWorld 在**文档开始前**
 *   把这个 IIFE 在主世界执行一遍 —— 时序与原版一致（早于页面脚本）。
 *
 * 为什么不直接把 initialize_script.js 原样抄进来：
 *   原版依赖 wry 预先注入的 window.ipc.postMessage。Electron 没有这个入口，
 *   必须在主世界里先造一个同名同形的 postMessage，再把它接到 ipcRenderer 上。
 *   除此之外的每一行语义都逐条保留（见下方注释编号 1–9）。
 * ============================================================================
 */

const BRIDGE_KEY = '__elvaNivaBridge'

/** 主世界 → 主进程的唯一通道。页面能拿到的只有这一个字符串入口，等价于 wry 的 ipc。 */
contextBridge.exposeInMainWorld(BRIDGE_KEY, {
  postMessage: (payload) => ipcRenderer.send('niva:ipc', payload),
})

/* -------------------------------------------------------------------------- */
/* 1) electronAPI：elva 工作台自身的原生能力（保持原有白名单风格）             */
/* -------------------------------------------------------------------------- */

const electronAPI = {
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    v8: process.versions.v8,
  },
  platform: process.platform,
  arch: process.arch,

  getAppInfo: () => ipcRenderer.invoke('app:info'),
  getRuntimeDir: () => ipcRenderer.invoke('app:runtime-dir'),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  openFile: () => ipcRenderer.invoke('dialog:open-file'),

  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
    close: () => ipcRenderer.send('window:close'),
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
contextBridge.exposeInMainWorld('isElectron', true)

/* -------------------------------------------------------------------------- */
/* 1.5) 文件拖放 → 主进程                                                       */
/* -------------------------------------------------------------------------- */

/**
 * 对齐 builder.rs::with_file_drop_handler（270-307 行）：
 *   Hovered { paths, position } → fileDrop.hovered
 *   Dropped { paths, position } → fileDrop.dropped
 *   Cancelled                   → fileDrop.cancelled（载荷 null）
 *
 * 为什么必须在 preload（隔离世界）里做，而不是注入主世界的那段脚本里：
 *   DOM 的 `drop` 事件里只有 File 对象，**绝对路径**必须用 webUtils.getPathForFile()
 *   才能拿到，而 webUtils 只在 preload/渲染进程侧可用。
 *   主世界里拿不到路径，所以这里解析好路径再转发给主进程按窗口派发。
 *
 * position：原版是 to_logical::<f64>（窗口内逻辑像素），等价于 DOM 的 clientX/clientY。
 * 精简点（记入差异表）：原版按 tao 的 Hovered 频率重复派发，这里只在「路径集合变化」时
 * 派发一次 hovered，避免拖拽过程中每帧一条事件把页面淹掉。
 */
const { webUtils } = require('electron')

function dropPaths(dataTransfer) {
  const out = []
  if (!dataTransfer || !dataTransfer.files) return out
  for (const file of dataTransfer.files) {
    try {
      const resolved = webUtils.getPathForFile(file)
      if (resolved) out.push(resolved)
    } catch (error) {
      /* 不是真实文件（例如拖入文本片段）时忽略 */
    }
  }
  return out
}

let lastHoverKey = null

window.addEventListener(
  'dragover',
  (event) => {
    const paths = dropPaths(event.dataTransfer)
    if (paths.length === 0) return
    event.preventDefault()
    const key = paths.join('\n')
    if (key === lastHoverKey) return
    lastHoverKey = key
    ipcRenderer.send('niva:file-drop', {
      kind: 'hovered',
      paths,
      x: event.clientX,
      y: event.clientY,
    })
  },
  false,
)

window.addEventListener(
  'drop',
  (event) => {
    const paths = dropPaths(event.dataTransfer)
    if (paths.length === 0) return
    event.preventDefault()
    lastHoverKey = null
    ipcRenderer.send('niva:file-drop', {
      kind: 'dropped',
      paths,
      x: event.clientX,
      y: event.clientY,
    })
  },
  false,
)

window.addEventListener(
  'dragleave',
  (event) => {
    // relatedTarget 非空说明只是窗口内部元素之间移动，不算离开窗口
    if (event.relatedTarget) return
    if (lastHoverKey === null) return
    lastHoverKey = null
    ipcRenderer.send('niva:file-drop', { kind: 'cancelled' })
  },
  false,
)

/* -------------------------------------------------------------------------- */
/* 2) Niva 运行时注入主世界                                                     */
/* -------------------------------------------------------------------------- */

/**
 * 逐条对齐 crates/niva/assets/initialize_script.js：
 *
 *  [1] 全局 dragover preventDefault —— 禁用浏览器默认的文件拖入
 *  [2] 事件监听表 add/remove/removeAll
 *  [3] emit 走 setTimeout(...,0) 异步派发，监听器签名 (event, data)
 *  [4] 一次派发按 3 个 key 依次通知：精确 / `ns.*` / `*`，三个都调
 *  [5] 请求格式 [callbackId, "ns.method", argsArray]
 *  [6] 响应格式 [callbackId, code, message, data]；code===0 才 resolve，
 *      否则 **reject 的是整个响应数组**（不是 Error 对象）
 *  [7] 返回的 Promise 上额外挂 .resolve / .reject
 *  [8] delete window.close / window.open（防止网页原生方法干扰）
 *  [9] Niva.__emit__ / Niva.__resolve__ 暴露给主进程调用
 *
 * 有意不做（D2）：
 *  - 原版 `EventListener = removeEventListener` 污染了一个全局变量 → 不保留
 *  - 原版 Rust 侧 callbackId 是 u8（超过 255 次调用会反序列化失败）→ 不保留该上限
 */
function installNivaRuntime(bridgeKey) {
  // 先造出与 wry 同名同形的入口，脚本自身与用户代码都会用它
  window.ipc = {
    postMessage: function (payload) {
      window[bridgeKey].postMessage(payload)
    },
  }

  // [1]
  window.addEventListener('dragover', function (ev) { ev.preventDefault() }, false)

  var Niva = {}

  // [2] === 事件 ===
  var eventListeners = {}

  function addEventListener(event, listener) {
    if (!eventListeners[event]) {
      eventListeners[event] = []
    }
    eventListeners[event].push(listener)
  }

  function removeEventListener(event, listener) {
    if (!eventListeners[event]) {
      return
    }
    var listeners = eventListeners[event]
    var newListeners = []
    for (var i = 0; i < listeners.length; i++) {
      if (listeners[i] !== listener) {
        newListeners.push(listeners[i])
      }
    }
    eventListeners[event] = newListeners
  }

  function removeAllEventListeners(event) {
    if (!eventListeners[event]) {
      return
    }
    eventListeners[event] = []
  }

  // [3][4]
  function emit(event, data) {
    setTimeout(function () {
      var keys = [event, event.split('.')[0] + '.*', '*']

      for (var i = 0; i < keys.length; i++) {
        var key = keys[i]

        if (eventListeners[key]) {
          var listeners = eventListeners[key]
          for (var j = 0; j < listeners.length; j++) {
            listeners[j](event, data)
          }
        }
      }
    }, 0)
  }

  Niva.addEventListener = addEventListener
  Niva.removeEventListener = removeEventListener
  Niva.removeAllEventListeners = removeAllEventListeners
  Niva.__emit__ = emit

  // [5] === API 调用 ===
  var getNextCallbackId = (function () {
    var callbackId = 0
    return function () {
      if (callbackId >= Number.MAX_SAFE_INTEGER) {
        callbackId = 0
      }
      return ++callbackId
    }
  })()

  var callbacks = {}

  function call(method, args) {
    var callbackId = getNextCallbackId()
    window.ipc.postMessage(
      JSON.stringify([callbackId, method, args]),
    )

    // [7]
    var _resolve, _reject
    var promise = new Promise(function (resolve, reject) {
      _resolve = resolve
      _reject = reject
    })
    promise.resolve = _resolve
    promise.reject = _reject

    callbacks[callbackId] = promise
    return promise
  }

  // [6]
  function resolve(response) {
    setTimeout(function () {
      var callbackId = response[0]
      var code = response[1]
      var data = response[3]

      var promise = callbacks[callbackId]
      if (promise) {
        if (code === 0) {
          promise.resolve(data)
        } else {
          promise.reject(response)
        }
        delete callbacks[callbackId]
      }
    }, 0)
  }

  if (typeof Proxy !== 'undefined') {
    Niva.api = new Proxy(
      {},
      {
        get: function (_, namespace) {
          return new Proxy(
            {},
            {
              get: function (_, method) {
                return function () {
                  return Niva.call(namespace + '.' + method, Array.prototype.slice.call(arguments))
                }
              },
            },
          )
        },
      },
    )
  } else {
    console.log('Proxy not supported, please use Niva.call instead')
  }

  Niva.call = call
  Niva.__resolve__ = resolve

  Niva.addEventListener('ipc.callback', function (event, response) {
    Niva.__resolve__(response)
  })

  // [8]
  try {
    delete window.close
    delete window.open
  } catch (error) {
    /* 某些上下文里这两个属性不可配置，忽略即可 */
  }

  // [9]
  window.Niva = Niva
  // 与 Niva 同构的别名（D1：原版项目零改动可跑，新项目也可以用 Elva 这个名字）
  window.Elva = Niva
  console.log('Niva loaded')
}

// contextBridge.executeInMainWorld 会把函数源码在主世界求值后执行，
// 闭包不会带过去，所以 bridgeKey 必须作为参数传入。
contextBridge.executeInMainWorld({ func: installNivaRuntime, args: [BRIDGE_KEY] })
