#!/usr/bin/env node
/**
 * 用本地资源装配 Electron，全程不联网。
 *
 * 背景：`electron` 这个 npm 包本身只是一层壳，真正的运行时是 300MB 的
 * Electron.app。它的 postinstall（install.js）会去 GitHub Releases 拉这个压缩包，
 * 国内基本拉不动。本机已经有一份解压好的运行时，所以这里直接把壳"喂饱"。
 *
 * electron 自己的 install.js 有个 isInstalled() 守卫，判定条件是三件事同时成立：
 *   1. node_modules/electron/dist/version 的内容等于 package.json 的 version
 *   2. node_modules/electron/path.txt 的内容等于当前平台的相对可执行路径
 *   3. 该可执行文件真的存在
 * 三件事都满足时 install.js 直接 exit 0，连下载函数都不会进。
 * 所以把这个状态摆好，后续 `yarn install` 就再也不会尝试联网。
 *
 * 另外还会做两道体检：
 *   1. 运行时内容完整性——坏资源装出来的运行时会在启动时静默退出（退出码 1、零输出），
 *      必须在装配前后拦下，否则事后极难归因
 *   2. macOS 签名自洽性——不自洽时执行 ad-hoc 重签
 *
 * 用法：
 *   node scripts/setup-electron.mjs
 *   ELVA_ELECTRON_SOURCE=/别的/路径 node scripts/setup-electron.mjs
 */

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDir, '..')

/**
 * 本地 Electron 资源可能放的位置，按优先级排列。
 * 用 ELVA_ELECTRON_SOURCE 可以指定任意路径。
 */
const sourceRoots = process.env.ELVA_ELECTRON_SOURCE
  ? [path.resolve(process.env.ELVA_ELECTRON_SOURCE)]
  : [
      path.join(projectRoot, 'build-resource', 'electron'),
      path.join(projectRoot, '..', 'build-resource', 'electron'),
    ]

const electronPkgDir = path.join(projectRoot, 'node_modules', 'electron')

/** 各平台可执行文件相对于 dist 的路径，与 electron/install.js 的 getPlatformPath() 保持一致 */
const PLATFORM_PATHS = {
  darwin: 'Electron.app/Contents/MacOS/Electron',
  mas: 'Electron.app/Contents/MacOS/Electron',
  win32: 'electron.exe',
  linux: 'electron',
  freebsd: 'electron',
  openbsd: 'electron',
}

const platformPath = PLATFORM_PATHS[process.platform]
if (!platformPath) {
  fail(`不支持的平台：${process.platform}`)
}

function fail(message) {
  console.error(`\n[setup-electron] 失败：${message}\n`)
  process.exit(1)
}

function info(message) {
  console.log(`[setup-electron] ${message}`)
}

/** macOS 下必须用 ditto，它才会保留 app bundle 的符号链接与扩展属性 */
async function copyTree(from, to) {
  if (process.platform === 'darwin' && spawnSync('which', ['ditto']).status === 0) {
    const res = spawnSync('ditto', [from, to], { stdio: 'inherit' })
    if (res.status !== 0) fail(`ditto 复制失败（退出码 ${res.status}）`)
    return
  }
  await cp(from, to, { recursive: true, verbatimSymlinks: true })
}

/** 去掉下载来源留下的隔离属性，否则首次启动会被 Gatekeeper 拦下 */
function stripQuarantine(target) {
  if (process.platform !== 'darwin') return
  const res = spawnSync('xattr', ['-dr', 'com.apple.quarantine', target], { stdio: 'ignore' })
  if (res.status === 0) info('已移除 com.apple.quarantine 属性')
}

/**
 * 签名自洽性检查（macOS）。
 *
 * 一个容易误判的点：官方 Electron 发行包本身就是 ad-hoc 签名、Sealed Resources=none，
 * 也就是**没有** Contents/_CodeSignature/ 目录——这是正常的，不要去"补"它。
 *
 * 真正需要处理的是另一种情况：二进制里的 CodeDirectory 声明了资源封印，
 * 但 Contents/_CodeSignature/CodeResources 实际缺失（常见于被第三方工具重新
 * 打包或裁剪过的 bundle）。这时 codesign --verify 会报
 *   "code has no resources but signature indicates they must be present"
 * 加载会被 amfid 拒绝。本地开发 ad-hoc 重签即可修复，无需开发者证书。
 *
 * 注意：签名失败往往同时是"运行时内容被破坏"的旁证，但两者不能互相替代——
 * 内容体检在 findRuntimeProblems() 里单独做。
 */
