/**
 * 配置与工程模板 —— 基于原版 packages/devtools/src/templates/*
 *
 * 四个模板文件合成一个模块：
 *   config-template.ts            → generateConfig
 *   new-project-template.ts       → generateNewProject
 *   macos-plist-template.ts       → plistTemplate
 *   windows-version-info-template.ts → versionInfoTemplate
 *
 * 配置结构（name/uuid/debug/build/meta）与占位符**逐字保留** —— 它们是写进用户项目的
 * 产物，格式必须与原版一致。三处刻意的偏离：
 *   1. 新建项目生成 `elva.json`（不是 `niva.json`）；旧文件仍可读
 *   2. Windows VERSION_INFO 里的 InternalName / OriginalFilename 用应用名，
 *      不再硬编码原版自己的 "niva.exe"
 *   3. 其余一致
 */

import { uuid, parseVersion } from './utils'

/* ---------------------------- elva.json 模板 ---------------------------- */

export const CONFIG_TYPES = ['simple', 'vueVite', 'vue', 'react']

export function generateConfig(type, name) {
  return {
    simple: {
      name,
      uuid: uuid(),
    },

    vueVite: {
      name,
      uuid: uuid(),

      debug: {
        entry: 'http://localhost:5173',
        resource: 'public',
      },

      build: {
        resource: 'dist',
      },
    },

    vue: {
      name,
      uuid: uuid(),

      debug: {
        entry: 'http://localhost:8080',
        resource: 'public',
      },

      build: {
        resource: 'dist',
      },
    },

    react: {
      name,
      uuid: uuid(),

      debug: {
        entry: 'http://localhost:3000',
        resource: 'public',
      },

      build: {
        resource: 'build',
      },
    },
  }[type]
}

/* ---------------------------- 新建项目模板 ---------------------------- */

export function generateNewProject(name) {
  return [
    // 新建项目用 elva 自己的配置名；旧的 niva.json 依然能被读取（见 utils::resolveConfigPath）
    ['elva.json', JSON.stringify(generateConfig('simple', name), null, 2)],
    ['index.html', "<h1>Hello World!</h1><script src='./index.js'></script>"],
    ['index.js', "console.log('Hello World!')"],
  ]
}

/* ---------------------------- macOS Info.plist ---------------------------- */

export function plistTemplate(config) {
  const version = parseVersion(config.meta?.version || '').join('.')
  return `

<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple Computer//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>English</string>
    <key>CFBundleDisplayName</key>
    <string>${config.name}</string>
    <key>CFBundleExecutable</key>
    <string>${config.name}</string>
    <key>CFBundleIconFile</key>
    <string>icon.icns</string>
    <key>CFBundleIdentifier</key>
    <string>${config.name}.${config.uuid}</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>${config.name}</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>${version}</string>
    <key>CFBundleVersion</key>
    <string>${version}</string>
    <key>CSResourcesFileMapped</key>
    <true />
    <key>LSRequiresCarbon</key>
    <true />
    <key>NSHighResolutionCapable</key>
    <true />
    <key>NSHumanReadableCopyright</key>
    <string>${config.meta?.copyright || ''}</string>
  </dict>
</plist>
`
}

/* ---------------------------- Windows VERSION_INFO ---------------------------- */

export function versionInfoTemplate(config) {
  const numberVersion = parseVersion(config.meta?.version || '').join(',')
  // 原版这里硬编码成 "niva.exe" —— 那是它自己的品牌，写进用户产物的文件属性里并不合适。
  // 改用应用名（去掉不适合做文件名的字符），拿不到时回落 exe。
  const exeName = `${String(config.name || 'app').replace(/[^\w.-]+/g, '_')}.exe`

  return `
1 VERSIONINFO
FILEVERSION ${numberVersion}
PRODUCTVERSION ${numberVersion}
FILEOS 0x40004
FILETYPE 0x1
{
BLOCK "StringFileInfo"
{
  BLOCK "040904b0"
  {
    VALUE "CompanyName", ${JSON.stringify(config.meta?.companyName || '')}
    VALUE "FileDescription", ${JSON.stringify(config.meta?.description || '')}
    VALUE "FileVersion", ${JSON.stringify(config.meta?.version)}
    VALUE "InternalName", "${exeName}"
    VALUE "LegalCopyright", ${JSON.stringify(config.meta?.copyright || '')}
    VALUE "OriginalFilename", "${exeName}"
    VALUE "ProductName", ${JSON.stringify(config.name)}
    VALUE "ProductVersion", ${JSON.stringify(config.meta?.version)}
    VALUE "SquirrelAwareVersion", "1"
  }
}

BLOCK "VarFileInfo"
{
  VALUE "Translation", 0x0409 0x04B0  
}
}`
}
