/**
 * Windows 构建 —— 对齐原版 packages/devtools/src/build-scripts/build-windows.ts
 *
 * 六个步骤与原版一一对应：
 *   准备构建环境 → 打包资源文件 → 压缩资源文件 →
 *   生成图标 → 构建可执行文件 → 清理构建环境
 *
 * 依赖资源目录里的 windows/ResourceHacker.exe 与 windows/icon_creator.exe
 * （与原版 devtools 的资源内容一致，已随工作台一起打包）。
 *
 * 该分支只在 os.info().os === "Windows" 时执行，在 macOS 上不会触发。
 */

import { pathJoin, runCmd, tempDirWith } from '../utils'
import { appendResource, arrayBufferToBase64, dataKey, indexesKey, packageResource, deflateRaw } from './base'
import { versionInfoTemplate } from '../templates'

export async function buildWindowsApp(params) {
  const { project, file, progress } = params
  const { process, fs, resource } = Niva.api
  const { locale } = project.app.state

  const currentExe = await process.currentExe()
  if (!file) {
    throw new Error(locale.t('UNSELECTED_EXE_FILE'))
  }

  const targetExe = file.endsWith('.exe') ? file : file + '.exe'
  const projectResourcePath = pathJoin(
    project.state.path,
    project.state.config.build?.resource,
  )
  const buildPath = tempDirWith(`${project.state.name}_${project.state.uuid.slice(0, 8)}`)
  const indexesPath = pathJoin(buildPath, indexesKey)
  const dataPath = pathJoin(buildPath, dataKey)

  progress.addTask(locale.t('PREPARE_BUILD_ENVIRONMENT'), async () => {
    await fs.createDirAll(buildPath)
  })

  let fileIndexes = {}
  let buffer = new ArrayBuffer(0)
  progress.addTask(locale.t('PACKAGING_RESOURCES'), async () => {
    // 配置文件的资源键必须与磁盘上的真实文件名一致（elva.json 或旧的 niva.json）
    const configKey = project.state.configPath.split(/[/\\]/).pop()
    const initialResource = await appendResource(project.state.configPath, configKey)
    const [_fileIndex, _buffer] = await packageResource(
      projectResourcePath,
      ...initialResource,
    )
    fileIndexes = _fileIndex
    buffer = _buffer
  })

  progress.addTask(locale.t('COMPRESSING_RESOURCES'), async () => {
    const compressedBuffer = await deflateRaw(buffer)
    await Promise.all([
      fs.write(indexesPath, JSON.stringify(fileIndexes, null, 2)),
      fs.write(dataPath, arrayBufferToBase64(compressedBuffer), 'base64'),
    ])
  })

  progress.addTask(locale.t('GENERATING_ICON'), async () => {
    if (!project.state.config.icon) {
      return
    }
    const iconPath = pathJoin(projectResourcePath, project.state.config.icon)
    await resource.extract(
      'windows/icon_creator.exe',
      pathJoin(buildPath, 'icon_creator.exe'),
    )
    await process.exec(pathJoin(buildPath, 'icon_creator.exe'), [
      iconPath,
      pathJoin(buildPath, 'icon.ico'),
    ])
  })

  progress.addTask(locale.t('BUILD_EXECUTABLE_FILE'), async () => {
    await resource.extract(
      'windows/ResourceHacker.exe',
      pathJoin(buildPath, 'ResourceHacker.exe'),
    )

    const versionInfoPath = pathJoin(buildPath, 'VERSION_INFO')
    await fs.write(versionInfoPath, versionInfoTemplate(project.state.config))

    const iconScript = `
-delete ICON,1,0
-delete ICON,2,0
-delete ICON,3,0
-delete ICON,4,0
-delete ICON,5,0
-delete ICON,6,0
-delete ICON,7,0
-addoverwrite ${pathJoin(buildPath, 'icon.ico')}, ICONGROUP,1,1033
`

    const script = `
[FILENAMES]
Exe=    ${currentExe}
SaveAs= ${targetExe}
Log=    ${pathJoin(buildPath, 'ResourceHacker.log')}
[COMMANDS]
-addoverwrite ${indexesPath}, RCDATA,${indexesKey},1033
-addoverwrite ${dataPath}, RCDATA,${dataKey},1033
${project.state.config.icon ? iconScript : ''}
`

    await fs.write(pathJoin(buildPath, 'bundle_script.txt'), script)

    try {
      await runCmd(pathJoin(buildPath, 'ResourceHacker.exe'), [
        '-script',
        pathJoin(buildPath, 'bundle_script.txt'),
      ])
    } catch (err) {
      await process.open(buildPath)
      throw err
    }
  })

  progress.addTask(locale.t('CLEAN_BUILD_ENVIRONMENT'), async () => {
    await fs.remove(buildPath)
  })

  return targetExe
}
