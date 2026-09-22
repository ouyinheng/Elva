'use strict'

const { globalShortcut } = require('electron')

const { IdCounter, mergeId, splitId } = require('./ids')
const { normalizeAccelerator } = require('./accelerator')

/**
 * 全局快捷键 —— 对齐 crates/niva/src/app/shortcut_manager/mod.rs
 *
 * 原版要点（照做）：
 *   - id 由**全局唯一**的 IdCounter 分配（不是每窗口独立）
 *   - 存储是 HashMap<u8, (window_id, accelerator, shortcut)>，所以 id 全局唯一，
 *     但 unregister 时必须传入**拥有该 id 的窗口**，否则报错
 *   - 触发时 split_id 还原出 window_id，把 `shortcut.emit` 发给那个窗口，载荷是纯 item id
 *
 * Electron 的 globalShortcut 是进程级单例、回调里不携带 id，所以这里自己维护
 * 「accelerator → mergedId」的反查表来等价实现。
 */
class ShortcutManager {
  constructor(hooks) {
    this.hooks = hooks || {}
    this.idCounter = new IdCounter()
    /** @type {Map<number, {windowId:number, accelerator:string}>} */
    this.shortcuts = new Map()
    /** @type {Map<string, number>} accelerator -> mergedId */
    this.byAccelerator = new Map()
  }

  register(windowId, acceleratorStr) {
    const id = this.idCounter.next(new Set(this.shortcuts.keys()))
    this.registerWithId(windowId, id, acceleratorStr)
    return id
  }

  registerWithId(windowId, id, acceleratorStr) {
    if (this.shortcuts.has(id)) {
      throw new Error(`Shortcetet with id ${id} already registered`)
    }

    // tao 用 W3C code 名（如 Backslash），Electron 只认单字符 —— 必须先归一化
    const electronAccelerator = normalizeAccelerator(acceleratorStr)

    const ok = globalShortcut.register(electronAccelerator, () => this._fire(electronAccelerator))
    if (!ok) {
      throw new Error(`快捷键注册失败（可能已被系统或其他应用占用）: ${acceleratorStr}`)
    }

    // 对外仍保存原版写法，保证 list() 返回值与 niva.json 一致
    this.shortcuts.set(id, { windowId, accelerator: acceleratorStr, electronAccelerator })
    this.byAccelerator.set(electronAccelerator, mergeId(windowId, id))
  }

  unregister(windowId, id) {
    const found = this.shortcuts.get(id)
    if (!found) throw new Error(`Shortcut with id ${id} not found`)
    if (windowId !== found.windowId) {
      throw new Error(`Shortcut with id ${id} can only unregister in window ${found.windowId}`)
    }
    this.shortcuts.delete(id)
    if (this.byAccelerator.get(found.electronAccelerator) === mergeId(found.windowId, id)) {
      this.byAccelerator.delete(found.electronAccelerator)
    }
    globalShortcut.unregister(found.electronAccelerator)
  }

  unregisterAll(windowId) {
    for (const [id, entry] of [...this.shortcuts]) {
      if (entry.windowId === windowId) this.unregister(windowId, id)
    }
  }

  /**
   * 注意：原版返回 `Vec<(u8, String)>`，序列化后是 `[[id, accelerator], ...]`，
   * 但 packages/types/Niva_Text.d.ts 声明的是 `{id, accelerator}[]`。
   * 这里按类型声明（对外契约）返回对象数组，属有意偏离，已记入差异表。
   */
  list(windowId) {
    const out = []
    for (const [id, entry] of this.shortcuts) {
      if (entry.windowId === windowId) out.push({ id, accelerator: entry.accelerator })
    }
    return out
  }

  _fire(acceleratorStr) {
    const merged = this.byAccelerator.get(acceleratorStr)
    if (merged === undefined) return
    const [windowId, itemId] = splitId(merged)
    if (this.hooks.emit) this.hooks.emit(windowId, 'shortcut.emit', itemId)
  }
}

module.exports = { ShortcutManager }
