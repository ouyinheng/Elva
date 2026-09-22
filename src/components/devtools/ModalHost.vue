<script setup>
/**
 * 模态框宿主 —— 对齐原版 modals/index.tsx
 *
 * 四种模态：
 *   native   空白占位（showNative 用它遮挡 50ms，让原生对话框先浮上来）
 *   alert    单确认
 *   confirm  取消 / 确认
 *   progress 进度（progress > 0 显示百分比与进度条，否则显示 marquee）
 *
 * 只有栈顶模态带 .modal-active 遮罩（与原版 `modals.length === i + 1` 判定一致）。
 * 「已完成 N%」是原版硬编码的中文文案，未走 i18n —— 这里保持原样。
 */
import { computed } from 'vue'
import { useLocale, useModal } from '@/devtools/models/app'

const modal = useModal()
const locale = useLocale()

const modals = computed(() => modal.state)

function close(item) {
  item.close()
}

function resolveAlert(item) {
  item.close()
  item.props.promise.resolve()
}

function resolveConfirm(item, value) {
  item.close()
  item.props.promise.resolve(value)
}
</script>

<template>
  <div v-if="modals.length > 0" class="modal-container">
    <div
      v-for="(item, i) in modals"
      :key="item.id"
      :class="['modal', { 'modal-active': modals.length === i + 1 }]"
    >
      <!-- 原生对话框占位：不渲染任何内容 -->
      <template v-if="item.type === 'native'"></template>

      <div v-else-if="item.type === 'alert'" class="window active is-bright">
        <i class="icon-close" @click="resolveAlert(item)"></i>
        <div class="window-body has-space">
          <h4>{{ item.props.title }}</h4>
          <p>{{ item.props.message }}</p>
        </div>
        <footer style="text-align: right">
          <button class="btn btn-md btn-primary" @click="resolveAlert(item)">
            {{ locale.t('CONFIRM') }}
          </button>
        </footer>
      </div>

      <div v-else-if="item.type === 'confirm'" class="window active is-bright">
        <i class="icon-close" @click="resolveConfirm(item, false)"></i>
        <div class="window-body has-space">
          <h4>{{ item.props.title }}</h4>
          <p>{{ item.props.message }}</p>
        </div>
        <footer style="text-align: right">
          <button
            class="btn btn-md"
            style="margin-right: 6px"
            @click="resolveConfirm(item, false)"
          >
            {{ locale.t('CANCEL') }}
          </button>
          <button class="btn btn-md btn-primary" @click="resolveConfirm(item, true)">
            {{ locale.t('CONFIRM') }}
          </button>
        </footer>
      </div>

      <div v-else-if="item.type === 'progress'" class="window active is-bright">
        <div class="window-body has-space progress">
          <h4 class="instruction instruction-primary">{{ item.props.title }}</h4>

          <template v-if="item.props.progress.state.progress > 0">
            <p>{{ locale.t('PROGRESS_DONE', { percent: Math.floor(item.props.progress.state.progress * 100) }) }}</p>
            <div role="progressbar" class="progressbar">
              <div
                :style="{ width: item.props.progress.state.progress * 100 + '%' }"
                class="progressbar-animated"
              ></div>
            </div>
          </template>
          <div v-else role="progressbar" class="marquee"></div>

          <p>{{ item.props.progress.state.text }}</p>
        </div>
      </div>
    </div>
  </div>
</template>
