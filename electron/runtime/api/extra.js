'use strict'

const { execFileSync } = require('node:child_process')
const { app } = require('electron')

const { arg } = require('./helpers')

/**
 * extra 命名空间 —— 对齐 crates/niva/src/app/api/extra.rs
 *
 * ⚠️ 这是整个框架「效率工具」场景的命脉：记住「唤起前你在用哪个软件」，
 *    隐藏自己后把焦点还给那个软件（见 packages/examples/simple-project/index.js）。
 *
 * Electron 没有「获取前台应用」的公开 API，只能走 osascript + System Events。
 * 代价：需要用户在「系统设置 → 隐私与安全性 → 自动化」里授予权限，
 * 且单次调用约 100–300ms。授权被拒时 osascript 会报错 —— 此时返回 null，
 * 与原版 get_active_window 失败返回 None 的行为一致（不让调用方炸掉）。
 *
 * 另：原版 macOS 的 focus_by_window_id 返回值语义是**反的**
 *     （激活失败时 `return Ok(true)`，见 extra.rs:97-102），
 *     按 D2「修复 + 记录」处理：这里返回「真的成功了才 true」。
 */

function osascript(script) {
  const out = execFileSync('osascript', ['-e', script], {
    encoding: 'utf8',
    timeout: 5000,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  return String(out).trim()
}

function macOnly(api) {
  api.registerAsync('extra.getActiveWindowId', async () => {
    try {
      const raw = osascript(
        'tell application "System Events" to get unix id of first application process whose frontmost is true',
      )
      const pid = Number(raw)
      if (!Number.isFinite(pid)) return null
      // 原版格式是 `process_id_window_id`。Electron 拿不到其它进程的窗口 id，
      // 所以 window_id 恒为 0 —— 已记入差异表。
      return `${pid}_0`
    } catch {
      return null
    }
  })

  api.registerAsync('extra.focusByWindowId', async ({ args }) => {
    const idString = String(arg(args, 0))
    const parts = idString.split('_')
    if (parts.length !== 2) throw new Error('invalid window id')

    const pid = Number(parts[0])
    if (!Number.isFinite(pid)) throw new Error('invalid window id')

    try {
      osascript(
        `tell application "System Events" to set frontmost of (first application process whose unix id is ${pid}) to true`,
      )
      return true
    } catch {
      return false
    }
  })

  api.registerEvent('extra.hideApplication', () => {
    app.hide()
    return null
  })

  api.registerEvent('extra.showApplication', () => {
    app.show()
    return null
  })

  // 原版注册名是复数 hideOtherApplications，类型声明写的是单数 → 两个都注册（D2）
  const hideOthers = () => {
    try {
      osascript(
        `tell application "System Events" to set visible of (every process whose visible is true and unix id is not ${process.pid}) to false`,
      )
    } catch (error) {
      console.warn(`[elva:niva] extra.hideOtherApplications 失败（多为缺少自动化权限）: ${error.message}`)
    }
    return null
  }
  api.registerEvent('extra.hideOtherApplications', hideOthers)
  api.registerEvent('extra.hideOtherApplication', hideOthers)

  api.registerEvent('extra.setActivationPolicy', ({ args }) => {
    const policy = String(arg(args, 0))
    if (!['regular', 'accessory', 'prohibited'].includes(policy)) {
      throw new Error(`非法的激活策略: ${policy}`)
    }
    app.setActivationPolicy(policy)
    return null
  })
}

function register(api) {
  // 原版这四个都包在 #[cfg(target_os = "macos")] 里：非 macOS 上调用会得到
  // "api not found"，这是原版行为，照做（不额外注册）
  if (process.platform === 'darwin') macOnly(api)
}

module.exports = { register }
