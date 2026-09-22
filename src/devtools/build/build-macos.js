/**
 * macOS 构建 —— 对齐原版 packages/devtools/src/build-scripts/build-macos.ts
 *
 * 原版的六个步骤名称、顺序、进度提示词一一对应：
 *   创建 APP 目录结构 → 复制可执行文件 → 打包资源文件 →
 *   压缩资源文件 → 生成图标 → 生成 Info.plist
 * 另加两个 elva 必需的步骤（放在末尾，不动原版那六步的语义）：
 *   装配应用运行时 → 签名应用
 *
 * ---------------------------------------------------------------------------
 * 为什么必须多出这两步（原版不需要）
 * ---------------------------------------------------------------------------
 * 原版 Niva 的运行时是**单个自包含的可执行文件**，把资源（RESOURCE_INDEXES /
 * RESOURCE_DATA）内嵌在自身里。所以「建一个 .app 目录 + 把 exe 拷进去 +
 * 写个 Info.plist」就得到了一个能双击运行的应用。
 *
 * Electron 不是这样：`MacOS/Electron` 只是个加载器，它一定要
 *   ① `Contents/Frameworks/Electron Framework.framework`（否则 dyld 直接 abort：
 *      `Library not loaded: @rpath/Electron Framework.framework/Electron Framework`）
 *   ② `Contents/Frameworks/<name> Helper*.app`（渲染/GPU/插件进程）
 *   ③ `Contents/Resources/app/`（一个带 package.json 的 JS 应用）
 * 三者缺一，产物都是「能拷出来但打不开」。
 *
 * 所以这里的做法是标准的 macOS 应用装配：
 *   复制整棵 Electron.app 骨架 → 换掉可执行文件名与 Helper 名 → 装运行时与资源
 *   → 覆盖 Info.plist → ad-hoc 重签名
 *
 * 复制一律用 `ditto` 而不是 `fs.copy`：`fs.copy` 底层是 `copyFileSync`，会**跟随
 * 符号链接**，而 .framework 目录结构大量依赖符号链接（`Versions/Current`、
 * `Resources` 等），跟着拷会把体积翻倍并破坏 bundle 结构。
 */

import { dirname, pathJoin, runCmd } from '../utils'
import {
  appendResource,
  arrayBufferToBase64,
  dataKey,
  indexesKey,
  packageResource,
  deflateRaw,
} from './base'
import { plistTemplate } from '../templates'

/** 产物里运行时代码的目录名（`Contents/Resources/app`） */
const RUNTIME_DIR_NAME = 'app'
/** 产物里项目资源的目录名（`Contents/Resources/resources`） */
const RESOURCES_DIR_NAME = 'resources'
/** Electron 自带 helper 的名字前缀 */
const HELPER_PREFIX = 'Electron Helper'

async function removeIfExists(fs, target) {
  if (await fs.exists(target)) {
    await fs.remove(target)
  }
}

/**
 * 把 `Electron Helper*.app` 改名为 `<appName> Helper*.app`。
 *
 * 必须改：Electron 在 macOS 上按主 bundle 的 `CFBundleName` 拼出 helper 的路径
 * （`<Frameworks>/<CFBundleName> Helper.app`）。主应用改了名字而 helper 没改，
 * 启动时主进程能起来，但**渲染进程拉不起来**（白屏 / 闪退），而且不报明显的错。
 */
