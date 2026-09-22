<script setup>
/**
 * 项目详情 —— 对齐原版 pages/project/details.tsx
 *
 * 上半区：项目 Logo + 名称 + 目录 + UUID，右上「打开 / 刷新」，左下「调试 / 构建」
 * 下半区：基本信息（配置文件）、调试信息（调试入口=entry、资源目录）、
 *         构建信息（资源目录，缺失时显示「(默认)」）
 *
 * 相对原版修掉一处文案错标：原版把「项目名称」当成 debug.entry 的标签用（详见差异表 B-8），
 * 这里改用 DEBUG_ENTRY（「调试入口」/ "Debug Entry"）。
 *
 * 与原版一致：调试与构建直接调 model 方法（错误在 model 内部转模态框），
 * 打开与刷新走 tryOrAlert。
 */
import Logo from '@/components/devtools/Logo.vue'
import DevIcon from '@/components/devtools/DevIcon.vue'
import { useApp, useLocale, useProject } from '@/devtools/models/app'
import { limitString, tryOrAlert } from '@/devtools/utils'

const app = useApp()
const locale = useLocale()
const project = useProject()
</script>

<template>
  <div class="project-detail">
    <section class="pd-base">
      <div class="pd-lf">
        <div class="pd-lf__info-container">
          <span>
            <Logo :src="project.state.icon" />
          </span>
          <div class="info-container">
            <h3>{{ project.state.name }}</h3>
            <p :title="project.state.path">
              {{ locale.t('PROJECT_PATH') }} :
              {{ limitString(project.state.path, 50) }}
            </p>
            <p>UUID: {{ project.state.uuid }}</p>
          </div>
        </div>
        <div>
          <button class="btn" @click="project.debug()">
            {{ locale.t('DEBUG') }}
          </button>
          <button class="btn btn-primary" @click="project.build()">
            {{ locale.t('BUILD') }}
          </button>
        </div>
      </div>

      <div class="pd-rt">
        <button class="btn btn-md btn-info" @click="tryOrAlert(app, project.open())">
          <DevIcon name="folder-open" /> {{ locale.t('OPEN') }}
        </button>

        <button class="btn btn-md btn-info" @click="tryOrAlert(app, project.refresh())">
          <DevIcon name="refresh" /> {{ locale.t('REFRESH') }}
        </button>
      </div>
    </section>

    <section class="pd-more">
      <div class="fields-section">
        <h4>{{ locale.t('BASIC_INFO') }}</h4>

        <div class="field-item">
          <span>{{ locale.t('ICON') }}</span>
          <span>{{ project.state.config.icon || locale.t('NONE') }}</span>
        </div>

        <div class="field-item">
          <span>{{ locale.t('CONFIG_FILE_PATH') }}</span>
          <span>{{ project.state.configPath }}</span>
        </div>
      </div>

      <div class="fields-section">
        <h4>{{ locale.t('DEBUG_INFO') }}</h4>

        <div class="field-item">
          <span class="field-name">{{ locale.t('DEBUG_ENTRY') }}</span>
          <span>{{ project.state.config.debug?.entry || locale.t('NONE') }}</span>
        </div>

        <div class="field-item">
          <span class="field-name">{{ locale.t('RESOURCE_PATH') }}</span>
          <span>{{ project.state.config.debug?.resource || locale.t('NONE') }}</span>
        </div>
      </div>

      <div class="fields-section">
        <h4>{{ locale.t('BUILD_INFO') }}</h4>
        <div class="field-item">
          <span class="field-name">{{ locale.t('RESOURCE_PATH') }}</span>
          <span>{{ project.state.config.build?.resource || locale.t('DEFAULT') }}</span>
        </div>
      </div>
    </section>
  </div>
</template>
