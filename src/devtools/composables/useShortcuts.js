/**
 * 全局快捷键 —— elva 新增能力（niva 原版没有任何键盘操作）
 *
 * 设计：`App.vue` 只在 window 上装**一个** keydown 监听，命中后 dispatch 一个
 * CustomEvent；各组件用 `onShortcut()` 按需订阅。这样键盘定义集中在一处，
 * 组件之间零耦合，也不会出现多个监听器互相抢事件。
 *
 * 键位选择刻意避开浏览器/Electron 的默认行为：
 *   Cmd/Ctrl+R（刷新）、Cmd/Ctrl+W（关窗）、Cmd/Ctrl+Q（退出）**一律不占用**，
 *   留给系统与开发时的调试习惯。所以「调试项目」用 D 而不是 R。
 */

export const SHORTCUT = {
  focusSearch: 'elva:shortcut:focus-search',
  clearSearch: 'elva:shortcut:clear-search',
  newProject: 'elva:shortcut:new-project',
  openProject: 'elva:shortcut:open-project',
  debug: 'elva:shortcut:debug',
  build: 'elva:shortcut:build',
  switchTab: 'elva:shortcut:switch-tab',
}

/** 主动派发（也可供组件之间复用） */
export function dispatchShortcut(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail }))
}

/**
 * 在组件里订阅快捷键。
 * @param {Record<string, Function>} handlers 形如 { [SHORTCUT.debug]: () => {} }
 * @returns {Function} 取消订阅
 */
export function onShortcut(handlers) {
  const entries = Object.entries(handlers)
  for (const [name, fn] of entries) {
    window.addEventListener(name, fn)
  }
  return () => {
    for (const [name, fn] of entries) {
      window.removeEventListener(name, fn)
    }
  }
}

/** 模态框开着时不响应「非输入类」快捷键，避免误触 */
function isModalOpen() {
  return Boolean(document.querySelector('.modal-container'))
}

/** 焦点在输入框 / 文本域 / 可编辑元素里 */
function isTyping(target) {
  if (!target || !target.tagName) return false
  const tag = target.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || target.isContentEditable === true
}

/**
 * 键位表：`键` → { event, detail }。
 * 用 `event.key.toLowerCase()` 匹配，避免依赖 code（不同键盘布局会变）。
 */
const KEYMAP = {
  f: { event: SHORTCUT.focusSearch, allowInInput: true },
  n: { event: SHORTCUT.newProject, allowInInput: true },
  o: { event: SHORTCUT.openProject, allowInInput: true },
  d: { event: SHORTCUT.debug, allowInInput: true },
  b: { event: SHORTCUT.build, allowInInput: true },
  '1': { event: SHORTCUT.switchTab, detail: 0, allowInInput: true },
  '2': { event: SHORTCUT.switchTab, detail: 1, allowInInput: true },
}

/**
 * 安装全局键盘监听。
 * @returns {Function} 卸载函数
 */
export function installGlobalShortcuts() {
  function onKeydown(event) {
    const mod = event.metaKey || event.ctrlKey

    // Esc：清空搜索 / 关掉最上层弹窗（弹窗自己处理 Esc，这里只兜搜索）
    if (event.key === 'Escape') {
      if (!isModalOpen() && !isTyping(event.target)) {
        dispatchShortcut(SHORTCUT.clearSearch)
      }
      return
    }

    if (!mod || event.altKey) return

    const binding = KEYMAP[event.key.toLowerCase()]
    if (!binding) return

    // 修饰键组合在输入框里也应生效（Cmd+N 不是文本编辑操作），
    // 但弹窗打开时一律让位给弹窗
    if (isModalOpen()) return
    if (!binding.allowInInput && isTyping(event.target)) return

    event.preventDefault()
    dispatchShortcut(binding.event, binding.detail)
  }

  window.addEventListener('keydown', onKeydown)
  return () => window.removeEventListener('keydown', onKeydown)
}