function ensureSigned(appBundle) {
  if (process.platform !== 'darwin') return

  const verify = spawnSync('codesign', ['--verify', '--deep', '--strict', appBundle], {
    stdio: 'ignore',
  })
  if (verify.status === 0) {
    info('签名校验通过')
    return
  }

  const entitlements = path.join(scriptDir, 'entitlements.mac.plist')
  info('签名不可用，执行 ad-hoc 重签…')

  const sign = spawnSync(
    'codesign',
    [
      '--force',
      '--deep',
      '--sign',
      '-',
      '--entitlements',
      entitlements,
      '--timestamp=none',
      appBundle,
    ],
    { encoding: 'utf-8' },
  )

  if (sign.status !== 0) {
    console.warn('[setup-electron] 重签失败，不影响文件装配，但运行时可能无法启动：')
    console.warn(sign.stderr?.trim() || sign.stdout?.trim() || '(无输出)')
    return
  }

  const recheck = spawnSync('codesign', ['--verify', '--deep', '--strict', appBundle], {
    stdio: 'ignore',
  })
  info(recheck.status === 0 ? 'ad-hoc 重签完成，签名校验通过' : 'ad-hoc 重签后校验仍失败')
}

/**
 * 运行时内容完整性体检。
 *
 * 起因是一个真实踩到的坑：拿到的 Electron.app 里
 *   Contents/Resources/default_app.asar
 * 本该是约 111KB 的 asar 归档**文件**，却变成了一个权限 drw-r--r-- 的空**目录**。
 * 后果是启动即静默退出——退出码 1、零 stdout/stderr、无崩溃报告，排查成本极高。
 * 所以装配前后都必须体检：宁可明确报错，也不要装出一个坏运行时。
 *
 * 返回问题清单；空数组表示完好。
 */
function findRuntimeProblems(distDir) {
  const problems = []

  const check = (rel) => {
    const abs = path.join(distDir, rel)
    if (!existsSync(abs)) {
      problems.push(`缺失 ${rel}`)
      return
    }
    try {
      if (statSync(abs).isDirectory()) problems.push(`${rel} 是目录，应为文件（资源被破坏的典型特征）`)
    } catch (err) {
      problems.push(`${rel} 无法读取（${err.code || err.message}）`)
    }
  }

  if (process.platform === 'darwin') {
    const res =
      'Electron.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Resources'
    check('Electron.app/Contents/MacOS/Electron')
    check('Electron.app/Contents/Resources/default_app.asar')
    check('Electron.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework')
    check(`${res}/icudtl.dat`)

    const snapshots = [
      'v8_context_snapshot.bin',
      'v8_context_snapshot.arm64.bin',
      'v8_context_snapshot.x86_64.bin',
    ]
    if (!snapshots.some((f) => existsSync(path.join(distDir, res, f)))) {
      problems.push(`缺失 ${res}/v8_context_snapshot*.bin`)
    }
  } else {
    check(platformPath)
    check('resources/default_app.asar')
    check('icudtl.dat')
  }

  return problems
}

