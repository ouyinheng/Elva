'use strict'

/**
 * glob 匹配 —— 对齐 Rust `glob` crate 的 Pattern::matches 语义。
 *
 * 原版 fs.readDirAll 用 `Pattern::new(exclude)` + `pattern.matches(path_str)`，
 * 匹配的是**整条绝对路径**。glob crate 默认 `*` 不跨 `/`，`**` 才跨目录。
 */
function globToRegExp(pattern) {
  let out = '^'
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i]

    if (ch === '*') {
      const next = pattern[i + 1]
      if (next === '*') {
        out += '.*'
        i += 1
      } else {
        out += '[^/]*'
      }
      continue
    }

    if (ch === '?') {
      out += '[^/]'
      continue
    }

    if (ch === '[') {
      const close = pattern.indexOf(']', i + 1)
      if (close !== -1) {
        let body = pattern.slice(i + 1, close)
        if (body.startsWith('!')) body = `^${body.slice(1)}`
        out += `[${body}]`
        i = close
        continue
      }
    }

    out += ch.replace(/[.+^${}()|\\]/g, '\\$&')
  }
  out += '$'
  return new RegExp(out)
}

class GlobPattern {
  constructor(pattern) {
    this.pattern = pattern
    this.regexp = globToRegExp(pattern)
  }

  matches(value) {
    return this.regexp.test(value)
  }
}

module.exports = { GlobPattern, globToRegExp }
