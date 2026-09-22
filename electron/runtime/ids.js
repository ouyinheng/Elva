'use strict'

/**
 * ID 体系 —— 严格对齐 crates/niva/src/app/utils.rs
 *
 * 原版是 u8（0-255）命名空间；菜单 / 托盘 / 快捷键的 item id 会与窗口 id 合并成 u16：
 *   merge_id(window_id, item_id) = (window_id << 8) | item_id
 * 因此「不同窗口可以用相同的 item id 而不冲突」是原版的既定行为，必须照做。
 */

/** 合并窗口 id 与条目 id（对齐 utils.rs::merge_id） */
function mergeId(windowId, itemId) {
  return ((windowId & 0xff) << 8) | (itemId & 0xff)
}

/** 拆回 (windowId, itemId)（对齐 utils.rs::split_id） */
function splitId(mergedId) {
  return [(mergedId >>> 8) & 0xff, mergedId & 0xff]
}

/**
 * 对齐 utils.rs::IdCounter。
 *
 * 注意原版的「粘性」语义：只有在候选 id 已被占用时才自增，
 * 成功返回时**不自增**。所以关闭一个窗口后，它的 id 会被下一个新窗口复用。
 * 这不是 bug，是必须保留的行为特征。
 */
class IdCounter {
  constructor() {
    this.nextId = 0
  }

  /**
   * @param {Set<number>} taken 已占用的 id 集合
   * @returns {number} 首个空闲 id
   */
  next(taken) {
    for (let i = 0; i < 255; i += 1) {
      const id = this.nextId
      if (taken.has(id)) {
        this.nextId += 1
        continue
      }
      return id
    }
    throw new Error('Failed to find a valid id.')
  }
}

module.exports = { mergeId, splitId, IdCounter }
