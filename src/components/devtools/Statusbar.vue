<script setup>
/**
 * 状态栏
 *
 * 与 niva 原版状态栏的差异（有意改进）：
 *   - 原版「文档」「Github」都指向 bramblex/niva 的站点与仓库 —— elva 不是 niva，
 *     已全部替换：文档打开 elva 自带的 `elva-docs.html`，Github 换成「快捷键」帮助。
 *   - 原版右端只显示系统信息 + 一个光秃秃的版本号；这里明确标注
 *     `Elva <版本> · Electron <版本>`，避免用户把它误认成 niva 的版本。
 *   - 单击复制、双击开 DevTools 的交互保留（双击不再改窗口缩放 —— 窗口本来就可缩放）。
 */
import { computed, onMounted, ref } from 'vue'
import DevIcon from './DevIcon.vue'
import { useApp, useLocale } from '@/devtools/models/app'

const app = useApp()
const locale = useLocale()

const isDevelop = import.meta.env.DEV

const systemInfo = ref({ os: '', arch: '', version: '' })
const appInfo = ref({ version: '', electron: '', isDev: isDevelop })
const copied = ref(false)

onMounted(async () => {
  const [info, runtimeVersion] = await Promise.all([
    window.electronAPI?.getAppInfo?.().catch(() => null) ?? Promise.resolve(null),
    Niva.api.process.version().catch(() => ''),
  ])

  systemInfo.value = await Niva.api.os.info()

  appInfo.value = {
    version: info?.version || runtimeVersion || '',
    electron: info?.electron || '',
    isDev: info?.isDev ?? isDevelop,
  }
})

const platformIcon = computed(
  () => ({ 'Mac OS': 'apple', Windows: 'windows' })[systemInfo.value.os] || null,
)

/** 右端展示文本：系统信息 + elva 自身版本 + Electron 版本 */
const systemText = computed(() =>
  [
    `${systemInfo.value.os} ${systemInfo.value.arch}`,
    appInfo.value.version ? `Elva ${appInfo.value.version}` : '',
    appInfo.value.electron ? `Electron ${appInfo.value.electron}` : '',
  ]
    .filter(Boolean)
    .join(' | '),
)

function toggleLocale() {
  locale.setLocale(locale.state.current === 'en_US' ? 'zh_CN' : 'en_US')
}

/** 打开 elva 自带文档（随应用分发，dev 下由 Vite 提供，生产由 elva:// 提供） */
function openDocs() {
  Niva.api.window.open({
    entry: 'elva-docs.html',
    title: locale.t('DOCUMENTS'),
    size: { width: 1000, height: 760 },
    minSize: { width: 640, height: 480 },
  })
}

/** 快捷键帮助：把可用的键盘操作直接摊给用户，而不是让功能藏在界面里 */
function showShortcuts() {
  const isMac = systemInfo.value.os === 'Mac OS'
  const mod = isMac ? '⌘' : 'Ctrl'
  const rows = [
    [`${mod} + F`, locale.t('SC_FOCUS_SEARCH')],
    [`${mod} + N`, locale.t('SC_NEW_PROJECT')],
    [`${mod} + O`, locale.t('SC_OPEN_PROJECT')],
    [`${mod} + D`, locale.t('SC_DEBUG')],
    [`${mod} + B`, locale.t('SC_BUILD')],
    [`${mod} + 1 / 2`, locale.t('SC_SWITCH_TAB')],
    ['↑ / ↓', locale.t('SC_MOVE_SELECTION')],
    ['Enter', locale.t('SC_OPEN_SELECTED')],
    ['Esc', locale.t('SC_CLEAR_SEARCH')],
  ]
  app.state.modal.alert(locale.t('SHORTCUTS'), rows.map(([k, v]) => `${k}    ${v}`).join('\n'))
}

async function copySystemInfo() {
  await Niva.api.clipboard.write(systemText.value)
  copied.value = true
  setTimeout(() => (copied.value = false), 1200)
}

function unlockDevtools() {
  Niva.api.webview.openDevtools()
}
</script>

<template>
  <div :class="['status-bar', { 'status-bar-dev': appInfo.isDev }]">
    <span class="status-bar-field" title="切换语言 / Switch language" @click="toggleLocale">
      <DevIcon name="translate" class="icon-sm" />
      {{ locale.t('LOCALE') }}
    </span>

    <span class="status-bar-field" title="打开 elva 文档" @click="openDocs">
      <DevIcon name="book" class="icon-sm" />
      {{ locale.t('DOCUMENTS') }}
    </span>

    <span class="status-bar-field" title="键盘快捷键" @click="showShortcuts">
      <DevIcon name="keyboard" class="icon-sm" />
      {{ locale.t('SHORTCUTS') }}
    </span>

    <span
      class="status-bar-field flex-end"
      :title="copied ? '已复制' : '单击复制 · 双击打开 DevTools'"
      @click="copySystemInfo"
      @dblclick="unlockDevtools"
    >
      <DevIcon v-if="platformIcon" :name="platformIcon" class="icon-sm" />
      {{ copied ? '已复制到剪贴板' : systemText }}
    </span>
  </div>
</template>
