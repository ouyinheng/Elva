<script setup>
/**
 * 可视化配置表单
 *
 * 与 JSON 编辑器**共享同一份内容**（project.state.editor.state.content），
 * 所以两边是天然双向同步的，不需要额外的事件对齐：
 *
 *   表单改一项 → 解析当前 JSON → 改那个字段 → JSON.stringify 回写 → JSON 视图立刻变
 *   JSON 改一处 → 本组件的 parsed 计算属性重算 → 表单控件值立刻变
 *
 * JSON 不合法时表单整体禁用并提示（不能猜用户想表达什么）。
 *
 * 面板里没有出现的字段（平台覆盖 macos./windows.、shortcuts、tray 等）不会被丢弃 ——
 * 我们只在原始对象上改具体路径，其余原样保留再序列化。
 */
import { computed, ref, watch } from 'vue'
import { useLocale, useProject } from '@/devtools/models/app'
import { fileSystemUrl, pathJoin, uuid as genUuid } from '@/devtools/utils'

const locale = useLocale()
const project = useProject()

const editor = computed(() => project.state.editor)
const content = computed(() => editor.value.state.content)

/** 解析结果：ok=false 时带上原因，表单整体禁用 */
const parsed = computed(() => {
  try {
    const value = JSON.parse(content.value)
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { ok: false, reason: 'not-an-object' }
    }
    return { ok: true, value }
  } catch (error) {
    return { ok: false, reason: error.message }
  }
})

const isValid = computed(() => parsed.value.ok)

/* --------------------------- 路径读写工具 --------------------------- */

function getPath(path, fallback = '') {
  if (!parsed.value.ok) return fallback
  let cur = parsed.value.value
  for (const key of path) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return fallback
    cur = cur[key]
  }
  return cur === undefined || cur === null ? fallback : cur
}

/** 深拷贝 + 按路径赋值 + 回写 JSON */
function setPath(path, value) {
  if (!parsed.value.ok) return
  const draft = structuredClone(parsed.value.value)

  let cur = draft
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]
    if (cur[key] === null || typeof cur[key] !== 'object') cur[key] = {}
    cur = cur[key]
  }

  const last = path[path.length - 1]
  if (value === undefined) {
    delete cur[last]
  } else {
    cur[last] = value
  }

  // 空对象顺手清掉，避免留下 `"debug": {}` 这种噪音
  pruneEmpty(draft)

  editor.value.setContent(JSON.stringify(draft, null, 2))
}

function pruneEmpty(obj) {
  for (const key of Object.keys(obj)) {
    const value = obj[key]
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      pruneEmpty(value)
      if (Object.keys(value).length === 0) delete obj[key]
    }
  }
}

/* ------------------------------ 字段取值 ------------------------------ */

const name = computed(() => getPath(['name']))
const appUuid = computed(() => getPath(['uuid']))
const icon = computed(() => getPath(['icon']))
const title = computed(() => getPath(['window', 'title']))
const width = computed(() => getPath(['window', 'size', 'width'], ''))
const height = computed(() => getPath(['window', 'size', 'height'], ''))
const minWidth = computed(() => getPath(['window', 'minSize', 'width'], ''))
const minHeight = computed(() => getPath(['window', 'minSize', 'height'], ''))
const resizable = computed(() => getPath(['window', 'resizable'], true))
const decorations = computed(() => getPath(['window', 'decorations'], true))
const devtools = computed(() => getPath(['window', 'devtools'], false))
const alwaysOnTop = computed(() => getPath(['window', 'alwaysOnTop'], false))
const debugEntry = computed(() => getPath(['debug', 'entry']))
const debugResource = computed(() => getPath(['debug', 'resource']))
const buildResource = computed(() => getPath(['build', 'resource']))
const metaVersion = computed(() => getPath(['meta', 'version']))
const metaCompany = computed(() => getPath(['meta', 'companyName']))
const metaDescription = computed(() => getPath(['meta', 'description']))
const metaCopyright = computed(() => getPath(['meta', 'copyright']))

/* ------------------------------ 图标实时预览 ------------------------------ */

/**
 * 图标文件的 filesystem URL —— 用**当前编辑内容**里的 debug.resource 来解析，
 * 所以改完资源目录/文件名（哪怕还没保存）预览就会跟着变。
 *
 * 这是可视化表单相对「手改 JSON」最直接的收益之一：路径写得对不对，
 * 看一眼缩略图就知道，不用先保存再去项目信息里确认。
 */
