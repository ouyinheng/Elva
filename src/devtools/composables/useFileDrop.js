/**
 * 拖放导入 —— 原版在 ImportPage 与 ProjectPage 里各写了一遍同样的三个监听，
 * 这里抽成 composable（行为一致，仅消除重复）。
 *
 * 语义对齐 pages/import/index.tsx 与 pages/project/index.tsx：
 *   dropped   → 取消高亮，取第一个路径交给 app.open()
 *   hovered   → 有路径才进入高亮态
 *   cancelled → 退出高亮态
 */

import { onMounted, onUnmounted, ref } from 'vue'
import { tryOrAlert } from '@/devtools/utils'

export function useFileDrop(app) {
  const isHover = ref(false)

  function handleDropped(_, { paths }) {
    isHover.value = false
    const path = paths[0]
    if (path) {
      tryOrAlert(app, app.open(path))
    }
  }

  function handleHovered(_, { paths }) {
    if (paths.length > 0) isHover.value = true
  }

  function handleCancelled() {
    isHover.value = false
  }

  onMounted(() => {
    Niva.addEventListener('fileDrop.dropped', handleDropped)
    Niva.addEventListener('fileDrop.hovered', handleHovered)
    Niva.addEventListener('fileDrop.cancelled', handleCancelled)
  })

  onUnmounted(() => {
    Niva.removeEventListener('fileDrop.dropped', handleDropped)
    Niva.removeEventListener('fileDrop.hovered', handleHovered)
    Niva.removeEventListener('fileDrop.cancelled', handleCancelled)
  })

  return { isHover }
}
