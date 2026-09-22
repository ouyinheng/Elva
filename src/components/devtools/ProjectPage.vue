<script setup>
/**
 * 项目页 —— 对齐原版 pages/project/index.tsx
 *
 * 左栏项目列表，右栏项目信息（未打开项目时只有一条可拖动的空 tab 条）。
 * 整页支持把文件夹拖进来直接导入。
 *
 * 相对原版的增强：**左栏宽度可拖拽**（原版写死 `width: 28%; min-width: 240px`，
 * 项目名长一点就被省略号截断，完整路径根本读不全）。
 *
 * 宽度策略：默认宽度仍由 CSS 的 `28%` 决定（`sidebarWidth === null` 时不写内联样式）。
 * 只有在用户真的拖过之后，才切换成像素值并由 JS 接管 —— 这样冷启动永远等于原版比例，
 * 不会因为「挂载瞬间读到的布局宽度还不准」而算出奇怪的初始值。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import ProjectList from './ProjectList.vue'
import ProjectInfo from './ProjectInfo.vue'
import DevIcon from './DevIcon.vue'
import { useApp, useLocale } from '@/devtools/models/app'
import { useFileDrop } from '@/devtools/composables/useFileDrop'

const app = useApp()
const locale = useLocale()

const { isHover } = useFileDrop(app)

const project = computed(() => app.state.project)

/* ------------------------------ 左栏宽度拖拽 ------------------------------ */

/** 下限与原版 min-width 一致 */
const SIDEBAR_MIN = 240
/** 上限；实际还会被「右栏至少留 INFO_MIN」进一步压低 */
const SIDEBAR_MAX = 560
/** 右栏最小可用宽度（与 CSS 里 .project-info 的 min-width 对齐） */
const INFO_MIN = 400
/** 分隔条自身占位宽度 */
const RESIZER_W = 5
const STORAGE_KEY = 'elva.sidebarWidth'

const pageRef = ref(null)
const dirRef = ref(null)

/** null = 跟随 CSS 的 28%（默认）；数字 = 用户拖拽后的像素宽度 */
const sidebarWidth = ref(null)
const resizing = ref(false)

/** 当前窗口尺寸下允许的最大宽度：窗口变窄时上限自动缩小，不会把右栏挤没 */
function maxWidth() {
  const total = pageRef.value?.clientWidth || window.innerWidth
  return Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, total - INFO_MIN - RESIZER_W))
}

function clampWidth(value) {
  // null / undefined / 空串 都表示「回到默认」，交给 CSS 的 28%
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  if (!Number.isFinite(number)) return null
  // 注意：这里**不能**把 `<= 0` 一并当作无效值 —— 往左拖过头算出来就是负数，
  // 那种情况应该夹到 SIDEBAR_MIN，而不是跳回默认宽度（否则拖到极限会突然变宽）。
  return Math.round(Math.min(Math.max(number, SIDEBAR_MIN), maxWidth()))
}

function applyWidth(value) {
  sidebarWidth.value = clampWidth(value)
}

/** 回到默认（清掉内联宽度，交还给 CSS 的 28%） */
function toDefault() {
  sidebarWidth.value = null
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // 隐私模式等场景下 localStorage 不可写，记不住也不影响本次使用
  }
}

const sidebarStyle = computed(() =>
  sidebarWidth.value == null ? {} : { width: sidebarWidth.value + 'px' },
)

let startX = 0
let startWidth = 0

function onResizeStart(event) {
  // 只响应左键，避免右键/中键把拖拽状态点开
  if (event.button !== 0) return
  const rect = dirRef.value?.getBoundingClientRect()
  if (!rect) return
  resizing.value = true
  startX = event.clientX
  // 起点用**实际渲染宽度**：无论它来自 CSS 的 28% 还是上次拖拽的内联值
  startWidth = rect.width
  window.addEventListener('mousemove', onResizeMove)
  window.addEventListener('mouseup', onResizeEnd)
  // 拖拽期间禁掉文本选中与 hover 反馈，否则会一边拖一边选中项目名
  document.body.classList.add('is-resizing-sidebar')
  event.preventDefault()
}

function onResizeMove(event) {
  applyWidth(startWidth + (event.clientX - startX))
}

function onResizeEnd() {
  resizing.value = false
  window.removeEventListener('mousemove', onResizeMove)
  window.removeEventListener('mouseup', onResizeEnd)
  document.body.classList.remove('is-resizing-sidebar')
  if (sidebarWidth.value == null) return
  try {
    localStorage.setItem(STORAGE_KEY, String(sidebarWidth.value))
  } catch {
    // 同上
  }
}

/** 双击分隔条回到默认宽度 */
function resetWidth() {
  toDefault()
}

/** 键盘微调：分隔条聚焦后 ←/→ 每次 16px，Home 回默认 */
function onResizerKeydown(event) {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault()
    const current =
      dirRef.value?.getBoundingClientRect().width ?? sidebarWidth.value ?? SIDEBAR_MIN
    applyWidth(current + (event.key === 'ArrowLeft' ? -16 : 16))
  } else if (event.key === 'Home') {
    event.preventDefault()
    toDefault()
  }
}

let observer = null

onMounted(() => {
  let saved = null
  try {
    saved = localStorage.getItem(STORAGE_KEY)
  } catch {
    saved = null
  }
  if (saved !== null) applyWidth(saved)

  // 窗口尺寸变化后把已保存的像素宽度重新夹到合法区间。
  // 用 ResizeObserver 而不是 window.resize：前者也能覆盖布局层面的尺寸变化。
  if (typeof ResizeObserver !== 'undefined' && pageRef.value) {
    observer = new ResizeObserver(() => {
      // null 表示跟随 CSS，无需处理
      if (sidebarWidth.value != null) applyWidth(sidebarWidth.value)
    })
    observer.observe(pageRef.value)
  }
})

onBeforeUnmount(() => {
  if (observer) observer.disconnect()
  window.removeEventListener('mousemove', onResizeMove)
  window.removeEventListener('mouseup', onResizeEnd)
  document.body.classList.remove('is-resizing-sidebar')
})
</script>

<template>
  <div ref="pageRef" class="project-page">
    <div ref="dirRef" class="directory" :style="sidebarStyle">
      <ProjectList />
    </div>

    <div
      :class="['sidebar-resizer', { 'is-active': resizing }]"
      role="separator"
      aria-orientation="vertical"
      aria-label="调整项目列表宽度"
      :aria-valuenow="sidebarWidth === null ? undefined : sidebarWidth"
      :aria-valuemin="SIDEBAR_MIN"
      :aria-valuemax="SIDEBAR_MAX"
      tabindex="0"
      title="拖拽调整宽度，双击恢复默认"
      @mousedown="onResizeStart"
      @dblclick="resetWidth"
      @keydown="onResizerKeydown"
    ></div>

    <div class="project-info">
      <ProjectInfo v-if="project" />
      <div v-else class="tabs">
        <div class="tabs-menu" @mousedown.capture="Niva.api.window.dragWindow()"></div>
      </div>
    </div>

    <div v-if="isHover" class="project-page-uploader">
      <div class="project-page-uploader-content">
        <DevIcon name="plus" :size="48" />
        {{ locale.t('DROP_HERE') }}
      </div>
    </div>
  </div>
</template>