const iconPreview = computed(() => {
  const iconFile = getPath(['icon'])
  if (!iconFile) return null
  const resource = getPath(['debug', 'resource'])
  return fileSystemUrl(pathJoin(project.state.path, resource, iconFile))
})

/** 文件不存在时 <img> 会触发 error，用它把预览收起来，避免显示裂图 */
const iconPreviewFailed = ref(false)

watch(iconPreview, () => {
  iconPreviewFailed.value = false
})

/* ------------------------------ 写回处理 ------------------------------ */

/** 文本类：空字符串代表「这一项不要了」，直接删掉键而不是留个空串 */
function onText(path) {
  return (event) => {
    const raw = event.target.value
    setPath(path, raw === '' ? undefined : raw)
  }
}

/** 数字类：留空 = 删除；NaN = 忽略本次输入 */
function onNumber(path) {
  return (event) => {
    const raw = event.target.value
    if (raw === '') {
      setPath(path, undefined)
      return
    }
    const num = Number(raw)
    if (!Number.isFinite(num)) return
    setPath(path, Math.round(num))
  }
}

function onCheck(path, fallback) {
  return (event) => {
    const next = event.target.checked
    // 等于默认值时就把键删掉，让配置文件保持精简
    setPath(path, next === fallback ? undefined : next)
  }
}

/** 尺寸是一对字段，任意一个从「空」变成有值时，另一个要给个合理默认 */
function onSize(path, siblingKey, siblingDefault) {
  return (event) => {
    const raw = event.target.value
    if (raw === '') {
      setPath(path, undefined)
      return
    }
    const num = Number(raw)
    if (!Number.isFinite(num)) return
    const next = Math.round(num)
    setPath(path, next)
    if (getPath(path.slice(0, -1).concat(siblingKey), '') === '') {
      setPath(path.slice(0, -1).concat(siblingKey), siblingDefault)
    }
  }
}

function regenerateUuid() {
  setPath(['uuid'], genUuid())
}
</script>

