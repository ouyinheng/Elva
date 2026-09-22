'use strict'

/**
 * 参数取值辅助 —— 对齐 crates/niva/src/app/api_manager/mod.rs 的
 * ApiArguments::single / optional / get 三种取法。
 *
 * Rust 侧 `Option<T>` 对 `null` 和「缺失」都反序列化成 None，
 * 所以 JS 侧也要把 undefined 与 null 视为同一种「未提供」。
 */

/** 位置参数（缺失视为 null） */
function arg(args, index) {
  const value = args[index]
  return value === undefined ? null : value
}

/** Option 语义：null / undefined 都是「未提供」 */
function optional(args, index) {
  const value = args[index]
  return value === undefined || value === null ? null : value
}

/** 必填参数：缺失直接抛错（对应 serde 反序列化失败 → -1 响应） */
function required(args, index, name) {
  const value = optional(args, index)
  if (value === null) throw new Error(`缺少必填参数: ${name || index}`)
  return value
}

/** 解析目标窗口：给了 id 就取那个，否则用调用方窗口（对齐 macro_rules! match_window） */
function resolveWindow(deps, currentWindow, id) {
  const target = optional([id], 0)
  if (target === null) return currentWindow
  // deps 缺失时不能静默返回调用方窗口 —— 原版这种情况下会因找不到窗口而报错
  if (!deps || !deps.windows) throw new Error(`Window ${target} not found`)
  return deps.windows.get(target)
}

/** 把布尔值收敛成 Boolean（原版是强类型 bool，收到非布尔会直接反序列化失败） */
function toBoolean(value, name) {
  if (typeof value !== 'boolean') throw new Error(`参数 ${name || ''} 必须是布尔值`)
  return value
}

/** u8 收敛 */
function toU8(value, name) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 255) {
    throw new Error(`参数 ${name || ''} 必须是 0-255 的整数`)
  }
  return value
}

module.exports = { arg, optional, required, resolveWindow, toBoolean, toU8 }
