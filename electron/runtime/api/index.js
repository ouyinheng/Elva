'use strict'

/**
 * API 注册总表 —— 对齐 crates/niva/src/app/api/mod.rs::register_api_instances
 *
 * 注册顺序与原版保持一致（原版也是这个顺序），便于逐条比对。
 */

const namespaces = [
  require('./dialog'),
  require('./window'),
  require('./fs'),
  require('./http'),
  require('./os'),
  require('./process'),
  require('./webview'),
  require('./resource'),
  require('./clipboard'),
  require('./shortcut'),
  require('./tray'),
  require('./monitor'),
  require('./extra'),
  require('./window-extra'),
]

function registerAll(api) {
  for (const namespace of namespaces) namespace.register(api)
}

module.exports = { registerAll }
