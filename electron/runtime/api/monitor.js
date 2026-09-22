'use strict'

const { screen } = require('electron')

const { arg } = require('./helpers')

/**
 * monitor 命名空间 —— 4 个方法，对齐 crates/niva/src/app/api/monitor.rs
 *
 * 字段语义（照做）：
 *   size / position           → **逻辑像素**（原版 logical! 宏做 physical/scaleFactor）
 *   physicalSize / position   → 物理像素
 *   scaleFactor               → 缩放比
 *
 * Electron 的 Display.bounds 本身就是 DIP，也就是原版要的「逻辑像素」，
 * 所以 size/position 直接取 bounds；物理值再乘回 scaleFactor。
 */

function toMonitorInfo(display) {
  if (!display) return null
  const { x, y, width, height } = display.bounds
  const scale = display.scaleFactor || 1

  return {
    name: display.label || String(display.id),
    // 逻辑像素 = DIP，直接可用
    size: { width, height },
    position: { x, y },
    // 物理像素
    physicalSize: {
      width: Math.round(width * scale),
      height: Math.round(height * scale),
    },
    physicalPosition: {
      x: Math.round(x * scale),
      y: Math.round(y * scale),
    },
    scaleFactor: scale,
  }
}

function register(api) {
  api.register('monitor.list', ({ window: w }) => {
    const point = w.win.getBounds()
    const current = screen.getDisplayMatching(point)
    // 原版是 window.available_monitors()，等价于「当前窗口可见的那批显示器」
    const displays = screen.getAllDisplays()
    return displays.map(toMonitorInfo)
  })

  api.register('monitor.current', ({ window: w }) =>
    toMonitorInfo(screen.getDisplayMatching(w.win.getBounds())),
  )

  api.register('monitor.primary', () => toMonitorInfo(screen.getPrimaryDisplay()))

  api.register('monitor.fromPoint', ({ args }) =>
    // Electron 的 getDisplayNearestPoint 收 DIP，正好等于 Niva 传进来的逻辑坐标
    toMonitorInfo(screen.getDisplayNearestPoint({ x: Number(arg(args, 0)), y: Number(arg(args, 1)) })),
  )
}

module.exports = { register }
