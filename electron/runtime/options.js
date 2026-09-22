'use strict'

/**
 * 配置系统 —— 对齐 crates/niva/src/app/mod.rs (NivaArguments / NivaLaunchInfo)
 *            与 crates/niva/src/app/utils.rs (merge_values)
 */

/**
 * 递归 merge（对齐 utils.rs::merge_values）。
 *
 * 原版规则：
 *   (Null, src)        => src
 *   (dest, Null)       => dest
 *   (Object, Object)   => 逐键递归，src 的每个键覆盖到 dest
 *   (_, src)           => src        ← 数组是整体替换，不是逐项合并
 */
function mergeValues(dest, src) {
  const destNull = dest === null || dest === undefined
  const srcNull = src === null || src === undefined
  if (destNull) return src
  if (srcNull) return dest

  const destIsPlain = typeof dest === 'object' && !Array.isArray(dest)
  const srcIsPlain = typeof src === 'object' && !Array.isArray(src)
  if (!destIsPlain || !srcIsPlain) return src

  const out = { ...dest }
  for (const key of Object.keys(src)) {
    out[key] = mergeValues(
      Object.prototype.hasOwnProperty.call(dest, key) ? dest[key] : null,
      src[key],
    )
  }
  return out
}

/**
 * 命令行参数解析（对齐 NivaArguments::new）。
 * 只认 `--key=value` 形式；`--key` 无值时 value 为空字符串。
 */
function parseArguments(argv = process.argv) {
  const map = new Map()
  for (const arg of argv.slice(1)) {
    if (!arg.startsWith('--')) continue
    const idx = arg.indexOf('=')
    const key = (idx === -1 ? arg : arg.slice(0, idx)).replace(/^--/, '')
    const value = idx === -1 ? '' : arg.slice(idx + 1)
    map.set(key, value)
  }

  return {
    debugDevtools: map.get('debug-devtools') === 'true',
    debugConfig: map.has('debug-config') ? map.get('debug-config') : null,
    debugResource: map.has('debug-resource') ? map.get('debug-resource') : null,
    debugEntry: map.has('debug-entry') ? map.get('debug-entry') : null,
  }
}

/**
 * 原版用 std::env::consts::OS 作为平台键，取值是 "macos" / "windows" / "linux"。
 * 所以 niva.json 里的覆盖段写的是 "macos" / "windows"。
 */
function platformKey() {
  if (process.platform === 'darwin') return 'macos'
  if (process.platform === 'win32') return 'windows'
  return 'linux'
}

/**
 * 解析 niva.json（对齐 NivaLaunchInfo::new 的 options 构建部分）。
 * @param {object} raw 已 JSON.parse 的 niva.json
 */
function resolvePlatformOptions(raw) {
  const platform = platformKey()
  const platformOptions = raw ? raw[platform] : null
  return platformOptions ? mergeValues(raw, platformOptions) : raw
}

/** url_join（对齐 utils.rs::url_join） */
function urlJoin(left, right) {
  if (!right) return left
  if (left.endsWith('/')) return `${left}${right}`
  return `${left}/${right}`
}

/** 取 scheme://host 前缀，用于导航白名单（对齐 window_manager/url.rs::get_host_from_url） */
function getHostFromUrl(url) {
  try {
    const parsed = new URL(url)
    return `${parsed.protocol}//${parsed.host}`
  } catch {
    return null
  }
}

module.exports = {
  mergeValues,
  parseArguments,
  platformKey,
  resolvePlatformOptions,
  urlJoin,
  getHostFromUrl,
}
