<script setup>
/**
 * 配置编辑器 —— 对齐原版 pages/project/config-editor/index.tsx
 *
 * 原版用 react-ace + ace-builds（github 主题）。elva 不引入编辑器依赖，
 * 改为自实现的轻量 JSON 编辑器：底层 <pre> 做语法高亮，上层透明 <textarea>
 * 承接输入与光标，右侧行号栏跟随纵向滚动。交互契约与原版一致：
 *   - 内容变化 → editor.setContent()（同时把 isEdit 置 true，tab 上出现红色星号）
 *   - Ctrl/Cmd + S → 保存
 *   - 重置 → 重新读取 niva.json（project.init）
 *   - 保存 → 校验 JSON → 写盘 → 刷新；未修改时按钮为禁用态
 */
import { computed, ref } from 'vue'
import { useApp, useLocale, useProject } from '@/devtools/models/app'
import { tryOrAlert } from '@/devtools/utils'

const app = useApp()
const locale = useLocale()
const project = useProject()

const editor = computed(() => project.state.editor)

const scroller = ref(null)
const highlightLayer = ref(null)
const gutterInner = ref(null)

/* ------------------------------ JSON 语法高亮 ------------------------------ */

function escapeHtml(s) {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
}

function highlightJson(src) {
  const out = []
  const n = src.length
  let i = 0

  while (i < n) {
    const ch = src[i]

    // 字符串；向后跳过空白看是否紧跟冒号，以区分「键名」与「字符串值」
    if (ch === '"') {
      let j = i + 1
      while (j < n) {
        if (src[j] === '\\') {
          j += 2
          continue
        }
        if (src[j] === '"') {
          j++
          break
        }
        j++
      }
      let k = j
      while (k < n && /\s/.test(src[k])) k++
      const isKey = src[k] === ':'
      out.push(
        `<span class="${isKey ? 'tok-key' : 'tok-str'}">${escapeHtml(src.slice(i, j))}</span>`,
      )
      i = j
      continue
    }

    // 数字
    if (ch === '-' || (ch >= '0' && ch <= '9')) {
      const m = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(src.slice(i))
      if (m) {
        out.push(`<span class="tok-num">${m[0]}</span>`)
        i += m[0].length
        continue
      }
    }

    // 字面量
    if (src.startsWith('true', i) || src.startsWith('false', i) || src.startsWith('null', i)) {
      const word = src.startsWith('false', i) ? 'false' : src.startsWith('true', i) ? 'true' : 'null'
      out.push(`<span class="tok-kw">${word}</span>`)
      i += word.length
      continue
    }

    // 标点
    if ('{}[],:'.indexOf(ch) >= 0) {
      out.push(`<span class="tok-punc">${escapeHtml(ch)}</span>`)
      i++
      continue
    }

    out.push(escapeHtml(ch))
    i++
  }

  // 末尾补一个换行，避免最后一行被父容器高度裁掉
  return out.join('') + '\n'
}

const highlighted = computed(() => highlightJson(editor.value.state.content))

const lineNumbers = computed(() => {
  const count = editor.value.state.content.split('\n').length
  return Array.from({ length: count }, (_, i) => i + 1)
})

/* -------------------------------- 滚动同步 -------------------------------- */

function syncScroll() {
  const el = scroller.value
  if (!el) return
  if (highlightLayer.value) {
    highlightLayer.value.scrollTop = el.scrollTop
    highlightLayer.value.scrollLeft = el.scrollLeft
  }
  if (gutterInner.value) {
    gutterInner.value.style.transform = `translateY(${-el.scrollTop}px)`
  }
}

/* -------------------------------- 交互 ----------------------------------- */

function onInput(event) {
  editor.value.setContent(event.target.value)
  // 输入后内容行数可能变化，滚动态需要重新对齐
  requestAnimationFrame(syncScroll)
}

function handleKeyDown(event) {
  if (event.key === 's' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault()
    tryOrAlert(app, project.save())
  }
}

function reset() {
  tryOrAlert(app, project.init())
}

function save() {
  tryOrAlert(app, project.save())
}

const saveDisabled = computed(() => !editor.value.state.isEdit)
</script>

<template>
  <div class="options-editor" @keydown="handleKeyDown">
    <div class="options-editor-body">
      <div class="json-editor">
        <div class="je-gutter">
          <div ref="gutterInner" class="je-gutter-inner">
            <div v-for="n in lineNumbers" :key="n" class="je-gutter-line">{{ n }}</div>
          </div>
        </div>

        <div class="je-code">
          <pre
            ref="highlightLayer"
            class="je-highlight"
            aria-hidden="true"
            v-html="highlighted"
          ></pre>
          <textarea
            ref="scroller"
            class="je-input"
            spellcheck="false"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            wrap="off"
            :value="editor.state.content"
            @input="onInput"
            @scroll="syncScroll"
          ></textarea>
        </div>
      </div>
    </div>

    <footer style="text-align: right">
      <button class="btn btn-md" style="margin-right: 6px" @click="reset">
        {{ locale.t('RESET') }}
      </button>
      <button
        :class="['btn', 'btn-md', editor.state.isEdit ? 'btn-primary' : 'btn-disabled']"
        :disabled="saveDisabled"
        @click="save"
      >
        {{ locale.t('SAVE') }}
      </button>
    </footer>
  </div>
</template>

<style scoped>
.json-editor {
  display: flex;
  height: 100%;
  background: #fff;
  border-bottom: 0.5px solid rgba(5, 15, 35, 0.08);
  font-family: Menlo, Consolas, "Courier New", monospace;
  font-size: 12px;
  line-height: 18px;
  overflow: hidden;
}

.je-gutter {
  flex: 0 0 auto;
  width: 44px;
  overflow: hidden;
  background: #f7f7f7;
  border-right: 0.5px solid rgba(5, 15, 35, 0.08);
  position: relative;
}

.je-gutter-inner {
  padding: 10px 0;
  will-change: transform;
}

.je-gutter-line {
  height: 18px;
  line-height: 18px;
  padding-right: 10px;
  text-align: right;
  color: rgba(0, 0, 0, 0.28);
  user-select: none;
}

.je-code {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
}

.je-highlight,
.je-input {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  border: 0;
  padding: 10px 12px;
  font: inherit;
  white-space: pre;
  overflow: auto;
  tab-size: 2;
}

.je-highlight {
  pointer-events: none;
  overflow: hidden;
  color: #24292e;
}

.je-input {
  background: transparent;
  color: transparent;
  caret-color: #24292e;
  resize: none;
  outline: none;
}

.je-input::selection {
  background: rgba(53, 221, 142, 0.28);
}

/* Ace github 主题的近似配色 */
.je-highlight :deep(.tok-key) {
  color: #005cc5;
}
.je-highlight :deep(.tok-str) {
  color: #183691;
}
.je-highlight :deep(.tok-num) {
  color: #0086b3;
}
.je-highlight :deep(.tok-kw) {
  color: #a71d5d;
  font-weight: 500;
}
.je-highlight :deep(.tok-punc) {
  color: #333;
}
</style>