async function main() {
  if (!existsSync(electronPkgDir)) {
    fail(`找不到 ${electronPkgDir}，请先执行 yarn install（可加 --ignore-scripts）`)
  }

  const pkg = JSON.parse(await readFile(path.join(electronPkgDir, 'package.json'), 'utf-8'))

  const targetDist = path.join(electronPkgDir, 'dist')
  const targetExe = path.join(targetDist, platformPath)
  const pathTxt = path.join(electronPkgDir, 'path.txt')

  // 已经装配好就立刻返回。这一步必须放在找源之前：
  // 源目录是临时的，删掉之后不该让 yarn install 直接失败。
  const alreadyOk =
    existsSync(targetExe) &&
    existsSync(pathTxt) &&
    (await readFile(pathTxt, 'utf-8')).trim() === platformPath &&
    existsSync(path.join(targetDist, 'version'))

  if (alreadyOk) {
    const existing = findRuntimeProblems(targetDist)
    if (existing.length === 0) {
      const realVersion = (await readFile(path.join(targetDist, 'version'), 'utf-8')).trim()
      info(`运行时已就绪（dist/version = ${realVersion}），跳过复制`)
      // 即使跳过复制也复查一次签名：被重新打包过的 bundle 可能签名不自洽
      if (process.platform === 'darwin') ensureSigned(path.join(targetDist, 'Electron.app'))
      return
    }
    info('已存在的运行时体检不通过，改从本地资源重建：')
    for (const p of existing) info(`  - ${p}`)
  }

  // 每个候选根目录下，dist 可以直接叫 dist，也可以就是根目录本身
  const candidates = sourceRoots.flatMap((root) => [path.join(root, 'dist'), root])
  const sourceDist = candidates.find((dir) => existsSync(path.join(dir, platformPath)))

  if (!sourceDist) {
    fail(
      `运行时尚未装配，且本地资源目录里没有可用的 Electron。\n` +
        `  已尝试：\n${candidates.map((c) => `    - ${c}`).join('\n')}\n` +
        `  需要该目录下存在 ${platformPath}，\n` +
        `  或把已有的 Electron.app 手动放到 ${targetDist}。\n` +
        `  路径可用 ELVA_ELECTRON_SOURCE 环境变量覆盖。`,
    )
  }

  // 装配前先给源做体检。这一步很关键：坏资源装出来的运行时会在启动时静默退出
  // （退出码 1、零输出），现象与"环境不支持"几乎一样，事后极难归因。
  const sourceProblems = findRuntimeProblems(sourceDist)
  if (sourceProblems.length > 0) {
    fail(
      `本地资源里的 Electron 运行时体检不通过，拒绝装配。\n` +
        `  路径：${sourceDist}\n` +
        `  问题：\n${sourceProblems.map((p) => `    - ${p}`).join('\n')}\n\n` +
        `  修法：重新解压一份完整的官方发行包。必须用 ditto（或"归档实用工具"），\n` +
        `  用 unzip 之类会丢失符号链接/权限的工具是这类损坏的常见来源。macOS arm64 示例：\n` +
        `    curl -L -o /tmp/electron.zip \\\n` +
        `      https://registry.npmmirror.com/-/binary/electron/<版本>/electron-v<版本>-darwin-arm64.zip\n` +
        `    rm -rf ${sourceDist} && mkdir -p ${sourceDist}\n` +
        `    ditto -x -k /tmp/electron.zip ${sourceDist}\n` +
        `  压缩包可用同目录 checksums.json 里对应的 SHA256 校验。`,
    )
  }
  info('源运行时体检通过')

  info(`来源：${sourceDist}`)
  info(`目标：${targetDist}`)

  if (existsSync(targetDist)) {
    info('清理旧的 dist 目录…')
    await rm(targetDist, { recursive: true, force: true })
  }
  await mkdir(path.dirname(targetDist), { recursive: true })

  info('复制运行时…')
  await copyTree(sourceDist, targetDist)

  const copiedProblems = findRuntimeProblems(targetDist)
  if (copiedProblems.length > 0) {
    fail(
      `复制完成但体检不通过，运行时不可用：\n` +
        `${copiedProblems.map((p) => `    - ${p}`).join('\n')}\n` +
        `  多为复制过程丢失了符号链接或权限所致。`,
    )
  }
  info('复制后体检通过')

  stripQuarantine(targetDist)

  if (process.platform === 'darwin') ensureSigned(path.join(targetDist, 'Electron.app'))

  // install.js 的 isInstalled() 会拿 dist/version 跟壳的版本号比对，不一致就会触发下载。
  // 这里写入壳声明的版本号，让守卫通过；真实运行时版本另记在下面。
  await writeFile(path.join(targetDist, 'version'), pkg.version)

  await writeFile(pathTxt, platformPath)
  info(`已写入 path.txt -> ${platformPath}`)

  await writeFile(
    path.join(electronPkgDir, '.elva-local-build'),
    [
      '这个 electron 运行时来自本地资源目录，不是从网上下载的。',
      `本地资源路径：${sourceDist}`,
      `壳（npm 包）版本：${pkg.version}`,
      '注意：dist/version 被写成壳的版本号，仅为通过 install.js 的 isInstalled() 守卫，',
      '不保证与真实运行时版本一致。真实版本以运行时自身为准。',
      '',
    ].join('\n'),
  )

  // 版本对齐情况如实打印，避免后面排查时被误导。
  // 这里用 ELECTRON_RUN_AS_NODE 探针：GUI 模式在无图形会话的环境里会静默退出，拿不到任何输出。
  const probe = spawnSync(path.join(targetDist, platformPath), ['-p', 'process.versions.electron'], {
    encoding: 'utf-8',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  })
  const reported = (probe.stdout || '').trim()

  info('装配完成')
  info(`  壳声明版本：${pkg.version}`)
  info(`  运行时真实版本：${reported || '(未能取得，可稍后手动探测)'}`)

  if (reported && reported !== pkg.version) {
    info('  提示：两者不一致。运行时以本地那一份为准，功能不受影响；')
    info('        打包时请确认 package.json 里的 build.electronVersion 与实际运行时一致。')
  }
}

main().catch((err) => fail(err?.stack || String(err)))
