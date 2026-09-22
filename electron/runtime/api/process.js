'use strict'

const os = require('node:os')
const { spawn, spawnSync } = require('node:child_process')
const { app, shell } = require('electron')

const { arg, optional } = require('./helpers')

/**
 * process 命名空间 —— 10 个方法，对齐 crates/niva/src/app/api/process.rs
 *
 * 必须保留的行为：
 *   - exec 在未 detach 时返回 `{status, stdout, stderr}`；status 是被信号杀死时的 **null**
 *   - exec 在 `detached: true` 时返回的是**子进程 pid（数字）**，不是结果对象 —— 原版就这么写的
 *   - exit 是 event api（抛回主循环），不是普通 api
 *   - args 返回的数组**含 argv[0]**
 */

// 有意偏离：原版是编译期写死的 git 版本号，缺失时返回 "unknown"
const RUNTIME_VERSION = require('../../../package.json').version || 'unknown'

function register(api) {
  api.register('process.pid', () => process.pid)

  api.register('process.currentDir', () => process.cwd())

  // 对齐 std::env::current_exe()：指「应用可执行文件」而不是渲染进程
  api.register('process.currentExe', () => app.getPath('exe'))

  api.register('process.env', () => ({ ...process.env }))

  // 原版 std::env::args() 含 argv[0]
  api.register('process.args', () => [...process.argv])

  api.register('process.setCurrentDir', ({ args }) => {
    process.chdir(String(arg(args, 0)))
    return null
  })

  api.registerEvent('process.exit', () => {
    app.quit()
    return null
  })

  api.register('process.version', () => RUNTIME_VERSION)

  api.registerAsync('process.exec', ({ args }) => {
    const cmd = String(arg(args, 0))
    const cmdArgs = optional(args, 1) || []
    const options = optional(args, 2) || {}
    const detached = options.detached === true

    if (detached) {
      // 对齐原版：detached 时返回子进程 pid
      const child = spawn(cmd, cmdArgs, {
        detached: true,
        stdio: 'ignore',
        cwd: options.currentDir || undefined,
        env: options.env ? { ...process.env, ...options.env } : process.env,
      })
      child.unref()
      return child.pid
    }

    const result = spawnSync(cmd, cmdArgs, {
      cwd: options.currentDir || undefined,
      env: options.env ? { ...process.env, ...options.env } : process.env,
      encoding: 'utf8',
    })

    if (result.error) throw result.error

    return {
      // 被信号终止时 code 为 null —— 与原版 output.status.code() 一致
      status: result.status === null ? null : result.status,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
    }
  })

  /**
   * 打开 URI / 文件 / 目录 —— 对齐原版 `opener::open(uri)`。
   *
   * `opener` crate 会自己判断目标是 URL 还是本地路径，分别交给浏览器与系统默认程序。
   * 这里早期只用了 `shell.openExternal()`，它**只接受 URL**：传本地路径时
   * macOS 上直接抛 `Error: Invalid URL`，于是「项目信息 → 打开（目录）」按钮
   * 每点一次就弹一个 `[UNKNOWN ERROR] Invalid URL` 错误框（本机实测确认）。
   *
   * 所以必须先判类型：带 scheme 的交给 openExternal，其余按路径交给 openPath。
   */
  api.registerAsync('process.open', async ({ args }) => {
    const target = String(arg(args, 0))

    if (isUri(target)) {
      await shell.openExternal(target)
      return null
    }

    // shell.openPath 不抛异常，失败时返回非空错误字符串
    const errorMessage = await shell.openPath(target)
    if (errorMessage) throw new Error(errorMessage)
    return null
  })
}

/**
 * 判断是不是「带 scheme 的 URI」。
 *
 * 注意要排除 Windows 盘符：`C:\dir` 也匹配 `^[a-zA-Z][\w+.-]*:`，
 * 但它是绝对路径而不是 URI，必须走 openPath。
 */
function isUri(target) {
  if (/^[a-zA-Z]:[\\/]/.test(target)) return false
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(target)
}

// isUri 一并导出：验收脚本要直接断言分支判定（纯函数，不碰系统）
module.exports = { register, isUri }
