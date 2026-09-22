'use strict'

const { Menu, nativeImage } = require('electron')

const { mergeId, splitId } = require('./ids')
const { normalizeAccelerator } = require('./accelerator')

/**
 * 菜单 —— 对齐 crates/niva/src/app/menu/ 与 window_manager/builder.rs::build_menu
 *
 * 两个必须保留的行为：
 *   1. 只有 `type: "item"` 的项才派发 `menu.clicked`；`native` 项由系统处理
 *   2. item id 进 Electron 之前要先 merge_id(windowId, itemId)，
 *      点回来时再 split_id 还原成纯 item id
 *
 * Electron 的 MenuItem.id 只能是字符串，所以这里用 mergeId 的十进制字符串作 id，
 * 点击时反解回 itemId —— 对外的 `menu.clicked` 载荷与原版一致。
 */

/** NativeLabel（camelCase）→ Electron role（对齐 menu/mod.rs::build_native_item） */
const NATIVE_ROLE = {
  hide: 'hide',
  services: 'services',
  hideOthers: 'hideOthers',
  showAll: 'unhide',
  closeWindow: 'close',
  quit: 'quit',
  copy: 'copy',
  cut: 'cut',
  undo: 'undo',
  redo: 'redo',
  selectAll: 'selectAll',
  paste: 'paste',
  enterFullScreen: 'togglefullscreen',
  minimize: 'minimize',
  zoom: 'zoom',
}

/** macOS 专属 role，在别的平台上照搬会得到无效项 */
const MAC_ONLY_ROLES = new Set([
  'hide',
  'services',
  'hideOthers',
  'unhide',
  'close',
  'quit',
  'zoom',
  'togglefullscreen',
])

const NATIVE_LABEL_TEXT = {
  hide: 'Hide',
  services: 'Services',
  hideOthers: 'Hide Others',
  showAll: 'Show All',
  closeWindow: 'Close Window',
  quit: 'Quit',
  copy: 'Copy',
  cut: 'Cut',
  undo: 'Undo',
  redo: 'Redo',
  selectAll: 'Select All',
  paste: 'Paste',
  enterFullScreen: 'Enter Full Screen',
  minimize: 'Minimize',
  zoom: 'Zoom',
  separator: 'Separator',
}

function buildNativeItem(label) {
  if (label === 'separator') return { type: 'separator' }

  const role = NATIVE_ROLE[label]
  if (!role) return { label: String(label), enabled: false }

  if (process.platform !== 'darwin' && MAC_ONLY_ROLES.has(role)) {
    // 非 macOS 上这些 role 无意义，降级成不可点的同名项（记入差异表）
    return { label: NATIVE_LABEL_TEXT[label] || String(label), enabled: false }
  }
  return { role }
}

/**
 * 构建模板（对齐 build_custom_menu）
 * @param {number} windowId
 * @param {Array} options MenuOptions
 * @param {(itemId:number, windowId:number)=>void} onClick
 */
function buildTemplate(windowId, options, onClick) {
  return (options || []).map((option) => {
    if (!option || typeof option !== 'object') {
      return { label: String(option), enabled: false }
    }

    if (option.type === 'native') return buildNativeItem(option.label)

    if (option.type === 'menu') {
      return {
        label: option.label,
        enabled: option.enabled === undefined ? true : option.enabled,
        submenu: buildTemplate(windowId, option.children, onClick),
      }
    }

    if (option.type === 'item') {
      const itemId = Number(option.id) & 0xff
      const merged = mergeId(windowId, itemId)
      const item = {
        id: String(merged),
        label: option.label,
        click: () => onClick(itemId, windowId),
      }
      if (option.enabled !== undefined) item.enabled = option.enabled
      if (option.selected !== undefined) {
        // 原版用 with_selected；Electron 用勾选项表达
        item.type = 'checkbox'
        item.checked = Boolean(option.selected)
      }
      // 原版只在 macOS 上设置加速键与图标；Electron 两端都支持（超集，记入差异表）
      // 加速键同样要过一遍归一化：原版吃 W3C code 名，Electron 不认
      if (option.accelerator) {
        item.accelerator = normalizeAccelerator(option.accelerator)
      }
      if (option.icon) {
        try {
          item.icon = nativeImage.createFromPath(option.icon)
        } catch {
          /* 图标读取失败按原版处理：静默忽略 */
        }
      }
      return item
    }

    return { label: String(option.label || ''), enabled: false }
  })
}

/**
 * macOS 默认菜单 —— 对齐 builder.rs::macos_default_menu
 *
 * 原版在 macOS 上「没有配置菜单」时并不是不挂菜单，而是挂这个默认菜单，
 * 所以 `switch_menu()` 在 macOS 上永远有东西可挂。这一条必须复制，
 * 否则 macOS 上会出现「应用菜单整个消失」的错误行为。
 */
const MAC_DEFAULT_MENU = [
  {
    label: '',
    enabled: true,
    children: [
      { type: 'native', label: 'selectAll' },
      { type: 'native', label: 'copy' },
      { type: 'native', label: 'paste' },
      { type: 'native', label: 'cut' },
      { type: 'native', label: 'undo' },
      { type: 'native', label: 'separator' },
      { type: 'native', label: 'quit' },
    ],
  },
]

/**
 * 构建窗口根菜单（对齐 build_menu）
 * 根层级是 `{label, enabled, children}`，children 才是 MenuOptions。
 */
function buildWindowMenu(windowId, menuOptions, onClick) {
  let effective = menuOptions
  if (process.platform === 'darwin' && (!effective || !effective.length)) {
    effective = MAC_DEFAULT_MENU
  }
  if (!effective || !effective.length) return null

  const template = effective.map((root) => ({
    label: root.label,
    enabled: root.enabled === undefined ? true : root.enabled,
    submenu: buildTemplate(windowId, root.children, onClick),
  }))
  return Menu.buildFromTemplate(template)
}

/** 托盘菜单（对齐 tray_manager::build_menu，children 直接就是 MenuOptions） */
function buildContextMenu(windowId, menuOptions, onClick) {
  if (!menuOptions || !menuOptions.length) return null
  return Menu.buildFromTemplate(buildTemplate(windowId, menuOptions, onClick))
}

/**
 * 把菜单挂到窗口上。
 *
 * Electron 在 macOS 上不支持 per-window 菜单（只有应用级菜单），
 * 而原版恰好也是靠 `WindowEvent::Focused` 里调 `switch_menu()` 切菜单的
 * （见 event_handler.rs），所以这里按「焦点切换时替换应用菜单」实现，语义等价。
 */
function applyMenu(nivaWindow, menu) {
  const win = nivaWindow.win
  if (win.isDestroyed()) return
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(menu || null)
  } else {
    win.setMenu(menu || null)
  }
}

module.exports = {
  buildNativeItem,
  buildWindowMenu,
  buildContextMenu,
  applyMenu,
  splitId,
}
