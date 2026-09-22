<script setup>
/**
 * 项目列表（左栏）
 *
 * 相对 niva 原版 list.tsx 的增强：
 *   1. **键盘可用**：↑/↓ 移动选中项，Enter 打开，Esc 清空搜索；搜索框里同样生效，
 *      所以「Cmd+F → 打字 → ↓ → Enter」是完整的键盘流，不用碰鼠标。
 *   2. **区分两种空态**：原版「没有历史」与「搜索无结果」都只显示一个空白区域，
 *      用户不知道是没项目还是搜错了。这里分别给引导文案（NO_HISTORY_* / NO_MATCH_*）。
 *   3. 搜索输入框自动聚焦由 Cmd+F 触发，清空由 Esc 触发。
 *
 * 其余交互（按 name 小写包含匹配、命中片段高亮、hover 才显示删除、删除二次确认、
 * 当前项目带 .active）与原版一致。
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import Logo from '@/components/devtools/Logo.vue'
import HighlightText from '@/components/devtools/HighlightText.vue'
import DevIcon from '@/components/devtools/DevIcon.vue'
import { useApp, useHistory, useLocale } from '@/devtools/models/app'
import { SHORTCUT, onShortcut } from '@/devtools/composables/useShortcuts'
import { tryOrAlert } from '@/devtools/utils'

const app = useApp()
const history = useHistory()
const locale = useLocale()

const keyword = ref('')
const inputRef = ref(null)
/** 键盘移动到的位置（-1 = 未选中） */
const focusedIndex = ref(-1)

const project = computed(() => app.state.project)

const allHistory = computed(() => history.state.history)

const historyList = computed(() =>
  allHistory.value.filter((p) => p.name.toLowerCase().includes(keyword.value.toLowerCase())),
)

// 过滤结果变了就把选中位收回到第一项，避免停在越界的位置上
watch(historyList, () => {
  focusedIndex.value = historyList.value.length > 0 ? 0 : -1
})

function createProject() {
  tryOrAlert(app, app.create())
}

function openWithPicker() {
  tryOrAlert(app, app.openWithPicker())
}

function openProject(path) {
  tryOrAlert(app, app.open(path))
}

async function clearHistory() {
  if (await app.state.modal.confirm(locale.t('TIPS'), locale.t('DELETE_CONFIRM'))) {
    history.setState({ history: [] })
  }
}

async function removeItem(item) {
  if (!(await app.state.modal.confirm(locale.t('TIPS'), locale.t('DELETE_CONFIRM')))) {
    return
  }

  const current = project.value
  if (current?.state.path === item.path || current?.state.uuid === item.uuid) {
    const promise = app.close()
    await tryOrAlert(app, promise)
    const result = await promise
    if (result.isOk()) {
      history.remove(item.path, item.uuid)
    }
  } else {
    history.remove(item.path, item.uuid)
  }
}

/* ------------------------------- 键盘交互 -------------------------------- */

async function focusSearch() {
  await nextTick()
  inputRef.value?.focus()
  inputRef.value?.select()
}

function moveSelection(delta) {
  const size = historyList.value.length
  if (size === 0) return
  // 循环移动，符合「列表里按上下键」的直觉
  const next = (focusedIndex.value + delta + size) % size
  focusedIndex.value = next
  scrollIntoView(next)
}

function scrollIntoView(index) {
  nextTick(() => {
    document
      .querySelectorAll('.history-item')
      [index]?.scrollIntoView({ block: 'nearest' })
  })
}

function openFocused() {
  const item = historyList.value[focusedIndex.value]
  if (item) openProject(item.path)
}

function onSearchKeydown(event) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    moveSelection(1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    moveSelection(-1)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    openFocused()
  } else if (event.key === 'Escape') {
    keyword.value = ''
  }
}

let unsubscribe = null

onMounted(() => {
  unsubscribe = onShortcut({
    [SHORTCUT.focusSearch]: focusSearch,
    [SHORTCUT.clearSearch]: () => {
      keyword.value = ''
    },
  })
  focusedIndex.value = historyList.value.length > 0 ? 0 : -1
})

onUnmounted(() => {
  if (unsubscribe) unsubscribe()
})
</script>

<template>
  <div class="file-uploader-dir">
    <div class="search-bar">
      <div class="search-input">
        <input
          ref="inputRef"
          :placeholder="locale.t('SEARCH_PLACEHOLDER')"
          :value="keyword"
          @input="keyword = $event.target.value"
          @keydown="onSearchKeydown"
        />
        <i
          v-if="keyword"
          class="icon-sm icon-delete"
          style="cursor: pointer"
          @click="keyword = ''"
        ></i>
        <i v-else class="icon-sm icon-search"></i>
      </div>

      <div class="btn-containers">
        <div>
          <button class="text-btn" @click="createProject">
            <DevIcon name="plus" size="17" />
            {{ locale.t('NEW_PROJECT') }}
          </button>
        </div>
        <div>
          <button class="text-btn" @click="openWithPicker">
            <DevIcon name="folder-plus" size="17" />
            {{ locale.t('OPEN_PROJECT') }}
          </button>
        </div>
      </div>
    </div>

    <div class="history">
      <button
        v-if="allHistory.length > 0"
        class="text-btn clear-history"
        @click="clearHistory"
      >
        {{ locale.t('CLEAR_HISTORY') }}
        <i class="icon-sm icon-delete"></i>
      </button>

      <div v-if="historyList.length > 0" class="history-list">
        <div
          v-for="(item, i) in historyList"
          :key="item.path"
          :class="[
            'history-item',
            { active: item.uuid === project?.state.uuid, focused: i === focusedIndex },
          ]"
          @click="openProject(item.path)"
          @mouseenter="focusedIndex = i"
        >
          <div class="picon">
            <Logo :src="item.icon" />
          </div>

          <div class="pinfo">
            <h4>
              <HighlightText :text="item.name" :highlight="keyword" />
            </h4>
            <span>{{ item.path }}</span>
          </div>

          <i class="icon-sm icon-delete" @click.stop="removeItem(item)"></i>
        </div>
      </div>

      <!-- 空态：区分「一个项目都没有」和「搜索无结果」，原版这里是一片空白 -->
      <div v-else class="history-empty">
        <template v-if="allHistory.length === 0">
          <DevIcon name="folder-open" :size="36" />
          <h4>{{ locale.t('NO_HISTORY_TITLE') }}</h4>
          <p>{{ locale.t('NO_HISTORY_TIP') }}</p>
        </template>
        <template v-else>
          <DevIcon name="search" :size="36" />
          <h4>{{ locale.t('NO_MATCH_TITLE') }}</h4>
          <p>{{ locale.t('NO_MATCH_TIP', { keyword }) }}</p>
        </template>
      </div>
    </div>
  </div>
</template>
