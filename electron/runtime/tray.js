'use strict'

const { Tray, Menu } = require('electron')

const { IdCounter, mergeId, splitId } = require('./ids')
const { buildContextMenu } = require('./menu')

/**
 * 托盘 —— 对齐 crates/niva/src/app/tray_manager/mod.rs
 *
 * 原版行为要点（照做）：
 *   - id 是「粘性」的 u8，由独立 IdCounter 分配
 *   - 托盘归属某个窗口；destroy/update 时若 window_id 不匹配则报错
 *   - 托盘菜单的 item id 同样走 merge_id，点击派发 `menu.clicked`（与窗口菜单共用一套 MenuId）
 *   - create 的菜单项 id 记进 menu_ids 集合，`get_window_id_by_menu_id` 靠它反查窗口
 */
class TrayManager {
  constructor(hooks) {
    this.hooks = hooks || {}
    this.idCounter = new IdCounter()
    /** @type {Map<number, {windowId:number, menuIds:Set<number>, tray:Tray, window:object}>} */
    this.trays = new Map()
  }

  create(windowId, options, nivaWindow) {
    const id = this.idCounter.next(new Set(this.trays.keys()))

    const tray = new Tray(this._resolveIcon(options.icon))

    const menuIds = new Set()
    if (options.menu) collectMenuIds(options.menu, menuIds)

    const menu = options.menu
      ? buildContextMenu(windowId, options.menu, (itemId, wid) => this._onMenuClick(wid, itemId))
      : null
    if (menu) tray.setContextMenu(menu)

    if (options.tooltip) tray.setToolTip(options.tooltip)
    if (process.platform === 'darwin' && options.title) tray.setTitle(options.title)

    // 对齐 event_handler.rs::handle_tray_event
    tray.on('click', () => this._emit(windowId, id, 'leftClicked'))
    tray.on('right-click', () => this._emit(windowId, id, 'rightClicked'))
    tray.on('double-click', () => this._emit(windowId, id, 'doubleClicked'))

    this.trays.set(id, { windowId, menuIds, tray, window: nivaWindow })
    return id
  }

  get(id) {
    const found = this.trays.get(id)
    if (!found) throw new Error(`Tray with id ${id} not found`)
    return found
  }

  destroy(windowId, id) {
    const found = this.get(id)
    if (found.windowId !== windowId) {
      throw new Error(`Tray with id ${id} can only unregister in window ${found.windowId}`)
    }
    this.trays.delete(id)
    found.tray.destroy()
  }

  destroyAll(windowId) {
    for (const id of this._idsOf(windowId)) this.destroy(windowId, id)
  }

  list(windowId) {
    return this._idsOf(windowId)
  }

  update(windowId, id, options) {
    const found = this.get(id)
    if (found.windowId !== windowId) {
      throw new Error(`Tray with id ${id} can only update in window ${found.windowId}`)
    }

    if (options.icon) found.tray.setImage(this._resolveIcon(options.icon))
    if (process.platform === 'darwin' && options.title) found.tray.setTitle(options.title)
    // 原版 update 只处理 icon 与 title(macOS)，tooltip / menu 被忽略。
    // 类型声明里写了这两个字段，按「修复缺陷 + 记录」的原则这里补上 —— 见 D2 / 差异表。
    if (options.tooltip) found.tray.setToolTip(options.tooltip)
    if (options.menu) {
      const menu = buildContextMenu(windowId, options.menu, (itemId, wid) =>
        this._onMenuClick(wid, itemId),
      )
      found.tray.setContextMenu(menu || Menu.buildFromTemplate([]))
      found.menuIds.clear()
      collectMenuIds(options.menu, found.menuIds)
    }
  }

  /** 对齐 get_window_id_by_menu_id */
  windowIdByMenuId(menuId) {
    for (const [, entry] of this.trays) {
      if (entry.menuIds.has(menuId)) return entry.windowId
    }
    return null
  }

  _idsOf(windowId) {
    const ids = []
    for (const [id, entry] of this.trays) if (entry.windowId === windowId) ids.push(id)
    return ids
  }

  _emit(windowId, trayId, kind) {
    if (this.hooks.emit) this.hooks.emit(windowId, `tray.${kind}`, trayId)
  }

  _onMenuClick(windowId, itemId) {
    if (this.hooks.emit) this.hooks.emit(windowId, 'menu.clicked', itemId)
  }

  _resolveIcon(iconPath) {
    if (this.hooks.loadIcon) return this.hooks.loadIcon(iconPath)
    throw new Error(`无法加载托盘图标: ${iconPath}`)
  }
}

/** 收集菜单里的 item id（对齐 tray_manager::get_menu_ids） */
function collectMenuIds(options, out) {
  for (const item of options || []) {
    if (!item || typeof item !== 'object') continue
    if (item.type === 'item') out.add(Number(item.id) & 0xff)
    else if (item.type === 'menu') collectMenuIds(item.children, out)
  }
}

module.exports = { TrayManager, collectMenuIds, mergeId, splitId }
