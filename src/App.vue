<script setup>
/**
 * 应用根组件
 *
 * 结构：.window（含平台类）＋ 标题栏 ＋ 内容区 ＋ 状态栏
 * 启动流程：读命令行参数 → app.init() → 打开 --project 指定目录或最近项目
 *           → 若带 --build 则构建并关闭窗口
 *
 * 相对 niva 原版的两处启动侧优化：
 *   1. **并行化**：原版是 `os.info()` → `process.args()` → `app.init()` 三条串行 await，
 *      每一条都要走一次 IPC 往返。这里用 Promise.all 并发，冷启动少两个往返。
 *      （app.init 内部还会读历史文件 + 读 locale，同样各自异步，见 models/app.js）
 *   2. **键盘可用**：装一个全局 keydown 监听，把常用操作暴露成快捷键。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import Titlebar from './components/devtools/Titlebar.vue'
import Statusbar from './components/devtools/Statusbar.vue'
import ModalHost from './components/devtools/ModalHost.vue'
import ImportPage from './components/devtools/ImportPage.vue'
import ProjectPage from './components/devtools/ProjectPage.vue'
import { app } from './devtools/models/app'
import { SHORTCUT, installGlobalShortcuts, onShortcut } from './devtools/composables/useShortcuts'
import {
  getCurrentDir,
  isAbsolutePath,
  parseArgs,
  pathJoin,
  tryOrAlert,
} from './devtools/utils'

/** 窗口焦点状态（用它切 .active 类） */
const active = ref(true)
const systemInfo = ref({ os: '' })

/** platform 取 os 名首段小写：`Mac OS` → mac、`Windows` → windows */
const platform = computed(() => (systemInfo.value.os || '').toLowerCase().split(' ')[0])

const hasHistory = computed(() => app.state.history.state.history.length > 0)

/**
 * 把命令行参数里的路径解析成绝对路径。
 *
 * 原版是直接 `pathJoin(getCurrentDir(), args.project)` 做字符串拼接：
 * 传相对路径没问题，但传绝对路径会被拼成 `<cwd>//tmp/xxx` 这种不存在的路径，
 * 表现是命令行指定的项目**静默打不开**（无报错，直接落到最近项目/导入页）。
 * 这里先判一次绝对路径（纯同步正则，不额外走 IPC）。
 */
function resolveArgPath(target) {
  return isAbsolutePath(target) ? target : pathJoin(getCurrentDir(), target)
}

let uninstallShortcuts = null
let uninstallAppShortcuts = null

function onFocusChanged(_event, focused) {
  active.value = focused
}

/* --------------------------- 应用级快捷键处理 ---------------------------- */
/* 放在根组件，因为这几个操作与「当前在哪个页面」无关 */
const appShortcutHandlers = {
  [SHORTCUT.newProject]: () => tryOrAlert(app, app.create()),
  [SHORTCUT.openProject]: () => tryOrAlert(app, app.openWithPicker()),
  [SHORTCUT.debug]: () => {
    const { project } = app.state
    if (project) tryOrAlert(app, project.debug())
  },
  [SHORTCUT.build]: () => {
    const { project } = app.state
    if (project) tryOrAlert(app, project.build())
  },
}

onMounted(async () => {
  uninstallShortcuts = installGlobalShortcuts()
  uninstallAppShortcuts = onShortcut(appShortcutHandlers)

  Niva.addEventListener('window.focused', onFocusChanged)

  // 三件事互不依赖，并发发出 —— 只要一个 IPC 往返的等待时间
  const [info, rawArgs] = await Promise.all([
    Niva.api.os.info(),
    Niva.api.process.args(),
    app.init(),
  ])

  systemInfo.value = info
  const args = parseArgs(rawArgs)

  if (args.project) {
    await tryOrAlert(app, app.open(resolveArgPath(args.project)))
  } else {
    const recently = app.state.history.recently()
    if (recently) {
      await tryOrAlert(app, app.open(recently))
    }
  }

  if (args.build && app.state.project) {
    const { project } = app.state
    await tryOrAlert(app, project.build(resolveArgPath(args.build)))
    Niva.api.window.close()
  }
})

onUnmounted(() => {
  Niva.removeEventListener('window.focused', onFocusChanged)
  if (uninstallShortcuts) uninstallShortcuts()
  if (uninstallAppShortcuts) uninstallAppShortcuts()
})
</script>

<template>
  <div :class="['window', { active }, `os-${platform}`]">
    <Titlebar :os="platform" />

    <div class="window-body has-space">
      <ProjectPage v-if="hasHistory" />
      <ImportPage v-else />
    </div>

    <Statusbar />
  </div>

  <ModalHost />
</template>
