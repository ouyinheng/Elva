/**
 * 项目模型 —— 对齐原版 packages/devtools/src/models/project.model.ts
 *
 * 对外行为逐条保留：
 *   init()      读 niva.json → validate → 算 icon 的 filesystem URL → 重置编辑器
 *   dispose()   有未保存修改则弹确认（确认即保存）
 *   refresh()   先 dispose 再 re-init，并刷新历史记录里的时间戳
 *   save()      校验 JSON 合法 → 写盘 → 清 isEdit → refresh
 *   build()     按 os.info().os 分派到 macos / windows 构建，全程一个进度模态
 *   debug()     以 --debug-config/--debug-resource/--debug-devtools 重启自身进程
 *   open()      调用系统默认程序打开项目目录
 */

import { markRaw } from 'vue'
import { StateModel } from './state'
import { CONFIG_FILE_NAMES, dirname, fileSystemUrl, pathJoin } from '../utils'
import { Err, Ok, fromThrowable, fromThrowableAsync } from '../result'
import { ErrorCode } from '../error'

/**
 * 注意：`build/build-macos` 与 `build/build-windows` 是**动态 import** 的
 * （见 build() 内部）。它们连同 templates 一起属于「用户点了构建才会用到」的代码，
 * 静态引入会让首屏 bundle 白白背上这部分字节。这是相对原版的启动优化之一。
 */
const { fs, process, os } = Niva.api

/** 配置编辑器：内容 + 是否有未保存修改（isEdit 为 true 时 tab 上会带红色星号） */
export class ProjectEditorModel extends StateModel {
  constructor(content) {
    super({
      content: content,
      isEdit: false,
    })
  }

  setContent(content) {
    this.setState({
      content,
      isEdit: true,
    })
  }
}

export class ProjectModel extends StateModel {
  constructor(app, path, configPath) {
    super({
      path,
      // 实际配置文件名由 app.open() 探测后传入（优先 elva.json，回退 niva.json）
      configPath: configPath || pathJoin(path, CONFIG_FILE_NAMES[0]),

      icon: null,
      name: '',
      uuid: '',

      config: {},
      // editor 用 markRaw：它是一个自带响应式 state 的模型对象，
      // 不需要（也不该）再被外层 state 代理一层。
      editor: markRaw(new ProjectEditorModel('')),
    })
    this.app = app
  }

  async init() {
    const { path, configPath } = this.state

    const loadResult = await fromThrowableAsync(async () => {
      const configContent = await fs.read(configPath)
      const config = JSON.parse(configContent)
      config.__rawContent__ = configContent
      return config
    })

    if (loadResult.isErr()) {
      return Err(ErrorCode.PROJECT_LOAD_CONFIG_FAILED, {
        path,
        configPath,
        reason: loadResult.error,
      })
    }

    const validateResult = ProjectModel.validateConfig(loadResult.value)

    if (validateResult.isErr()) {
      return validateResult
    }

    const config = validateResult.value

    this.setState({
      path,
      configPath,

      icon: config.icon
        ? fileSystemUrl(pathJoin(path, config.debug?.resource, config.icon))
        : null,
      name: config.name,
      uuid: config.uuid,

      config,
      editor: markRaw(new ProjectEditorModel(config.__rawContent__)),
    })

    return Ok(void 0)
  }

  async dispose() {
    const { modal, locale } = this.app.state
    const { isEdit } = this.state.editor.state
    if (isEdit) {
      if ((await modal.confirm(locale.t('WARNING'), locale.t('UNSAVED'))) === true) {
        return this.save()
      }
    }
    return Ok(void 0)
  }

  async refresh() {
    const result = await this.dispose()
    if (result.isErr()) {
      return result
    }
    await this.app.state.history.record(this)
    return this.init()
  }

  async save() {
    const { isEdit, content } = this.state.editor.state
    if (!isEdit) {
      return Ok(void 0)
    }
    const validateResult = ProjectModel.validateConfig(content)
    if (validateResult.isErr()) {
      return Err(ErrorCode.SAVE_CONFIG_VALIDATE_FAILED, { content })
    }
    const saveResult = await fromThrowableAsync(async () =>
      fs.write(this.state.configPath, content),
    )

    if (saveResult.isErr()) {
      return Err(ErrorCode.SAVE_CONFIG_FAILED, {
        reason: saveResult.error,
      })
    }
    this.state.editor.setState({ content, isEdit: false })
    return this.refresh()
  }

  async build(target) {
    const { modal, locale } = this.app.state

    return await fromThrowableAsync(async () => {
      const { os: osType } = await os.info()

      let appPath

      const [progress, close] = modal.progress(locale.t('BUILDING_APP'))
      const _p = {
        project: this,
        progress,
        file: null,
      }
      try {
        if (osType.toLowerCase().replace(/\s/g, '') === 'macos') {
          _p.file = target || (await Niva.api.dialog.saveFile(['app']))
          const { buildMacOsApp } = await import('../build/build-macos')
          appPath = await buildMacOsApp(_p)
          await progress.run()
          close()
        } else if (osType.toLowerCase() === 'windows') {
          _p.file = target || (await Niva.api.dialog.saveFile(['exe']))
          const { buildWindowsApp } = await import('../build/build-windows')
          appPath = await buildWindowsApp(_p)
          await progress.run()
          close()
        } else {
          throw new Error(`${locale.t('UNSUPPORTED_OS')}"${osType}"`)
        }
      } catch (error) {
        close()
        modal.alert(locale.t('BUILD_FAILED'), error?.toString?.() ?? String(error))
        return
      }

      modal
        .confirm(locale.t('BUILD_SUCCESS'), locale.t('BUILD_SUCCESS_MESSAGE'))
        .then((ok) => ok && process.open(dirname(appPath)))
    })
  }

  async debug() {
    const { path, configPath, config } = this.state
    const resource = pathJoin(path, config?.debug?.resource)
    const entry = config?.debug?.entry || ''

    return fromThrowableAsync(async () => {
      const exe = await process.currentExe()
      process.exec(
        exe,
        [
          `--debug-config=${configPath}`,
          `--debug-resource=${resource}`,
          '--debug-devtools=true',
          ...(entry ? [`--debug-entry=${entry}`] : []),
        ],
        { detached: true },
      )
    })
  }

  open() {
    return fromThrowableAsync(() => process.open(this.state.path))
  }

  /** 配置合法性：字符串先 JSON.parse，然后必须有 name 与 uuid */
  static validateConfig(rawConfig) {
    let config = rawConfig
    if (typeof config === 'string') {
      const configResult = fromThrowable(() => JSON.parse(config))
      if (configResult.isErr()) {
        return Err(ErrorCode.PROJECT_CONFIG_VALIDATE_FAILED)
      }
      config = configResult.value
    }

    if (config && config.name && config.uuid) {
      return Ok(config)
    }
    return Err(ErrorCode.PROJECT_CONFIG_VALIDATE_FAILED)
  }
}
