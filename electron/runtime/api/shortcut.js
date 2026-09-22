'use strict'

const { arg, optional } = require('./helpers')

/**
 * shortcut 命名空间 —— 4 个方法，对齐 crates/niva/src/app/api/shortcut.rs
 *
 * 参数约定（照做）：window_id 省略时用**调用方窗口**的 id。
 */
function register(api) {
  api.registerEvent('shortcut.register', ({ window: w, args, deps }) => {
    const accelerator = String(arg(args, 0))
    const windowId = optional(args, 1) === null ? w.id : Number(args[1])
    return deps.shortcuts.register(windowId, accelerator)
  })

  api.registerEvent('shortcut.unregister', ({ window: w, args, deps }) => {
    const id = Number(arg(args, 0))
    const windowId = optional(args, 1) === null ? w.id : Number(args[1])
    deps.shortcuts.unregister(windowId, id)
    return null
  })

  api.registerEvent('shortcut.unregisterAll', ({ window: w, args, deps }) => {
    const windowId = optional(args, 0) === null ? w.id : Number(args[0])
    deps.shortcuts.unregisterAll(windowId)
    return null
  })

  api.registerEvent('shortcut.list', ({ window: w, args, deps }) => {
    const windowId = optional(args, 0) === null ? w.id : Number(args[0])
    return deps.shortcuts.list(windowId)
  })
}

module.exports = { register }
