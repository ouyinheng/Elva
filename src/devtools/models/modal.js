/**
 * 模态框模型 —— 对齐原版 packages/devtools/src/models/modal.model.tsx
 *
 * 原版把 React 组件塞进 state 数组里直接渲染。Vue 里改成存「类型标识 + props」，
 * 由 ModalHost.vue 按类型分发渲染，**对外的 API 面（show/showNative/alert/confirm/progress）
 * 与调用时序完全一致**，上层页面代码不用改。
 *
 * 另外保留原版一个容易被忽略的细节：
 *   showNative 先挂一个空白模态占位 50ms，再调原生对话框 —— 目的是让原生窗口
 *   在页面模态栈之上弹出来时避免闪烁/层级错乱。
 */

import { StateModel } from './state'
import { uuid, createPromise } from '../utils'

export class ModalModel extends StateModel {
  constructor(app) {
    super([])
    this.app = app
  }

  show(type, props) {
    const id = uuid()
    const close = () => {
      this.setState(this.state.filter(({ id: _id }) => _id !== id))
    }
    this.setState([...this.state, { id, type, props, close }])
    return close
  }

  destroyAll() {
    this.setState([])
  }

  async showNative(callback) {
    const close = this.show('native', {})
    await new Promise((resolve) => setTimeout(resolve, 50))
    try {
      return await callback()
    } catch (err) {
      return null
    } finally {
      close()
    }
  }

  alert(title, message) {
    const promise = createPromise()
    this.show('alert', { title, message, promise })
    return promise
  }

  confirm(title, message) {
    const promise = createPromise()
    this.show('confirm', { title, message, promise })
    return promise
  }

  progress(title) {
    const progress = new ProgressModel()
    return [progress, this.show('progress', { title, progress })]
  }
}

/** 构建进度：model 只暴露 text/progress，由 ProgressModal 渲染 */
export class ProgressModel extends StateModel {
  constructor() {
    super({ text: '', progress: 0 })
    this.tasks = []
  }

  addTask(text, task) {
    this.tasks.push([text, task])
  }

  async run() {
    for (let i = 0, l = this.tasks.length; i < l; i++) {
      const [text, task] = this.tasks[i]
      this.setState({
        text: `(${i + 1}/${l})${text}`,
        progress: i / l,
      })
      try {
        await task()
        await new Promise((resolve) => setTimeout(resolve, 100))
      } catch (e) {
        this.setState({ text: e?.toString?.() ?? String(e) })
        throw e
      }
    }
    this.setState({ progress: 1, text: this.state.text })
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
}
