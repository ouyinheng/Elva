'use strict'

const fs = require('node:fs')
const path = require('node:path')

const { arg, optional } = require('./helpers')
const { GlobPattern } = require('../glob')

/**
 * fs 命名空间 —— 12 个方法，对齐 crates/niva/src/app/api/fs.rs
 *
 * 必须保留的行为细节：
 *   - stat 的时间字段单位是**毫秒**（原版 as_millis），不是秒
 *   - readDir(path?) 缺省是当前工作目录，返回的是**文件名**（不是完整路径）
 *   - readDirAll 返回相对路径，且 excludes 匹配的是**绝对路径**
 *   - readDirAll 的结果**不排序**（原版就是 read_dir 的原始顺序）
 *   - append 不创建文件：目标不存在时报错（OpenOptions 没带 create）
 *   - copy/move 对「文件」和「目录」用两套默认参数
 *
 * 有意偏离（D2：修复缺陷 + 记录）：
 *   - stat.isSymlink 原版用 std::fs::metadata（会跟随软链），导致它**恒为 false**。
 *     这里改用 lstat，让它真的能识别软链 —— 已记入差异表。
 */

function readEncoded(filePath, encode) {
  if (encode === 'base64') return fs.readFileSync(filePath).toString('base64')
  return fs.readFileSync(filePath, 'utf8')
}

function writeEncoded(filePath, content, encode) {
  const buffer = encode === 'base64' ? Buffer.from(content, 'base64') : Buffer.from(content, 'utf8')
  fs.writeFileSync(filePath, buffer)
}

/** 对齐 fs_extra 的 CopyOptions 默认值：overwrite=false, skip_exist=false, buffer_size=64000 */
function copyFileWithOptions(from, to, options) {
  const overwrite = options && options.overwrite !== undefined ? options.overwrite : false
  const skipExist = options && options.skipExist !== undefined ? options.skipExist : false

  if (fs.existsSync(to)) {
    if (skipExist) return
    if (overwrite) {
      fs.rmSync(to, { recursive: true, force: true })
    } else {
      throw new Error(`目标已存在且未设置 overwrite: ${to}`)
    }
  }
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.copyFileSync(from, to)
}

function copyDirWithOptions(from, to, options) {
  const overwrite = options && options.overwrite !== undefined ? options.overwrite : false
  const skipExist = options && options.skipExist !== undefined ? options.skipExist : false
  const copyInside = options && options.copyInside !== undefined ? options.copyInside : false
  const contentOnly = options && options.contentOnly !== undefined ? options.contentOnly : false
  const depth = options && options.depth !== undefined ? options.depth : 0

  if (fs.existsSync(to)) {
    if (skipExist) return
    if (overwrite) fs.rmSync(to, { recursive: true, force: true })
    else throw new Error(`目标已存在且未设置 overwrite: ${to}`)
  }

  // copy_inside：把源目录整个塞进目标目录里（而不是把目标当成源本身）
  const effectiveTo = copyInside && fs.existsSync(to) ? path.join(to, path.basename(from)) : to
  // content_only：只拷内容，不建源目录这一层
  const baseTarget = contentOnly ? effectiveTo : path.join(effectiveTo, path.basename(from))

  fs.mkdirSync(baseTarget, { recursive: true })
  copyTree(from, baseTarget, depth, 0)
}

function copyTree(from, to, depth, level) {
  if (depth > 0 && level >= depth) return
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name)
    const dst = path.join(to, entry.name)
    if (entry.isDirectory()) {
      fs.mkdirSync(dst, { recursive: true })
      copyTree(src, dst, depth, level + 1)
    } else {
      fs.copyFileSync(src, dst)
    }
  }
}

