/**
 * 浏览历史 —— 对齐原版 packages/devtools/src/models/history.model.ts
 *
 * 落盘位置与原版一致：<data_dir>/history.json
 * （data_dir 即 NivaContext 的 dataDir，elva 下为 ~/Library/Application Support/elva_xxx）
 *
 * 原版用 onStateChange 自动写盘，这里沿用同一策略。
 */

import { StateModel } from './state'
import { dataDirWith, tryOrAlert } from '../utils'
import { fromThrowableAsync } from '../result'

const { fs } = Niva.api

export class HistoryModel extends StateModel {
  constructor(app) {
    super({ history: [] })
    this.app = app
    this.historyFilePath = ''
  }

  async init() {
    await tryOrAlert(
      this.app,
      fromThrowableAsync(async () => {
        this.historyFilePath = dataDirWith('history.json')
        await fs.createDirAll(dataDirWith())
        if (!(await fs.exists(this.historyFilePath))) {
          await fs.write(this.historyFilePath, '{"history": []}')
        }
        const content = JSON.parse(await fs.read(this.historyFilePath))
        this.setState({
          ...this.state,
          ...content,
        })
      }),
    )

    this.onStateChange(async () => {
      await fs.write(this.historyFilePath, JSON.stringify(this.state))
    })
  }

  async record(project) {
    const { history } = this.state

    let matched = false
    const newHistory = history.map((p) => {
      if (p.uuid === project.state.uuid || p.path === project.state.path) {
        matched = true
        return {
          name: project.state.name,
          uuid: project.state.uuid,
          path: project.state.path,
          icon: project.state.icon,
          lastAccessed: Date.now(),
        }
      }
      return p
    })

    if (!matched) {
      newHistory.unshift({
        name: project.state.name,
        uuid: project.state.uuid,
        path: project.state.path,
        icon: project.state.icon,
        lastAccessed: Date.now(),
      })
    }

    this.setState({
      ...this.state,
      history: newHistory,
    })
  }

  async remove(path, uuid) {
    this.setState({
      ...this.state,
      history: this.state.history.filter((p) => p.path !== path && p.uuid !== uuid),
    })
  }

  /** 最近一次打开的项目路径（原版用 lodash maxBy，这里手写等价实现） */
  recently() {
    let best = null
    for (const item of this.state.history) {
      if (best === null || item.lastAccessed > best.lastAccessed) best = item
    }
    return best?.path || null
  }
}
