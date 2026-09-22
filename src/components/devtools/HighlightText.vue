<script setup>
/**
 * 关键词高亮 —— 对齐原版 pages/project/list.tsx::Highlighter
 *
 * 命中片段着 #35dd8e（原版把旧的蓝色注释掉后统一改成绿色主题色）。
 */
import { computed } from 'vue'

const props = defineProps({
  text: { type: String, required: true },
  highlight: { type: String, default: '' },
})

const parts = computed(() =>
  props.highlight
    ? props.text.split(new RegExp(`(${props.highlight.toLowerCase()})`, 'gi'))
    : [props.text],
)

function isMatch(part) {
  return part.toLowerCase() === props.highlight.toLowerCase()
}
</script>

<template>
  <span
    v-for="(part, i) in parts"
    :key="i"
    :style="isMatch(part) ? { color: '#35dd8e' } : undefined"
    >{{ part }}</span
  >
</template>
