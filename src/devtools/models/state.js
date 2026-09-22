/**
 * 极简状态模型基类 —— 语义对齐原版用的 @bramblex/state-model
 *
 * 原版 StateModel 的契约：
 *   .state                当前状态（对象或数组）
 *   .setState(next)       **整体替换**语义，而不是浅合并
 *                         （所以调用处都写成 {...this.state, x} 自己展开）
 *   .onStateChange(cb)    状态变化后回调（HistoryModel 用它把历史落盘）
 *
 * Vue 版实现要点：
 *   - state 用 reactive 包住，保持引用不变地原地更新，
 *     这样组件里 computed(() => model.state) 能持续收到通知；
 *   - 对象走「补齐 + 删除多余键」以复现整体替换语义；
 *   - 数组走 splice 原地替换（ModalModel 的 state 本身就是数组）。
 */

import { reactive, watch } from 'vue'

export class StateModel {
  constructor(initial) {
    this.state = reactive(Array.isArray(initial) ? [...initial] : { ...(initial || {}) })
  }

  setState(next) {
    if (Array.isArray(next)) {
      this.state.splice(0, this.state.length, ...next)
      return
    }
    for (const key of Object.keys(this.state)) {
      if (!(key in next)) delete this.state[key]
    }
    Object.assign(this.state, next)
  }

  onStateChange(callback) {
    return watch(() => this.state, callback, { deep: true })
  }
}
