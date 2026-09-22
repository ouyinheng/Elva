/**
 * 公共工具 —— 对齐原版 packages/devtools/src/common/utils.ts
 *
 * 说明：
 * - 原版直接引用全局 `Niva`（由 wry 的 initialization script 注入）。
 *   elva 的 preload 注入的是同名同形的 window.Niva，所以这里统一从 window 取。
 * - 模块级缓存（baseFileSystemUrl / sep / dirs / currentDir）保持原样：
 *   pathJoin 等函数依赖 sep，必须在渲染前取到，所以用 readPromise 统一预取。
 * - lodash 的 trimEnd / trimStart / maxBy 手写替代（不引依赖）。
 */

import { Err } from './result'
import { ErrorCode } from './error'

/* -------------------------------------------------------------------------- */
/* 环境预取                                                                     */
/* -------------------------------------------------------------------------- */

let baseFileSystemUrl = null
let sep = null
let dirs = null
let currentDir = null

const readPromise = Promise.all([
  window.Niva.api.webview
    .baseFileSystemUrl()
    .then((s) => (baseFileSystemUrl = s)),
  window.Niva.api.os.sep().then((s) => (sep = s)),
  window.Niva.api.os.dirs().then((d) => (dirs = d)),
  window.Niva.api.process.currentDir().then((d) => (currentDir = d)),
])

export function envReady(callback) {
  readPromise.then(callback)
}

/* -------------------------------------------------------------------------- */
/* classnames 替代                                                             */
/* -------------------------------------------------------------------------- */

/** 支持 cx('a', { b: true }, ['c', null]) 三种写法 */
export function cx(...args) {
  const out = []
  for (const arg of args) {
    if (!arg) continue
    if (typeof arg === 'string') {
      out.push(arg)
    } else if (Array.isArray(arg)) {
      const inner = cx(...arg)
      if (inner) out.push(inner)
    } else if (typeof arg === 'object') {
      for (const key of Object.keys(arg)) {
        if (arg[key]) out.push(key)
      }
    }
  }
  return out.join(' ')
}

/* -------------------------------------------------------------------------- */
/* 杂项                                                                         */
/* -------------------------------------------------------------------------- */

export function uuid() {
  let dt = new Date().getTime()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (dt + Math.random() * 16) % 16 | 0
    dt = Math.floor(dt / 16)
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export function limitString(str, limit) {
  if (str.length > limit) {
    const remainingChars = limit - 3
    return `...${str.slice(-remainingChars)}`
  }
  return str
}

function trimEnd(s, chars) {
  let end = s.length
  while (end > 0 && chars.includes(s[end - 1])) end--
  return s.slice(0, end)
}

function trimStart(s, chars) {
  let start = 0
  while (start < s.length && chars.includes(s[start])) start++
  return s.slice(start)
}

function maxBy(list, key) {
  let best = null
  for (const item of list) {
    if (best === null || item[key] > best[key]) best = item
  }
  return best
}

/* -------------------------------------------------------------------------- */
/* 路径                                                                         */
/* -------------------------------------------------------------------------- */

export function urlJoin(...paths) {
  return paths.reduce((l, r) => {
    const left = trimEnd(l, '/')
    const right = trimStart(r, '/')
    return left + '/' + right
  })
}

export function fileSystemUrl(path) {
  // 原版写的是 path.replace('\\', '/')，字符串参数只替换**第一处**反斜杠，
  // 多级 Windows 路径会残留反斜杠。这里按 D2 修掉全部反斜杠（已记入差异表）。
  return urlJoin(baseFileSystemUrl, path.replace(/\\/g, '/'))
}

export function pathJoin(...paths) {
  return paths.filter((s) => s).join(sep)
}

/* -------------------------------------------------------------------------- */
/* 项目配置文件                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * elva 自己的配置文件叫 `elva.json`；`niva.json` 作为**兼容层**继续支持 ——
 * 这样老项目不用改一行就能被 elva 打开，新项目则用 elva 自己的名字。
 * 优先 `elva.json`（若两者同时存在，以 elva 的为准）。
 */
export const CONFIG_FILE_NAMES = ['elva.json', 'niva.json']

/**
 * 在目录里探测实际使用的配置文件。
 * @returns {Promise<{configPath: string, configName: string, exists: boolean}>}
 *          都不存在时返回首选名（`elva.json`）与 exists=false，交给调用方决定要不要创建。
 */
export async function resolveConfigPath(dirPath) {
  const { fs } = Niva.api
  for (const name of CONFIG_FILE_NAMES) {
    const candidate = pathJoin(dirPath, name)
    if (await fs.exists(candidate)) {
      return { configPath: candidate, configName: name, exists: true }
    }
  }
  return {
    configPath: pathJoin(dirPath, CONFIG_FILE_NAMES[0]),
    configName: CONFIG_FILE_NAMES[0],
    exists: false,
  }
}

export function pathSplit(path) {
  return path.split(sep)
}

export function dirname(path) {
  return path.split(sep).slice(0, -1).join(sep)
}

export function tempDirWith(...paths) {
  return pathJoin(dirs.temp, ...paths)
}

export function dataDirWith(...paths) {
  return pathJoin(dirs.data, ...paths)
}

export function getHome() {
  return dirs.home
}

export function getCurrentDir() {
  return currentDir
}

export function isAbsolutePath(path) {
  return /^(\/|[A-Z]:\\)/.test(path)
}

export async function resolvePath(path) {
  return isAbsolutePath(path) ? path : pathJoin(await Niva.api.process.currentDir(), path)
}

/* -------------------------------------------------------------------------- */
/* Promise 与命令行参数                                                          */
/* -------------------------------------------------------------------------- */

export function createPromise() {
  let resolve = () => {}
  const promise = new Promise((_resolve) => (resolve = _resolve))
  promise.resolve = resolve
  return promise
}

export function parseArgs(args) {
  const result = {}
  for (const arg of args.slice(1)) {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=')
      result[key] = value || ''
    }
  }
  return result
}