async function renameHelpers(fs, frameworksPath, appName) {
  for (const entry of await fs.readDir(frameworksPath)) {
    if (!entry.startsWith(HELPER_PREFIX)) continue

    const suffix = entry.slice(HELPER_PREFIX.length) // '' | ' (GPU).app' | ...
    const helperPath = pathJoin(frameworksPath, entry)
    const nextHelperPath = pathJoin(frameworksPath, `${appName} Helper${suffix}`)

    await removeIfExists(fs, nextHelperPath)
    await fs.move(helperPath, nextHelperPath)

    // ① 可执行文件本身
    const binDir = pathJoin(nextHelperPath, 'Contents', 'MacOS')
    for (const bin of await fs.readDir(binDir)) {
      if (!bin.startsWith(HELPER_PREFIX)) continue
      const binSuffix = bin.slice(HELPER_PREFIX.length)
      await fs.move(pathJoin(binDir, bin), pathJoin(binDir, `${appName} Helper${binSuffix}`))
    }

    // ② Info.plist 里的 CFBundleExecutable / CFBundleName 必须跟着改，
    //    否则 helper 会因为「Info.plist 指向的可执行文件不存在」而拒绝启动
    const plistPath = pathJoin(nextHelperPath, 'Contents', 'Info.plist')
    const plist = await fs.read(plistPath)
    await fs.write(plistPath, plist.replaceAll(HELPER_PREFIX, `${appName} Helper`))
  }
}