function register(api) {
  api.registerAsync('fs.stat', ({ args }) => {
    const target = String(arg(args, 0))
    const meta = fs.statSync(target)
    // 有意偏离：原版用 statSync 的等价物 metadata()，软链判定恒为 false；这里用 lstat 修正
    const linkMeta = fs.lstatSync(target)
    return {
      isDir: meta.isDirectory(),
      isFile: meta.isFile(),
      isSymlink: linkMeta.isSymbolicLink(),
      size: meta.size,
      modified: Math.floor(meta.mtimeMs),
      accessed: Math.floor(meta.atimeMs),
      created: Math.floor(meta.birthtimeMs),
    }
  })

  api.registerAsync('fs.exists', ({ args }) => fs.existsSync(String(arg(args, 0))))

  api.registerAsync('fs.read', ({ args }) => {
    const encode = optional(args, 1) || 'utf8'
    return readEncoded(String(arg(args, 0)), encode)
  })

  api.registerAsync('fs.write', ({ args }) => {
    const encode = optional(args, 1) || 'utf8'
    writeEncoded(String(arg(args, 0)), String(arg(args, 1) ?? ''), encode)
    return null
  })

  api.registerAsync('fs.append', ({ args }) => {
    const target = String(arg(args, 0))
    const content = String(arg(args, 1) ?? '')
    const encode = optional(args, 2) || 'utf8'
    const buffer = encode === 'base64' ? Buffer.from(content, 'base64') : Buffer.from(content, 'utf8')
    // 对齐原版：OpenOptions 没带 create，文件不存在会抛错
    fs.appendFileSync(target, buffer)
    return null
  })

  const moveOrCopy = (isMove) => ({ args }) => {
    const from = String(arg(args, 0))
    const to = String(arg(args, 1))
    const options = optional(args, 2) || null
    const isDir = fs.statSync(from).isDirectory()

    if (isDir) {
      if (isMove) {
        if (fs.existsSync(to)) {
          const overwrite = options && options.overwrite
          if (overwrite) fs.rmSync(to, { recursive: true, force: true })
          else throw new Error(`目标已存在且未设置 overwrite: ${to}`)
        }
        fs.renameSync(from, to)
      } else {
        copyDirWithOptions(from, to, options)
      }
    } else if (isMove) {
      if (fs.existsSync(to)) {
        const overwrite = options && options.overwrite
        const skipExist = options && options.skipExist
        if (skipExist) return null
        if (overwrite) fs.rmSync(to, { recursive: true, force: true })
        else throw new Error(`目标已存在且未设置 overwrite: ${to}`)
      }
      fs.renameSync(from, to)
    } else {
      copyFileWithOptions(from, to, options)
    }
    return null
  }

  api.registerAsync('fs.move', moveOrCopy(true))
  api.registerAsync('fs.copy', moveOrCopy(false))

  api.registerAsync('fs.remove', ({ args }) => {
    const target = String(arg(args, 0))
    if (fs.statSync(target).isDirectory()) fs.rmSync(target, { recursive: true, force: true })
    else fs.rmSync(target, { force: true })
    return null
  })

  api.registerAsync('fs.createDir', ({ args }) => {
    fs.mkdirSync(String(arg(args, 0)))
    return null
  })

  api.registerAsync('fs.createDirAll', ({ args }) => {
    fs.mkdirSync(String(arg(args, 0)), { recursive: true })
    return null
  })

  api.registerAsync('fs.readDir', ({ args }) => {
    const target = optional(args, 0) === null ? '.' : String(args[0])
    return fs.readdirSync(target)
  })

  api.registerAsync('fs.readDirAll', ({ args }) => {
    const root = String(arg(args, 0))
    const excludes = optional(args, 1) || []
    const patterns = excludes.map((pattern) => new GlobPattern(pattern))

    const files = []
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        // 原版把 excludes 匹配在**绝对路径**上
        if (patterns.some((pattern) => pattern.matches(full))) continue
        if (entry.isDirectory()) walk(full)
        else files.push(path.relative(root, full))
      }
    }
    walk(root)
    return files
  })
}

module.exports = { register }
