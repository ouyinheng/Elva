<script setup>
/**
 * 窗口控制按钮 —— 对齐原版 app.tsx::WindowControl
 *
 * 两套形态：
 *   mac     → 左起 Close / Minimize / Fullscreen，12px 圆点（hover 时显示符号）
 *   windows → 左起 Minimize / Fullscreen / Close，46×44 方块（hover 变灰 / 关闭变红）
 * aria-label 固定为 Close / Minimize / Fullscreen —— 原版 CSS 正是按它选择器上色的，
 * 所以这三个字符串不能改。
 *
 * 与原版的两处不同（D2：修缺陷，已记入 docs/niva-parity.md）：
 *   1. 原版 macOS 分支写的是 `setMaximized(!true)`，恒等于 false —— 点全屏按钮
 *      只会把最大化状态关掉，窗口永远无法通过该按钮最大化。这里按 Windows 分支
 *      的正确语义实现。
 *   2. 原版用 useState(false) 硬编码初值，窗口本来就是最大化时图标会显示错。
 *      这里挂载时读一次真实状态。
 */
import { onMounted, ref } from 'vue'
import { useApp } from '@/devtools/models/app'
import { tryExit } from '@/devtools/utils'

defineProps({
  os: { type: String, required: true },
})

const app = useApp()
const isMaximized = ref(false)

onMounted(async () => {
  try {
    isMaximized.value = Boolean(await Niva.api.window.isMaximized())
  } catch {
    /* 取不到就保持 false，与原版初值一致 */
  }
})

function closeApp() {
  // tryExit：弹窗开着时会返回 APP_EXIT_PREVENTED_BY_DIALOG，那是正常结果，不弹错误框
  tryExit(app, app.exit())
}

function minimize() {
  Niva.api.window.setMinimized(true)
}

async function toggleMaximize() {
  const next = !isMaximized.value
  isMaximized.value = next
  await Niva.api.window.setMaximized(next)
}
</script>

<template>
  <div class="title-bar-controls">
    <!-- macOS：Close / Minimize / Fullscreen -->
    <template v-if="os === 'mac'">
      <button aria-label="Close" @click="closeApp">
        <svg x="0px" y="0px" width="10px" height="10px" viewBox="0 0 20 20">
          <polygon
            fill="#4d0000"
            points="15.9,5.2 14.8,4.1 10,8.9 5.2,4.1 4.1,5.2 8.9,10 4.1,14.8 5.2,15.9 10,11.1 14.8,15.9 15.9,14.8 11.1,10 "
          />
        </svg>
      </button>

      <button aria-label="Minimize" @click="minimize">
        <svg x="0px" y="0px" width="10px" height="10px" viewBox="0 0 20 20">
          <rect fill="#995700" x="2.4" y="9" width="15.1" height="2" />
        </svg>
      </button>

      <button aria-label="Fullscreen" @click="toggleMaximize">
        <svg
          v-if="isMaximized"
          x="0px"
          y="0px"
          width="10px"
          height="10px"
          viewBox="0 0 10 10"
        >
          <path
            fill="#006400"
            d="M5,10c0,0 0,-2.744 0,-4.167c0,-0.221 -0.088,-0.433 -0.244,-0.589c-0.156,-0.156 -0.368,-0.244 -0.589,-0.244c-1.423,0 -4.167,0 -4.167,0l5,5Z"
          />
          <path
            fill="#006400"
            d="M5,0c0,0 0,2.744 0,4.167c0,0.221 0.088,0.433 0.244,0.589c0.156,0.156 0.368,0.244 0.589,0.244c1.423,0 4.167,0 4.167,0l-5,-5Z"
          />
        </svg>
        <svg v-else x="0px" y="0px" width="10px" height="10px" viewBox="0 0 20 20">
          <path
            fill="#006400"
            d="M5.3,16H13L4,7v7.7C4.6,14.7,5.3,15.4,5.3,16z"
          />
          <path
            fill="#006400"
            d="M14.7,4H7l9,9V5.3C15.4,5.3,14.7,4.6,14.7,4z"
          />
        </svg>
      </button>
    </template>

    <!-- Windows：Minimize / Fullscreen / Close -->
    <template v-else>
      <button aria-label="Minimize" @click="minimize">
        <svg x="0px" y="0px" viewBox="0 0 10.2 1" width="10px" height="10px">
          <rect fill="rgba(0, 0, 0, .4)" width="10.2" height="1" />
        </svg>
      </button>

      <button aria-label="Fullscreen" @click="toggleMaximize">
        <svg
          v-if="isMaximized"
          x="0px"
          y="0px"
          viewBox="0 0 10.2 10.2"
          width="10px"
          height="10px"
        >
          <path
            fill="rgba(0, 0, 0, .4)"
            d="M2.1,0v2H0v8.1h8.2v-2h2V0H2.1z M7.2,9.2H1.1V3h6.1V9.2z M9.2,7.1h-1V2H3.1V1h6.1V7.1z"
          />
        </svg>
        <svg v-else x="0px" y="0px" viewBox="0 0 10.2 10.1" width="10px" height="10px">
          <path fill="rgba(0, 0, 0, .4)" d="M0,0v10.1h10.2V0H0z M9.2,9.2H1.1V1h8.1V9.2z" />
        </svg>
      </button>

      <button aria-label="Close" @click="closeApp">
        <svg
          x="0px"
          y="0px"
          viewBox="0 0 10.2 10.2"
          width="10px"
          height="10px"
        >
          <polygon
            fill="rgba(0, 0, 0, .4)"
            points="10.2,0.7 9.5,0 5.1,4.4 0.7,0 0,0.7 4.4,5.1 0,9.5 0.7,10.2 5.1,5.8 9.5,10.2 10.2,9.5 5.8,5.1 "
          />
        </svg>
      </button>
    </template>
  </div>
</template>
