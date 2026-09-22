'use strict'

const { dialog } = require('electron')

const { arg, optional } = require('./helpers')

/**
 * dialog 命名空间 —— 6 个方法，对齐 crates/niva/src/app/api/dialog.rs
 *
 * 必须保留的行为：
 *   - showMessage 的参数顺序是 (title, content?, level?)，**title 在第一位**
 *   - pickFile / pickDir / saveFile 取消时返回 **null**（不是空串、不是 undefined）
 *   - filters 是**扩展名数组**（如 ["png","jpg"]），原版把它们塞进一个叫 "pick" 的过滤器
 *   - start_dir 是起始目录
 *
 * 原版这 6 个是 register_api（同步阻塞调用线程）；Electron 的对话框是异步的，
 * 对调用方而言两者都是 Promise，所以统一用异步实现，不改变外部可观测行为。
 */

function buildFilters(filters) {
  if (!Array.isArray(filters) || filters.length === 0) return undefined
  return [{ name: 'pick', extensions: filters.map((ext) => String(ext).replace(/^\./, '')) }]
}

function register(api) {
  api.register('dialog.showMessage', async ({ window: w, args }) => {
    const title = String(arg(args, 0) ?? '')
    const content = optional(args, 1) || ''
    const level = optional(args, 2) || 'info'
    const type = level === 'warning' ? 'warning' : level === 'error' ? 'error' : 'info'

    await dialog.showMessageBox(w.win, {
      type,
      title,
      message: title,
      detail: content,
      buttons: ['OK'],
      noLink: true,
    })
    return null
  })

  api.register('dialog.pickFile', async ({ window: w, args }) => {
    const result = await dialog.showOpenDialog(w.win, {
      properties: ['openFile'],
      filters: buildFilters(optional(args, 0)),
      defaultPath: optional(args, 1) || undefined,
    })
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  })

  // 原版注册了但类型声明里没有：保留实现（D2）
  api.register('dialog.pickFiles', async ({ window: w, args }) => {
    const result = await dialog.showOpenDialog(w.win, {
      properties: ['openFile', 'multiSelections'],
      filters: buildFilters(optional(args, 0)),
      defaultPath: optional(args, 1) || undefined,
    })
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths
  })

  api.register('dialog.pickDir', async ({ window: w, args }) => {
    const result = await dialog.showOpenDialog(w.win, {
      properties: ['openDirectory'],
      defaultPath: optional(args, 0) || undefined,
    })
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  })

  api.register('dialog.pickDirs', async ({ window: w, args }) => {
    const result = await dialog.showOpenDialog(w.win, {
      properties: ['openDirectory', 'multiSelections'],
      defaultPath: optional(args, 0) || undefined,
    })
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths
  })

  api.register('dialog.saveFile', async ({ window: w, args }) => {
    const result = await dialog.showSaveDialog(w.win, {
      filters: buildFilters(optional(args, 0)),
      defaultPath: optional(args, 1) || undefined,
    })
    return result.canceled || !result.filePath ? null : result.filePath
  })
}

module.exports = { register }
