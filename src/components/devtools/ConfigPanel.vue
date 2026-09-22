<script setup>
/**
 * 配置面板 —— 「可视化 / JSON / 分屏」三种视图，共用同一份内容
 *
 * 两种编辑器都读写 `project.state.editor.state.content` 这一个字符串，
 * 所以同步是天然的：改哪边，另一边立刻反映，不需要互相监听。
 *
 * 分屏视图的存在意义：让「可视化改一下、看 JSON 变成什么」这件事一目了然，
 * 也方便用户随时切回手写 JSON。
 */
import { computed, ref } from 'vue'
import ConfigForm from './ConfigForm.vue'
import ConfigEditor from './ConfigEditor.vue'
import { useLocale, useProject } from '@/devtools/models/app'

const locale = useLocale()
const project = useProject()

/** 'form' | 'json' | 'split' */
const view = ref('form')

const editor = computed(() => project.state.editor)

/** JSON 是否合法（不合法时在切换条上给出提示，避免用户在表单里找不到字段而困惑） */
const jsonValid = computed(() => {
  try {
    const value = JSON.parse(editor.value.state.content)
    return value !== null && typeof value === 'object' && !Array.isArray(value)
  } catch {
    return false
  }
})

const views = computed(() => [
  { key: 'form', label: locale.t('VIEW_FORM') },
  { key: 'json', label: locale.t('VIEW_JSON') },
  { key: 'split', label: locale.t('VIEW_SPLIT') },
])

const showForm = computed(() => view.value === 'form' || view.value === 'split')
const showJson = computed(() => view.value === 'json' || view.value === 'split')
</script>

<template>
  <div class="config-panel">
    <div class="config-switch">
      <button
        v-for="item in views"
        :key="item.key"
        class="switch-btn"
        :aria-selected="view === item.key"
        @click="view = item.key"
      >
        {{ item.label }}
      </button>

      <span class="switch-spacer"></span>

      <span v-if="!jsonValid" class="switch-warning">
        {{ locale.t('CF_INVALID_JSON') }}
      </span>
    </div>

    <div :class="['config-body', { 'is-split': view === 'split' }]">
      <ConfigForm v-if="showForm" />
      <ConfigEditor v-if="showJson" />
    </div>
  </div>
</template>