/* -------------------------------------------------------------------------- */
/* 版本号处理                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * 把版本字符串拆成 4 段数字，供 macOS Info.plist / Windows VERSION_INFO 使用。
 *
 * 说明：elva 不做「联网检查新版本」—— 原版会去查 bramblex/niva 的 GitHub releases
 * 并弹窗引导用户去 niva 的下载页，这对 elva 是没有意义的（我们不是 niva 的新版本）。
 * 该逻辑已整体删除，应用自身版本由 `process.version()` 提供。
 */
export function parseVersion(versionString) {
  const versionDigits = versionString
    .replace(/[^0-9.]/g, '')
    .split('.')
    .map(Number)
  while (versionDigits.length < 4) {
    versionDigits.push(0)
  }
  return versionDigits.slice(0, 4)
}

/* -------------------------------------------------------------------------- */
/* 错误统一提示                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Result → 模态框提示的统一实现。
 *
 * @param ignoredCodes 这些错误码**不弹框**：它们是控制流信号而不是错误
 *                     （典型的就是「有弹窗开着，所以这次退出被拒绝」）。
 */
async function alertOnError(app, r, ignoredCodes) {
  const { locale, modal } = app.state
  try {
    const result = await r
    if (result && result.isErr && result.isErr()) {
      if (ignoredCodes && ignoredCodes.includes(result.error?.code)) return
      modal.alert(locale.t('ERROR'), result.error.toLocaleMessage(app))
    }
  } catch (err) {
    modal.alert(locale.t('ERROR'), `[UNKNOWN ERROR] ${err?.toString?.() ?? err}`)
  }
}

/** 原版的 tryOrAlert：把 Result 的错误转成模态框提示；未预期的异常也兜住 */
export function tryOrAlert(app, r) {
  return alertOnError(app, r, null)
}

/**
 * 退出请求专用：把 `APP_EXIT_PREVENTED_BY_DIALOG` 视作**正常结果**静默吞掉。
 *
 * 这个错误码是控制流信号，不是给用户看的错误。它的含义是
 * 「当前有弹窗开着，所以这一次退出请求被拒绝」—— 此刻用户眼前就是那个弹窗，
 * 再叠一个标题为「错误」、正文写着 `[APP_EXIT_PREVENTED_BY_DIALOG] code: 11`
 * 的框纯属噪音。更糟的是：新弹出的这个框本身也是弹窗，会让下一次退出继续被拒，
 * 用户连点几下关闭按钮就会叠出一摞错误框（原版就是这样，见差异表 B-10）。
 */
export function tryExit(app, r) {
  return alertOnError(app, r, [ErrorCode.APP_EXIT_PREVENTED_BY_DIALOG])
}

/* -------------------------------------------------------------------------- */
/* 构建辅助                                                                      */
/* -------------------------------------------------------------------------- */

export async function runCmd(cmd, args, options) {
  const res = await Niva.api.process.exec(cmd, args, options)
  if (res.status !== 0) {
    throw new Error(`[Cmd Error] ${JSON.stringify(res)}`)
  }
  return res.stdout
}

export { Err, ErrorCode }
