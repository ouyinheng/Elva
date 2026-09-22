'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { app } = require('electron')

/**
 * os 命名空间 —— 5 个方法，对齐 crates/niva/src/app/api/os.rs
 *
 * dirs() 的字段**永远全部存在**，取不到时是 null（原版 json! 里的 Option<PathBuf> 序列化成 null）。
 * 这一点要照做，否则依赖固定字段的代码会炸。
 */

function osType() {
  if (process.platform === 'darwin') return 'Mac OS'
  if (process.platform === 'win32') return 'Windows'
  return 'Linux'
}

function archName() {
  const map = { arm64: 'aarch64', x64: 'x86_64', ia32: 'i686', arm: 'arm' }
  return map[process.arch] || process.arch
}

/** 安全取 Electron 的标准路径；取不到返回 null */
function safePath(kind) {
  try {
    const value = app.getPath(kind)
    return value || null
  } catch {
    return null
  }
}

function register(api) {
  api.register('os.info', () => ({
    os: osType(),
    arch: archName(),
    version: os.release(),
  }))

  api.register('os.dirs', ({ ctx }) => {
    const home = os.homedir()

    // Electron 没有 font / public / template 这类目录 API，
    // 按平台手工兜底，取不到就是 null（与原版 Option 序列化一致）
    const fontDir =
      process.platform === 'darwin' ? path.join(home, 'Library', 'Fonts') : safePath('fonts')

    return {
      // 前两个来自 launch_info，不是系统标准目录
      temp: ctx.tempDir,
      data: ctx.dataDir,

      home: safePath('home') || home,
      audio: safePath('music'),
      desktop: safePath('desktop'),
      document: safePath('documents'),
      download: safePath('downloads'),
      font: fontDir && fs.existsSync(fontDir) ? fontDir : null,
      picture: safePath('pictures'),
      public:
        process.platform === 'darwin' && fs.existsSync(path.join(home, 'Public'))
          ? path.join(home, 'Public')
          : null,
      template: null,
      video: safePath('videos'),
    }
  })

  api.register('os.sep', () => path.sep)

  api.register('os.eol', () => (process.platform === 'win32' ? '\r\n' : '\n'))

  api.register('os.locale', () => app.getLocale() || 'en-US')
}

module.exports = { register }
