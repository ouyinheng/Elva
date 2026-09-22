<script setup>
/**
 * 项目信息面板（右侧） —— 对齐原版 pages/project/info.tsx
 *
 * 两个 tab：「项目信息」与「项目配置」。配置有未保存修改时，
 * tab 文字变红并带星号（原版用 #F44336 + bold）。
 *
 * tab 条位于固定定位层（CSS 用 fixed + 负 margin 把它提到标题栏那一行），
 * 除按钮以外的区域按下即拖动窗口 —— 与原版的 onMouseDownCapture 判定一致。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import ProjectDetails from './ProjectDetails.vue'
import ConfigPanel from './ConfigPanel.vue'
import { useLocale, useProject } from '@/devtools/models/app'
import { SHORTCUT, onShortcut } from '@/devtools/composables/useShortcuts'

const locale = useLocale()
const project = useProject()

const tab = ref(0)

const isEdit = computed(() => project.state.editor.state.isEdit)

function onMenuMouseDown(event) {
  if (event.target.tagName !== 'BUTTON') {
    Niva.api.window.dragWindow()
  }
}

/* Cmd/Ctrl+1 / 2 直接切 tab（niva 原版只能点） */
let unsubscribe = null
onMounted(() => {
  unsubscribe = onShortcut({
    [SHORTCUT.switchTab]: (event) => {
      tab.value = event.detail === 1 ? 1 : 0
    },
  })
})
onUnmounted(() => {
  if (unsubscribe) unsubscribe()
})
</script>

<template>
  <section class="tabs">
    <menu
      class="tabs-menu"
      role="tablist"
      aria-label="Project Tabs"
      @mousedown.capture="onMenuMouseDown"
    >
      <button
        role="tab"
        aria-controls="detail-tab"
        :aria-selected="tab === 0"
        @click="tab = 0"
      >
        {{ locale.t('PROJECT_INFO') }}
      </button>
      <button
        role="tab"
        aria-controls="config-tab"
        :aria-selected="tab === 1"
        @click="tab = 1"
      >
        <span v-if="isEdit" style="color: #f44336; font-weight: bold">
          {{ locale.t('PROJECT_CONFIG') }}*
        </span>
        <template v-else>{{ locale.t('PROJECT_CONFIG') }}</template>
      </button>
    </menu>

    <!-- 用 v-show 而非 hidden 属性：hidden 的 display:none 来自 UA 样式表，
         很容易被组件样式里更高的选择器覆盖掉（历史上就出现过两个 tab 同时显示）。 -->
    <article v-show="tab === 0" class="tabs-panel" role="tabpanel" id="detail-tab">
      <ProjectDetails />
    </article>

    <article v-show="tab === 1" class="tabs-panel" role="tabpanel" id="config-tab">
      <ConfigPanel />
    </article>
  </section>
</template>
