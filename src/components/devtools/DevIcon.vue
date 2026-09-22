<script setup>
/**
 * 图标集 —— 替代原版依赖的 @icon-park/react
 *
 * 原版用到 9 个图标：Plus / FolderPlus / FolderOpen / Refresh（交互）
 * 以及 Apple / Windows / BookOne / GithubOne / Translate（状态栏）。
 * elva 不引入图标库，这里用 48×48 viewBox 的线性 SVG 复刻同样的视觉语汇，
 * 尺寸与颜色都走 currentColor + size 属性，保证和原版一致的调用方式：
 *   <DevIcon name="plus" size="17" />
 *   <DevIcon name="translate" class="icon-sm" />
 */
const props = defineProps({
  name: { type: String, required: true },
  size: { type: [String, Number], default: '1em' },
})
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <!-- 加号 -->
    <g v-if="name === 'plus'">
      <path
        d="M24 6v36M6 24h36"
        stroke="currentColor"
        stroke-width="4"
        stroke-linecap="round"
      />
    </g>

    <!-- 文件夹 + 加号 -->
    <g v-else-if="name === 'folder-plus'">
      <path
        d="M5 9h13l4 5h21a2 2 0 0 1 2 2v23a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V11a2 2 0 0 1 2-2z"
        stroke="currentColor"
        stroke-width="4"
        stroke-linejoin="round"
      />
      <path
        d="M24 20v12M18 26h12"
        stroke="currentColor"
        stroke-width="4"
        stroke-linecap="round"
      />
    </g>

    <!-- 打开的文件夹 -->
    <g v-else-if="name === 'folder-open'">
      <path
        d="M7 10h12l4 5h19v5"
        stroke="currentColor"
        stroke-width="4"
        stroke-linejoin="round"
      />
      <path
        d="M3 40l7-18h36l-7 18H3z"
        stroke="currentColor"
        stroke-width="4"
        stroke-linejoin="round"
      />
    </g>

    <!-- 刷新（环形箭头） -->
    <g v-else-if="name === 'refresh'">
      <path
        d="M40 22a17 17 0 1 0 1 9"
        stroke="currentColor"
        stroke-width="4"
        stroke-linecap="round"
      />
      <path
        d="M41 8v13H28"
        stroke="currentColor"
        stroke-width="4"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </g>

    <!-- Apple（实心剪影） -->
    <g v-else-if="name === 'apple'">
      <path
        fill="currentColor"
        d="M33.4 25.4c0-6.2 5-9.2 5.2-9.3-2.8-4.2-7.2-4.8-8.7-4.8-3.7-.4-7.2 2.2-9.1 2.2-1.9 0-4.8-2.2-7.9-2.1-4 .1-7.7 2.3-9.8 5.9-4.2 7.3-1.1 18.1 3 24 2 2.9 4.4 6.2 7.5 6.1 3-.1 4.2-2 7.8-2s4.7 2 7.9 1.9c3.3-.1 5.3-3 7.3-5.9 2.3-3.4 3.2-6.7 3.3-6.9-.1 0-6.3-2.4-6.4-9.1z"
      />
      <path
        fill="currentColor"
        d="M27.4 7.3c1.7-2 2.8-4.8 2.5-7.6-2.4.1-5.3 1.6-7 3.6-1.5 1.8-2.9 4.6-2.5 7.3 2.7.2 5.4-1.3 7-3.3z"
      />
    </g>

    <!-- Windows（四格） -->
    <g v-else-if="name === 'windows'">
      <rect x="5" y="10" width="16" height="13" fill="currentColor" />
      <rect x="25" y="8" width="18" height="15" fill="currentColor" />
      <rect x="5" y="27" width="16" height="13" fill="currentColor" />
      <rect x="25" y="27" width="18" height="15" fill="currentColor" />
    </g>

    <!-- 书本 -->
    <g v-else-if="name === 'book'">
      <path
        d="M8 7h26a4 4 0 0 1 4 4v26H12a4 4 0 0 1-4-4V7z"
        stroke="currentColor"
        stroke-width="4"
        stroke-linejoin="round"
      />
      <path
        d="M8 33a4 4 0 0 1 4-4h26"
        stroke="currentColor"
        stroke-width="4"
        stroke-linejoin="round"
      />
    </g>

    <!-- GitHub 标记 -->
    <g v-else-if="name === 'github'">
      <path
        fill="currentColor"
        d="M24 3C12.4 3 3 12.4 3 24c0 9.3 6 17.2 14.3 20 .1.1.3.1.4.1 1 0 1.4-.5 1.4-1.2v-3.5c-2.5.6-3.9-1.2-3.9-1.2-.6-1.6-1.6-2.1-1.6-2.1-1.3-.9.1-.9.1-.9 1.4.1 2.2 1.5 2.2 1.5 1.3 2.2 3.3 1.6 4.1 1.2.1-1 .5-1.6 1-2-3.1-.4-6.4-1.6-6.4-7 0-1.5.6-2.8 1.5-3.8-.2-.4-.6-1.9.1-3.9 0 0 1.2-.4 3.9 1.5 1.1-.3 2.3-.5 3.5-.5s2.4.2 3.5.5c2.7-1.9 3.9-1.5 3.9-1.5.7 2 .3 3.5.1 3.9.9 1 1.5 2.3 1.5 3.8 0 5.4-3.3 6.6-6.4 7 .5.5.9 1.4.9 2.7v4c0 .7.4 1.3 1.4 1.2C39.5 41.2 45 33.3 45 24 45 12.4 35.6 3 24 3z"
      />
    </g>

    <!-- 翻译（A + 文） -->
    <g v-else-if="name === 'translate'">
      <path
        d="M4 41L13 10l9 31M7.6 32h10.8"
        stroke="currentColor"
        stroke-width="4"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M27 14h15M34.5 7v7M27 14c0 9.5 4 16.5 9.5 21M42 14c0 9.5-4 16.5-9.5 21"
        stroke="currentColor"
        stroke-width="4"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </g>
    <!-- 放大镜（搜索空态用） -->
    <g v-else-if="name === 'search'">
      <circle cx="21" cy="21" r="13" stroke="currentColor" stroke-width="4" />
      <path
        d="M31 31l10 10"
        stroke="currentColor"
        stroke-width="4"
        stroke-linecap="round"
      />
    </g>

    <!-- 键盘（快捷键提示用） -->
    <g v-else-if="name === 'keyboard'">
      <rect
        x="3"
        y="11"
        width="42"
        height="26"
        rx="4"
        stroke="currentColor"
        stroke-width="4"
      />
      <path
        d="M11 19h2M19 19h2M27 19h2M35 19h2M11 27h20"
        stroke="currentColor"
        stroke-width="4"
        stroke-linecap="round"
      />
    </g>
  </svg>
</template>