<template>
  <div class="config-form">
    <p v-if="!isValid" class="cf-invalid">
      {{ locale.t('CF_INVALID_JSON') }}
    </p>

    <template v-else>
      <!-- ------------------------------ 基础 ------------------------------ -->
      <section class="cf-group">
        <h4>{{ locale.t('CF_BASIC') }}</h4>

        <div class="cf-row">
          <label>{{ locale.t('CF_NAME') }}</label>
          <div class="cf-control">
            <input type="text" :value="name" @change="onText(['name'])($event)" />
          </div>
        </div>

        <div class="cf-row">
          <label>{{ locale.t('CF_UUID') }}</label>
          <div class="cf-control">
            <input
              type="text"
              class="cf-mono"
              :value="appUuid"
              @change="onText(['uuid'])($event)"
            />
            <button class="cf-mini-btn" @click="regenerateUuid">
              {{ locale.t('CF_REGENERATE') }}
            </button>
          </div>
        </div>

        <div class="cf-row">
          <label>{{ locale.t('CF_ICON') }}</label>
          <div class="cf-control">
            <img
              v-if="iconPreview && !iconPreviewFailed"
              class="cf-icon-preview"
              :src="iconPreview"
              :alt="locale.t('CF_ICON')"
              @error="iconPreviewFailed = true"
            />
            <input
              type="text"
              class="cf-mono"
              :value="icon"
              placeholder="icon.png"
              @change="onText(['icon'])($event)"
            />
          </div>
        </div>
      </section>

      <!-- ------------------------------ 窗口 ------------------------------ -->
      <section class="cf-group">
        <h4>{{ locale.t('CF_WINDOW') }}</h4>

        <div class="cf-row">
          <label>{{ locale.t('CF_TITLE') }}</label>
          <div class="cf-control">
            <input
              type="text"
              :value="title"
              :placeholder="name"
              @change="onText(['window', 'title'])($event)"
            />
          </div>
        </div>

        <div class="cf-row">
          <label>{{ locale.t('CF_SIZE') }}</label>
          <div class="cf-control">
            <span class="cf-unit">{{ locale.t('CF_WIDTH') }}</span>
            <input
              type="number"
              :value="width"
              @change="onSize(['window', 'size', 'width'], 'height', 600)($event)"
            />
            <span class="cf-unit">{{ locale.t('CF_HEIGHT') }}</span>
            <input
              type="number"
              :value="height"
              @change="onSize(['window', 'size', 'height'], 'width', 800)($event)"
            />
          </div>
        </div>
        <p class="cf-hint">{{ locale.t('CF_SIZE_HINT') }}</p>

        <div class="cf-row">
          <label>{{ locale.t('CF_MIN_SIZE') }}</label>
          <div class="cf-control">
            <span class="cf-unit">{{ locale.t('CF_WIDTH') }}</span>
            <input
              type="number"
              :value="minWidth"
              @change="onSize(['window', 'minSize', 'width'], 'height', 480)($event)"
            />
            <span class="cf-unit">{{ locale.t('CF_HEIGHT') }}</span>
            <input
              type="number"
              :value="minHeight"
              @change="onSize(['window', 'minSize', 'height'], 'width', 640)($event)"
            />
          </div>
        </div>

        <div class="cf-row">
          <label></label>
          <div class="cf-control" style="flex-wrap: wrap">
            <label class="cf-check">
              <input
                type="checkbox"
                :checked="resizable"
                @change="onCheck(['window', 'resizable'], true)($event)"
              />
              {{ locale.t('CF_RESIZABLE') }}
            </label>
            <label class="cf-check">
              <input
                type="checkbox"
                :checked="decorations"
                @change="onCheck(['window', 'decorations'], true)($event)"
              />
              {{ locale.t('CF_DECORATIONS') }}
            </label>
            <label class="cf-check">
              <input
                type="checkbox"
                :checked="devtools"
                @change="onCheck(['window', 'devtools'], false)($event)"
              />
              {{ locale.t('CF_DEVTOOLS') }}
            </label>
            <label class="cf-check">
              <input
                type="checkbox"
                :checked="alwaysOnTop"
                @change="onCheck(['window', 'alwaysOnTop'], false)($event)"
              />
              {{ locale.t('CF_ALWAYS_ON_TOP') }}
            </label>
          </div>
        </div>
      </section>

      <!-- ------------------------------ 调试 ------------------------------ -->
      <section class="cf-group">
        <h4>{{ locale.t('CF_DEBUG') }}</h4>

        <div class="cf-row">
          <label>{{ locale.t('CF_ENTRY') }}</label>
          <div class="cf-control">
            <input
              type="text"
              class="cf-mono"
              :value="debugEntry"
              placeholder="http://localhost:5173"
              @change="onText(['debug', 'entry'])($event)"
            />
          </div>
        </div>

        <div class="cf-row">
          <label>{{ locale.t('CF_DEBUG_RESOURCE') }}</label>
          <div class="cf-control">
            <input
              type="text"
              class="cf-mono"
              :value="debugResource"
              placeholder="public"
              @change="onText(['debug', 'resource'])($event)"
            />
          </div>
        </div>
      </section>

      <!-- ------------------------------ 构建 ------------------------------ -->
      <section class="cf-group">
        <h4>{{ locale.t('CF_BUILD') }}</h4>

        <div class="cf-row">
          <label>{{ locale.t('CF_BUILD_RESOURCE') }}</label>
          <div class="cf-control">
            <input
              type="text"
              class="cf-mono"
              :value="buildResource"
              placeholder="dist"
              @change="onText(['build', 'resource'])($event)"
            />
          </div>
        </div>
      </section>

      <!-- ------------------------------ 元信息 ------------------------------ -->
      <section class="cf-group">
        <h4>{{ locale.t('CF_META') }}</h4>

        <div class="cf-row">
          <label>{{ locale.t('CF_VERSION') }}</label>
          <div class="cf-control">
            <input
              type="text"
              class="cf-mono"
              :value="metaVersion"
              placeholder="1.0.0"
              @change="onText(['meta', 'version'])($event)"
            />
          </div>
        </div>

        <div class="cf-row">
          <label>{{ locale.t('CF_COMPANY') }}</label>
          <div class="cf-control">
            <input
              type="text"
              :value="metaCompany"
              @change="onText(['meta', 'companyName'])($event)"
            />
          </div>
        </div>

        <div class="cf-row">
          <label>{{ locale.t('CF_DESCRIPTION') }}</label>
          <div class="cf-control">
            <input
              type="text"
              :value="metaDescription"
              @change="onText(['meta', 'description'])($event)"
            />
          </div>
        </div>

        <div class="cf-row">
          <label>{{ locale.t('CF_COPYRIGHT') }}</label>
          <div class="cf-control">
            <input
              type="text"
              :value="metaCopyright"
              @change="onText(['meta', 'copyright'])($event)"
            />
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
