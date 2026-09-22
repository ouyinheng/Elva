<script setup>
/**
 * 导入页 —— 对齐原版 pages/import/index.tsx
 *
 * 历史为空时（首次打开）显示的引导页：
 * 虚线框 + 拖拽提示 + 「选择项目」（绿底主按钮）与「新建项目」两个按钮。
 * 拖拽悬停时虚线框变绿、背景淡绿，按钮组半透明。
 */
import DevIcon from './DevIcon.vue'
import { useApp, useLocale } from '@/devtools/models/app'
import { tryOrAlert } from '@/devtools/utils'
import { useFileDrop } from '@/devtools/composables/useFileDrop'

const app = useApp()
const locale = useLocale()

const { isHover } = useFileDrop(app)
</script>

<template>
  <div class="import-page">
    <div :class="['file-uploader', { active: isHover }]">
      <div class="file-uploader__tips">
        <DevIcon name="plus" :size="36" />
        {{ locale.t('UPLOAD_TIPS') }}
      </div>

      <div class="file-uploader__btns">
        <button
          class="btn btn-bg btn-primary"
          @click="tryOrAlert(app, app.openWithPicker())"
        >
          <i class="icon-sm icon-folder"></i>
          {{ locale.t('OPEN_PROJECT') }}
        </button>

        <button
          class="btn btn-bg"
          style="margin-left: 6px"
          @click="tryOrAlert(app, app.create())"
        >
          <i class="icon-sm icon-plus-black"></i>
          {{ locale.t('NEW_PROJECT') }}
        </button>
      </div>
    </div>
  </div>
</template>
