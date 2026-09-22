'use strict'

const fs = require('node:fs')
const path = require('node:path')

const { arg, optional } = require('./helpers')

/**
 * resource 命名空间 —— 3 个方法，对齐 crates/niva/src/app/api/resource.rs
 *                       与 resource_manager/mod.rs
 *
 * 语义（照做）：
 *   - 读的是**打包进产物的资源**（或 --debug-resource 指向的目录）
 *   - read(path, encode?) 支持 utf8 / base64
 *   - extract(from, to) 是「写出到磁盘」，原版**不创建父目录**，父目录不存在就失败
 */
function register(api) {
  api.registerAsync('resource.exists', ({ ctx, args }) => ctx.resource.exists(String(arg(args, 0))))

  api.registerAsync('resource.read', ({ ctx, args }) => {
    const encode = optional(args, 1) || 'utf8'
    const data = ctx.resource.load(String(arg(args, 0)))
    return encode === 'base64' ? data.toString('base64') : data.toString('utf8')
  })

  api.registerAsync('resource.extract', ({ ctx, args }) => {
    const from = String(arg(args, 0))
    const to = String(arg(args, 1))
    const content = ctx.resource.load(from)
    fs.writeFileSync(to, content)
    return null
  })
}

module.exports = { register }
