'use strict'

const { nativeTheme } = require('electron')

const { arg, optional, resolveWindow } = require('./helpers')

/**
 * windowExtra 命名空间 —— 对齐 crates/niva/src/app/api/window_extra.rs
 *
 * 原版按平台注册两批互斥的方法：
 *   Windows(7)：setEnable / setTaskbarIcon / theme / resetDeadKeys / beginResizeDrag
 *               / setSkipTaskbar / setUndecoratedShadow
 *   macOS(10)  ：simpleFullscreen / setSimpleFullscreen / hasShadow / setHasShadow
 *               / setIsDocumentEdited / isDocumentEdited / setAllowsAutomaticWindowTabbing
 *               / allowsAutomaticWindowTabbing / setTabbingIdentifier / tabbingIdentifier
 *
 * 所以这里也按平台注册 —— 在 macOS 上调用 windowExtra.setSkipTaskbar 会得到
 * "api not found"，与原版一致。
 *
 * 返回值注意：`setSimpleFullscreen` 原版与类型声明都返回 **boolean**（不是 void）。
 */

const warned = new Set()
function warnDegraded(api, detail) {
  if (warned.has(api)) return
  warned.add(api)
  console.warn(`[elva:niva] ${api} 已降级/无对应能力：${detail}（详见 docs/niva-parity.md）`)
}

function registerWindows(api) {
  api.register('windowExtra.setEnable', ({ window: w, args }) => {
    const enabled = Boolean(arg(args, 0))
    const target = resolveWindow(w.deps, w, optional(args, 1))
    target.win.setEnabled(enabled)
    return null
  })

  api.register('windowExtra.setTaskbarIcon', ({ window: w, args, ctx }) => {
    const iconPath = String(arg(args, 0))
    const target = resolveWindow(w.deps, w, optional(args, 1))
    target.win.setIcon(ctx.resource.loadIcon(iconPath))
    return null
  })

  api.register('windowExtra.theme', ({ window: w, args }) => {
    resolveWindow(w.deps, w, optional(args, 0))
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  })

  api.register('windowExtra.resetDeadKeys', () => {
    warnDegraded('windowExtra.resetDeadKeys', 'Electron 无对应 API')
    return null
  })

  api.register('windowExtra.beginResizeDrag', () => {
    warnDegraded('windowExtra.beginResizeDrag', 'Electron 无公开 API；改用 CSS -webkit-app-region 或 frame 自绘')
    return null
  })

  api.register('windowExtra.setSkipTaskbar', ({ window: w, args }) => {
    const skip = Boolean(arg(args, 0))
    resolveWindow(w.deps, w, optional(args, 1)).win.setSkipTaskbar(skip)
    return null
  })

  api.register('windowExtra.setUndecoratedShadow', () => {
    warnDegraded('windowExtra.setUndecoratedShadow', 'Electron 无对应 API')
    return null
  })
}

function registerMacos(api) {
  api.register('windowExtra.simpleFullscreen', ({ window: w, args }) =>
    resolveWindow(w.deps, w, optional(args, 0)).win.isSimpleFullScreen(),
  )

  api.register('windowExtra.setSimpleFullscreen', ({ window: w, args }) => {
    const fullscreen = Boolean(arg(args, 0))
    const target = resolveWindow(w.deps, w, optional(args, 1))
    target.win.setSimpleFullScreen(fullscreen)
    // 原版返回的是切换后的状态，这里回读一次保持一致
    return target.win.isSimpleFullScreen()
  })

  // 原版注册了但类型声明里没有 → 保留实现（D2）
  api.register('windowExtra.hasShadow', ({ window: w, args }) =>
    resolveWindow(w.deps, w, optional(args, 0)).win.hasShadow(),
  )

  api.register('windowExtra.setHasShadow', ({ window: w, args }) => {
    const hasShadow = Boolean(arg(args, 0))
    resolveWindow(w.deps, w, optional(args, 1)).win.setHasShadow(hasShadow)
    return null
  })

  api.register('windowExtra.setIsDocumentEdited', ({ window: w, args }) => {
    const edited = Boolean(arg(args, 0))
    resolveWindow(w.deps, w, optional(args, 1)).win.setDocumentEdited(edited)
    return null
  })

  api.register('windowExtra.isDocumentEdited', ({ window: w, args }) =>
    resolveWindow(w.deps, w, optional(args, 0)).win.isDocumentEdited(),
  )

  api.register('windowExtra.setAllowsAutomaticWindowTabbing', () => {
    warnDegraded('windowExtra.setAllowsAutomaticWindowTabbing', 'Electron 无窗口级 Tabbing API')
    return null
  })

  api.register('windowExtra.allowsAutomaticWindowTabbing', () => {
    warnDegraded('windowExtra.allowsAutomaticWindowTabbing', 'Electron 无窗口级 Tabbing API')
    return false
  })

  api.register('windowExtra.setTabbingIdentifier', () => {
    warnDegraded('windowExtra.setTabbingIdentifier', 'Electron 只支持创建时通过 tabbingIdentifier 指定，无法运行时修改')
    return null
  })

  api.register('windowExtra.tabbingIdentifier', ({ window: w, args }) => {
    warnDegraded('windowExtra.tabbingIdentifier', 'Electron 无法回读 tabbingIdentifier')
    resolveWindow(w.deps, w, optional(args, 0))
    return ''
  })
}

function register(api) {
  if (process.platform === 'win32') registerWindows(api)
  else if (process.platform === 'darwin') registerMacos(api)
}

module.exports = { register }
