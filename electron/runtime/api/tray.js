'use strict'

const { arg, optional } = require('./helpers')

/**
 * tray 命名空间 —— 5 个方法，对齐 crates/niva/src/app/api/tray.rs
 *
 * 参数约定（照做）：window_id 省略时用**调用方窗口**的 id，
 * 且 destroy/update 会校验该 id 是否为托盘的归属窗口。
 */
function register(api) {
  api.registerEvent('tray.create', ({ window: w, args, deps }) => {
    const options = arg(args, 0) || {}
    const windowId = optional(args, 1) === null ? w.id : Number(args[1])
    return deps.trays.create(windowId, options, w)
  })

  api.registerEvent('tray.destroy', ({ window: w, args, deps }) => {
    const id = Number(arg(args, 0))
    const windowId = optional(args, 1) === null ? w.id : Number(args[1])
    deps.trays.destroy(windowId, id)
    return null
  })

  api.registerEvent('tray.destroyAll', ({ window: w, args, deps }) => {
    const windowId = optional(args, 0) === null ? w.id : Number(args[0])
    deps.trays.destroyAll(windowId)
    return null
  })

  api.registerEvent('tray.list', ({ window: w, args, deps }) => {
    const windowId = optional(args, 0) === null ? w.id : Number(args[0])
    return deps.trays.list(windowId)
  })

  api.registerEvent('tray.update', ({ window: w, args, deps }) => {
    const id = Number(arg(args, 0))
    const options = arg(args, 1) || {}
    const windowId = optional(args, 2) === null ? w.id : Number(args[2])
    deps.trays.update(windowId, id, options)
    return null
  })
}

module.exports = { register }
