'use strict'

const { clipboard } = require('electron')

const { arg } = require('./helpers')

/**
 * clipboard 命名空间 —— 2 个方法，对齐 crates/niva/src/app/api/clipboard.rs
 *
 * 关键点：`read()` 在剪贴板里**没有文本内容**时返回 `null`（原版是 Option<String>）。
 *
 * ⚠️ 实测差异：Electron 44 的 clipboard 模块已经换成 W3C 异步 API
 *    （只有 clear / has / read / readText / write / writeText，且都返回 Promise），
 *    老版的同步 `availableFormats()` 已经不存在了。
 *    所以这里按「新 API 优先、老 API 兜底」写，两种 Electron 版本都能跑。
 *    —— 已记入 docs/niva-parity.md。
 */

async function hasPlainText() {
  if (typeof clipboard.has === 'function') {
    try {
      return await clipboard.has('text/plain')
    } catch {
      return false
    }
  }
  if (typeof clipboard.availableFormats === 'function') {
    const formats = clipboard.availableFormats()
    return formats.some(
      (format) => format === 'text/plain' || format === 'text/plain;charset=utf-8',
    )
  }
  return false
}

function register(api) {
  api.registerEvent('clipboard.read', async () => {
    try {
      if (!(await hasPlainText())) return null
      if (typeof clipboard.readText === 'function') {
        const text = await clipboard.readText()
        return typeof text === 'string' ? text : null
      }
      // 老版同步 API
      const text = clipboard.readText()
      return text === '' ? null : text
    } catch {
      // 原版读取失败会 reject；这里保持「拿不到就是没有」的宽松语义，避免调用方炸掉
      return null
    }
  })

  api.registerEvent('clipboard.write', async ({ args }) => {
    const text = String(arg(args, 0) ?? '')
    await clipboard.writeText(text)
    return null
  })
}

module.exports = { register }
