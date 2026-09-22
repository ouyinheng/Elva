/**
 * 应用模型 —— 对齐原版 packages/devtools/src/models/app.model.ts
 *
 * 原版用 `(window as any).app || new AppModel()` 做单例，这里直接模块级单例，
 * 语义等价。对外方法（init / openWithPicker / open / close / create / exit）逐条保留。
 */

import { markRaw } from 'vue'
import { StateModel } from './state'
import { HistoryModel } from './history'
import { LocaleModel } from './locale'
import { ModalModel } from './modal'
import { ProjectModel } from './project'
import {
  pathJoin,
  pathSplit,
  resolveConfigPath,
  tryExit,
} from '../utils'
import { Err, Ok, fromThrowableAsync } from '../result'
import { ErrorCode } from '../error'
import { generateConfig } from '../templates'
import { generateNewProject } from '../templates'

const { fs } = Niva.api

export class AppModel extends StateModel {
  constructor() {
    super({})
    // 子模型都 markRaw：它们各自持有自己的响应式 state，
    // 不需要再被外层 state 代理一层（避免 proxy 套 proxy 带来的实例判定问题）。
    this.setState({
      history: markRaw(new HistoryModel(this)),
      modal: markRaw(new ModalModel(this)),
      locale: markRaw(new LocaleModel(this)),
      project: null,
    })
  }

  async init() {
    // 用 tryExit 而不是 tryOrAlert：弹窗开着时 closeRequested 会被 exit() 拒绝，
    // 那是「这次退出先不办」的正常结果，不该弹错误框（详见 utils.js 的 tryExit）
    Niva.addEventListener('window.closeRequested', () => tryExit(this, this.exit()))

    const { history, locale } = this.state
    // history / locale 互不依赖，并发初始化（原版是串行 await）
    await Promise.all([history.init(), locale.init()])
  }

  async openWithPicker() {
    const { modal } = this.state
    const path = await modal.showNative(() => Niva.api.dialog.pickDir())

    if (path) {
      return this.open(path)
    }
    return Ok(void 0)
  }

  async open(path) {
    const { modal, locale } = this.state

    const result = await this.close()
    if (result.isErr()) {
      return result
    }

    // 配置文件优先 `elva.json`，不存在则回退兼容旧项目的 `niva.json`
    const packageJsonPath = pathJoin(path, 'package.json')
    const [isExists, config, isPackageJsonExists] = await Promise.all([
      fs.exists(path),
      resolveConfigPath(path),
      fs.exists(packageJsonPath),
    ])

    const configPath = config.configPath
    const isConfigExists = config.exists

    if (!isExists) {
      return Err(ErrorCode.PROJECT_PATH_NOT_EXISTS, { path })
    }

    const { isDir } = await fs.stat(path)
    if (!isDir) {
      return Err(ErrorCode.PROJECT_PATH_IS_NOT_DIR, { path })
    }

    if (!isConfigExists) {
      if (
        !(await modal.confirm(
          locale.t('WARNING'),
          locale.t('PROJECT_CREATE_CONFIG_WHERE_NOT_FOUND'),
        ))
      ) {
        return Err(ErrorCode.PROJECT_CONFIG_NOT_EXISTS, { configPath })
      }

      let projectName = path.split(/\/|\\/).pop()
      const configType = isPackageJsonExists
        ? await fromThrowableAsync(async () => {
            const packageJson = JSON.parse(await fs.read(packageJsonPath))
            if (packageJson?.name) {
              projectName = packageJson.name
            }
            if (packageJson.dependencies['react-scripts']) {
              return 'react'
            } else if (packageJson.devDependencies['vite']) {
              return 'vueVite'
            } else if (packageJson.dependencies['vue']) {
              return 'vue'
            } else {
              return 'simple'
            }
          })
        : Ok('simple')

      const configContent = generateConfig(configType.unwrapOr('simple'), projectName)

      const createConfigFileResult = await fromThrowableAsync(async () => {
        await fs.write(configPath, JSON.stringify(configContent, null, 2))
      })

      if (createConfigFileResult.isErr()) {
        return Err(ErrorCode.PROJECT_CONFIG_CRATE_FAILED, {
          configPath,
          reason: createConfigFileResult.error,
        })
      }
    }

    const project = markRaw(new ProjectModel(this, path, configPath))
    const projectInitResult = await project.init()

    this.setState({
      ...this.state,
      project,
    })

    this.state.history.record(project)
    return projectInitResult
  }

  async close() {
    const { project } = this.state
    if (project) {
      const result = await project.dispose()
      if (result.isErr()) {
        return result
      }
      this.setState({
        ...this.state,
        project: null,
      })
    }
    return Ok(void 0)
  }

  async create() {
    const { modal } = this.state
    const path = await modal.showNative(() => Niva.api.dialog.saveFile())

    if (!path) {
      return Ok(void 0)
    }

    const newProjectResult = await fromThrowableAsync(async () => {
      await fs.createDirAll(path)
      const projectName = pathSplit(path).pop()
      const files = generateNewProject(projectName || 'elva-new-project')
      await Promise.all(
        files.map(([name, content]) => fs.write(pathJoin(path, name), content)),
      )
    })

    if (newProjectResult.isErr()) {
      return Err(ErrorCode.PROJECT_CREATE_FAILED, {
        path,
        reason: newProjectResult.error,
      })
    }

    return this.open(path)
  }

  async exit() {
    const { modal } = this.state

    if (modal.state.length > 0) {
      return Err(ErrorCode.APP_EXIT_PREVENTED_BY_DIALOG)
    }

    const result = await this.close()
    if (result.isErr()) {
      return result
    }

    Niva.api.window.close()
    return Ok(void 0)
  }
}

/* -------------------------------------------------------------------------- */
/* 单例与取值助手（对应原版 app.model.ts 底部的 useXxx hooks）                    */
/* -------------------------------------------------------------------------- */

export const app = new AppModel()

export function useApp() {
  return app
}

export function useHistory() {
  return app.state.history
}

export function useModal() {
  return app.state.modal
}

export function useLocale() {
  return app.state.locale
}

export function useProject() {
  if (!app.state.project) {
    throw new Error('No project is open')
  }
  return app.state.project
}
