<script setup>
/**
 * 自绘标题栏
 *
 * 与 niva 原版的关键差异（刻意改进，不是缺陷）：
 *
 *   macOS   **不渲染**窗口控制按钮。mac 会把红绿灯固定在左上角，
 *           位置、间距、hover 符号、失焦变灰全部由系统负责；自绘一套既不准，
 *           也会和系统那套并排/重叠。我们只让出左侧约 78px 的空间给它们。
 *   Windows 系统没有原生按钮（窗口是无边框的），所以自绘
 *           Minimize / Maximize / Close 三个方块按钮。
 *
 * 其余细节：
 *   1. 图标 src 用 import 而非 /logo.png：打包后走 file:// 协议，绝对路径会 404。
 *   2. 窗口拖动由 CSS 的 `-webkit-app-region: drag` 完成（Electron 没有编程式拖动）。
 *      原本这里还在 mousedown 时调一次 `window.dragWindow()`，但它在本实现里是空操作
 *      且每次点击都会打一条「已降级」告警 —— 改成双击标题栏切换最大化，更实用。
 */
import { computed } from 'vue'
import WindowControl from './WindowControl.vue'
import logoUrl from '@/assets/devtools/logo.png'

const props = defineProps({
  os: { type: String, required: true },
})

/** 只有非 macOS 才需要自绘按钮 */
const needsCustomControls = computed(() => props.os !== 'mac')

/**
 * 双击标题栏切换最大化。
 *
 * macOS 上不做任何事：系统本身就在处理「双击标题栏」这件事（跟随
 * 系统设置里的「双击标题栏时…」偏好），我们插手反而会变成双重行为。
 * Windows 上无边框窗口没有原生标题栏行为，只能自己实现。
 */
async function onTitleBarDblClick() {
  if (props.os === 'mac') return
  const maximized = await Niva.api.window.isMaximized()
  await Niva.api.window.setMaximized(!maximized)
}
</script>

<template>
  <div class="title-bar" @dblclick="onTitleBarDblClick">
    <WindowControl v-if="needsCustomControls" :os="os" />
    <div class="title-bar-text">
      <img class="window-icon" :src="logoUrl" alt="" />
      ELVA
    </div>
  </div>
</template>
