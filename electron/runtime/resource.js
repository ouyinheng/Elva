'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { nativeImage } = require('electron')

/**
 * 资源管理器 —— 对齐 crates/niva/src/app/resource_manager/mod.rs
 *
 * 原版有两种实现：
 *   AppResourceManager  —— 读打包进可执行文件的 RESOURCE_INDEXES + RESOURCE_DATA（deflate）
 *   FileSystemResource  —— 读磁盘目录（`--debug-resource` 时启用）
 *
 * elva 暂时把两种都实现成「目录读取」：打包形态的资源内嵌（P3）还没做，
 * 届时只需替换 AppResourceManager 的底层实现，接口保持不变。
 * 这一条差异已记入 docs/niva-parity.md。
 */

/** 统一的路径归一：去掉前导 `/` 与 `./` */
function normalizeResourcePath(p) {
  return String(p).replace(/^\.?\//, '')
}

class FileSystemResource {
  constructor(rootDir) {
    const stat = fs.existsSync(rootDir) ? fs.statSync(rootDir) : null
    if (!stat || !stat.isDirectory()) {
      throw new Error('Invalid resource directory.')
    }
    this.rootDir = rootDir
    this.iconCache = new Map()
  }

  exists(p) {
    const target = path.join(this.rootDir, normalizeResourcePath(p))
    return fs.existsSync(target) && fs.statSync(target).isFile()
  }

  load(p) {
    return fs.readFileSync(path.join(this.rootDir, normalizeResourcePath(p)))
  }

  /** 原版 FileSystemResource::extract 用 fs_extra::file::copy，不创建父目录 */
  extract(from, to) {
    fs.copyFileSync(path.join(this.rootDir, normalizeResourcePath(from)), to)
  }

  loadIcon(p) {
    const cached = this.iconCache.get(p)
    if (cached) return cached
    const data = this.load(p)
    return this._iconFromBuffer(p, data)
  }

  _iconFromBuffer(p, data) {
    // 原版只支持 png：非 png 直接报 "Unsupported icon format."
    if (!String(p).toLowerCase().endsWith('png')) {
      throw new Error('Unsupported icon format.')
    }
    const icon = nativeImage.createFromBuffer(data)
    if (icon.isEmpty()) throw new Error('Unsupported icon format.')
    this.iconCache.set(p, icon)
    return icon
  }
}

class AppResourceManager extends FileSystemResource {
  constructor(rootDir) {
    super(rootDir)
    this.kind = 'app'
  }
}

/**
 * 空资源管理器 —— 只在**工作台模式**下、且磁盘上确实没有任何资源目录时使用。
 *
 * 为什么需要它：
 *   工作台自己的界面由 Vite dev server（开发）或 dist（生产）提供，
 *   资源目录对工作台是可选的。开发时如果还没跑过 `vite build`，
 *   dist/ 不存在，此时如果照搬原版的 "Invalid resource directory." 抛错，
 *   整个应用就起不来了。
 *
 * 不影响原版行为：项目模式下给了 `--debug-resource` 但目录无效，仍然照原版抛错
 * （见 createResource）。
 */
class EmptyResource {
  constructor(rootDir) {
    this.rootDir = rootDir || null
    this.kind = 'empty'
    this.iconCache = new Map()
  }

  exists() {
    return false
  }

  load(p) {
    throw new Error(`File not found: ${p}`)
  }

  extract(from) {
    throw new Error(`File not found: ${from}`)
  }

  loadIcon(p) {
    throw new Error(`File not found: ${p}`)
  }
}

/**
 * 按原版逻辑选择实现：
 *   给了 --debug-resource → FileSystemResource(dir)（目录无效则抛错，对齐原版）
 *   否则                 → AppResourceManager（打包资源根）
 *
 * 注意 elva 的打包资源内嵌（P3）还没做，所以 AppResourceManager 目前也读目录。
 */
function createResource(arguments_, appPath, resourcesPath) {
  if (arguments_.debugResource) {
    return new FileSystemResource(arguments_.debugResource)
  }
  const root = path.join(resourcesPath, 'resources')
  const fallback = path.join(appPath, 'resources')
  return new AppResourceManager(fs.existsSync(root) ? root : fallback)
}

module.exports = {
  FileSystemResource,
  AppResourceManager,
  EmptyResource,
  createResource,
  normalizeResourcePath,
}
