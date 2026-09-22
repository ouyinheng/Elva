'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { app } = require('electron')

const { parseArguments, resolvePlatformOptions } = require('./options')
const { createResource, FileSystemResource, EmptyResource } = require('./resource')

/**
 * 对齐 crates/niva/src/app/mod.rs::NivaLaunchInfo
 *
 * 原版派生规则（逐字照做）：
 *   id_name  = `${name.toLowerCase()}_${uuid.slice(0, 8)}`
 *   data_dir = base_dirs.data_dir()/id_name     → mac 上是 ~/Library/Application Support/<id_name>
 *   cache_dir= base_dirs.cache_dir()/id_name    → mac 上是 ~/Library/Caches/<id_name>
 *   temp_dir = std::env::temp_dir()/id_name
 *
 * id_name 同时是自定义协议的 host，所以它必须与资源根、数据目录三者一致。
 */
class NivaContext {
  constructor({ options, arguments: args, resource }) {
    this.options = options
    this.arguments = args
    this.resource = resource

    const name = options.name
    const uuid = options.uuid
    this.name = name
    this.uuid = uuid
    this.idName = `${String(name).toLowerCase()}_${String(uuid).slice(0, 8)}`

    const appData = app.getPath('appData')
    this.dataDir = path.join(appData, this.idName)
    this.cacheDir =
      process.platform === 'darwin'
        ? path.join(os.homedir(), 'Library', 'Caches', this.idName)
        : path.join(appData, this.idName, 'Cache')
    this.tempDir = path.join(os.tmpdir(), this.idName)
  }

  /** 与 options.workers 对齐：默认 4（原版 ApiManager::new 的值） */
  get workers() {
    return typeof this.options.workers === 'number' ? this.options.workers : 4
  }
}

/**
 * 读取并解析配置，构造 context。
 *
 * @param {object} [overrideOptions] 工作台模式下内置的默认配置（跳过 niva.json 读取）
 * @param {{resourceRoot?:string, debugEntry?:string}} [overrides]
 *        工作台模式的两个运行时覆盖项。
 *
 *        为什么需要 overrides，而不是直接改 args：
 *        工作台不是一个「放在磁盘上的 Niva 项目」，它没有 niva.json，
 *        资源根与入口地址都由启动方（electron/main.js）决定：
 *          - 开发：入口 = Vite dev server，资源根 = dist/
 *          - 生产：入口 = elva://<id_name>，资源根 = dist/
 *        原先这两个值被静默忽略，于是 createResource 会去猜 <app>/resources 目录，
 *        猜不到就抛 "Invalid resource directory."，工作台直接起不来。
 */
function createContext(overrideOptions, overrides) {
  const args = parseArguments()
  const opts = overrides || {}

  let options
  if (overrideOptions) {
    // 工作台的内置配置也要过一遍平台合并 —— 否则 macos/windows 覆盖段会被忽略，
    // 自绘标题栏就出不来（系统标题栏会与它叠在一起）。
    options = resolvePlatformOptions(overrideOptions)
  } else {
    const rawBuffer = args.debugConfig
      ? fs.readFileSync(args.debugConfig)
      : null

    if (!rawBuffer) {
      throw new Error(
        '找不到 niva.json：请用 --debug-config=<path> 指定配置，或 --debug-resource=<dir> 指定资源根。',
      )
    }
    options = resolvePlatformOptions(JSON.parse(rawBuffer.toString('utf8')))
  }

  // `--debug-devtools=true` 强制开 devtools（对齐 NivaLaunchInfo::new）
  if (args.debugDevtools) {
    options = { ...options, window: { ...(options.window || {}), devtools: true } }
  }

  // 入口地址覆盖（对齐原版 --debug-entry：debug_entry 优先于自造的 base_url）
  if (opts.debugEntry) args.debugEntry = opts.debugEntry

  const resource = opts.resourceRoot
    ? createWorkbenchResource(opts.resourceRoot)
    : createResource(
        args,
        overrideOptions ? path.join(__dirname, '..', '..') : path.dirname(args.debugConfig || '.'),
        process.resourcesPath,
      )

  return new NivaContext({ options, arguments: args, resource })
}

/**
 * 工作台的资源根：目录存在就用它，不存在则降级成空资源管理器并告警。
 * 这里**不能**抛错 —— 工作台的界面由 dev server / dist 提供，
 * 资源目录只是附带能力（resource.* API、elva:// 协议读文件）。
 */
function createWorkbenchResource(rootDir) {
  if (fs.existsSync(rootDir) && fs.statSync(rootDir).isDirectory()) {
    return new FileSystemResource(rootDir)
  }
  console.warn(
    `[elva] 工作台资源目录不存在，已降级为空资源管理器: ${rootDir}` +
      '（开发期属正常：先跑一次 vite build 即可）',
  )
  return new EmptyResource(rootDir)
}

module.exports = { NivaContext, createContext }