export async function buildMacOsApp(params) {
  const { project, file, progress } = params
  const { process: proc, fs } = Niva.api
  const { locale } = project.app.state

  const currentExe = await proc.currentExe()

  if (!file) {
    throw new Error(locale.t('UNSELECTED_APP_FILE'))
  }

  const appName = project.state.name
  const config = project.state.config
  const configName = project.state.configPath.split(/[/\\]/).pop()

  const appPath = file.endsWith('.app') ? file : file + '.app'
  const appContentsPath = pathJoin(appPath, 'Contents')
  const appResourcesPath = pathJoin(appContentsPath, 'Resources')
  const appMacOSPath = pathJoin(appContentsPath, 'MacOS')
  const appFrameworksPath = pathJoin(appContentsPath, 'Frameworks')
  const appExecutablePath = pathJoin(appMacOSPath, appName)
  const appInfoPlistPath = pathJoin(appContentsPath, 'Info.plist')
  const appIconPath = pathJoin(appResourcesPath, 'icon.icns')
  const appIconsetPath = pathJoin(appResourcesPath, 'icon.iconset')

  /** 产物里的 elva 运行时（`Contents/Resources/app`） */
  const appRuntimePath = pathJoin(appResourcesPath, RUNTIME_DIR_NAME)
  /** 产物里的项目资源（`Contents/Resources/resources`） */
  const appProjectResourcePath = pathJoin(appResourcesPath, RESOURCES_DIR_NAME)

  const projectResourcePath = pathJoin(project.state.path, config.build?.resource)
  const indexesPath = pathJoin(appResourcesPath, indexesKey)
  const dataPath = pathJoin(appResourcesPath, dataKey)

  // Electron.app 的根：<...>/Electron.app/Contents/MacOS/Electron → 往上三级
  const electronAppPath = dirname(dirname(dirname(currentExe)))

  progress.addTask(locale.t('CREATING_APP_STRUCTURE'), async () => {
    // 整棵 Electron.app 骨架（Frameworks + Resources + MacOS + PkgInfo + Info.plist）
    await removeIfExists(fs, appPath)
    await runCmd('ditto', [electronAppPath, appPath])

    // 用应用自己的可执行文件名，Electron 原名那份不再需要
    await removeIfExists(fs, pathJoin(appMacOSPath, 'Electron'))
    // Electron 的兜底应用：留着会让人以为产物「打开的是 Electron 欢迎页」
    await removeIfExists(fs, pathJoin(appResourcesPath, 'default_app.asar'))
  })

  progress.addTask(locale.t('COPYING_EXECUTABLE_FILE'), async () => {
    await fs.copy(currentExe, appExecutablePath)
    // 主应用改名后，Helper 必须跟着改（见 renameHelpers 的注释）
    await renameHelpers(fs, appFrameworksPath, appName)
  })

  let fileIndexes = {}
  let buffer = new ArrayBuffer(0)
  progress.addTask(locale.t('PACKAGING_RESOURCES'), async () => {
    // ① 原版格式：把资源压成 RESOURCE_INDEXES + RESOURCE_DATA 两个文件
    //    配置文件的资源键必须与磁盘上的真实文件名一致（elva.json / niva.json）
    const initialResource = await appendResource(project.state.configPath, configName)
    const [_fileIndex, _buffer] = await packageResource(
      projectResourcePath,
      ...initialResource,
    )
    fileIndexes = _fileIndex
    buffer = _buffer

    // ② elva 的实际加载路径：资源仍以**目录**形式装进 Contents/Resources/resources。
    //    打包产物的入口按 process.resourcesPath/resources 找资源根（见 packaged-main.js），
    //    所以这一步不是冗余 —— 上一步的两个文件是给「未来做内嵌读取」留的兼容产物。
    await removeIfExists(fs, appProjectResourcePath)
    await fs.createDirAll(appProjectResourcePath)
    if (await fs.exists(projectResourcePath)) {
      await runCmd('ditto', [projectResourcePath, appProjectResourcePath])
    }
  })

  progress.addTask(locale.t('COMPRESSING_RESOURCES'), async () => {
    const compressedBuffer = await deflateRaw(buffer)
    await Promise.all([
      fs.write(indexesPath, JSON.stringify(fileIndexes, null, 2)),
      fs.write(dataPath, arrayBufferToBase64(compressedBuffer), 'base64'),
    ])
  })

  progress.addTask(locale.t('GENERATING_ICON'), async () => {
    // create icon
    if (!config.icon) {
      return
    }

    const iconPath = pathJoin(projectResourcePath, config.icon)

    for (const size of [16, 32, 64, 128, 256]) {
      await proc.exec('sips', [
        '-z',
        size.toString(),
        size.toString(),
        iconPath,
        '--out',
        pathJoin(appIconsetPath, `icon_${size}x${size}.png`),
      ])
    }

    await proc.exec('iconutil', ['-c', 'icns', appIconsetPath, '-o', appIconPath])
    await fs.remove(appIconsetPath)
  })

  progress.addTask(locale.t('GENERATING_INFO_PLIST'), async () => {
    await fs.write(appInfoPlistPath, plistTemplate(config))
  })

  progress.addTask(locale.t('INSTALLING_RUNTIME'), async () => {
    // ① elva 的运行时（主进程 + preload + Niva 兼容层）
    const elvaAppDir = await window.electronAPI.getRuntimeDir()
    await removeIfExists(fs, appRuntimePath)
    await fs.createDirAll(appRuntimePath)
    await runCmd('ditto', [pathJoin(elvaAppDir, 'electron'), pathJoin(appRuntimePath, 'electron')])

    // ② 产物入口的 package.json（main 指向 packaged-main.js）
    //    版本号取配置里的 meta.version，取不到就退回 1.0.0
    const version = String(config.meta?.version || '').trim() || '1.0.0'
    await fs.write(
      pathJoin(appRuntimePath, 'package.json'),
      JSON.stringify(
        {
          name: 'elva-packaged-app',
          productName: appName,
          version,
          main: 'electron/packaged-main.js',
        },
        null,
        2,
      ),
    )

    // ③ 用户的配置文件（打包入口按文件名顺序查找）
    await fs.copy(project.state.configPath, pathJoin(appRuntimePath, configName))
  })

  progress.addTask(locale.t('SIGNING_APP'), async () => {
    // 改动 Info.plist / 可执行文件名之后，Electron 自带的签名必然失效。
    // 不重签的话 macOS 会认为 bundle 已损坏（尤其在别台机器上）。
    // ad-hoc（`-`）签名不需要证书，本地/内部分发足够。
    try {
      await runCmd('codesign', ['--force', '--deep', '--sign', '-', appPath])
    } catch (error) {
      // 签名失败不阻断构建：产物在本机（无 quarantine 标记）通常仍可运行
      console.warn(`[elva] ad-hoc 签名失败，产物可能无法在别的机器上直接打开：${error.message}`)
    }
  })

  return appPath
}
