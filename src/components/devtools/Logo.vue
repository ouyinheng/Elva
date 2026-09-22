<script setup>
/**
 * 项目图标 —— 对齐原版 pages/project/logo.tsx
 *
 * 原版用 useState(props.src) 只取初始值，props 变化不会重置，
 * 导致「切换项目后右上角大图标不刷新」。这里补上 watch（D2：修缺陷，已记入差异表）。
 *
 * 读取失败时回落到内置默认图（logo-default.png），与原版一致。
 */
import { ref, watch } from 'vue'
import defaultLogo from '@/assets/devtools/logo-default.png'

const props = defineProps({
  src: { type: String, default: null },
})

const current = ref(props.src || defaultLogo)

watch(
  () => props.src,
  (value) => {
    current.value = value || defaultLogo
  },
)

function onError() {
  if (current.value !== defaultLogo) {
    current.value = defaultLogo
  }
}
</script>

<template>
  <img style="height: 100%; width: 100%" alt="logo" :src="current" @error="onError" />
</template>
