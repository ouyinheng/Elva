# Elva

> 用前端技术开发跨平台桌面应用：一个**兼容 Niva API 的 Electron 运行时** + 一个**可视化开发者工具**。

<p>
  <img alt="Electron" src="https://img.shields.io/badge/Electron-44-47848F?logo=electron&logoColor=white">
  <img alt="Vue" src="https://img.shields.io/badge/Vue-3-4FC08D?logo=vuedotjs&logoColor=white">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white">
  <img alt="Platform" src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-blue">
</p>

---

## 一、项目简介

**Elva 是一个"桌面应用开发工作台"**：你只写 HTML / CSS / JavaScript（Vue、React 或原生都行），Elva 负责把它变成可双击运行的桌面应用，并把它需要的系统能力（窗口、托盘、菜单、剪贴板、文件系统、全局快捷键、对话框……）以一套 JavaScript API 交到你手里。

它由两部分组成：

| 组成 | 位置 | 说明 |
| --- | --- | --- |
| **Elva 运行时** | `electron/` | 主进程侧的框架本体。实现自定义协议 `elva://`、窗口/菜单/托盘管理、事件总线、IPC 调用协议，以及 **14 个命名空间、133 个方法**的 JS API |
| **Elva 开发者工具（工作台）** | `src/` | 图形化工作台：新建 / 导入 / 配置 / 调试 / 构建，全程不用命令行 |

### 1.1 与 Niva 的关系

Elva 的 API 形态与配置格式对齐了 macOS / Windows 桌面框架 **[Niva](https://github.com/bramblex/niva)**（Rust + tao/wry，MIT，已停更）：

- 配置文件名优先读 `elva.json`，并**兼容读取旧的 `niva.json`**；
- 渲染进程同时注入 `window.Niva` 与 `window.Elva`，**未经改动的 Niva 项目可以直接跑**；
- 事件派发、IPC 请求/响应报文格式、`window.close(0)` 退出应用等语义逐条对齐。

**但 Elva 不是 Niva 的移植，也不是它的分支**：Niva 用 Rust + 系统 WebView，Elva 用 Electron + Vue 重写。

### 1.2 与 Electron 的关系（请先读这一段）

Elva **建立在 Electron 之上**，因此不存在 Niva "单个 3MB 可执行文件"的特性：

| | Elva | Niva | Tauri | Electron |
| --- | --- | --- | --- | --- |
| 运行时 | Electron 44 | Rust + 系统 WebView | Rust + 系统 WebView | Chromium + Node |
| 产物体积 | ≈ 290 MB（.app 解压后） | ≈ 3 MB | 6 MB+ | 85 MB+ |
| 需要写 Rust | 否 | 否 | 是 | 否 |
| 开发方式 | 纯前端 | 纯前端 | Rust + 前端 | Node + 前端 |

一句话取舍：**用体积换"零 Rust、零后端、一套 API 直接可用"的开发体验。** 如果你追求极致体积，应该去看 Niva / Tauri；如果你想要"前端写完就能出桌面应用"，Elva 的路径更短。

---

## 二、主要功能

### 2.1 运行时（框架能力）

- **Niva 兼容层**：`window.Niva` / `window.Elva` 运行时注入主世界，事件 + 回调式 API 调用协议与原版一致
- **14 个 API 命名空间**：`window`(50) `windowExtra`(17) `fs`(12) `process`(10) `dialog`(6) `os`(5) `webview`(5) `tray`(5) `monitor`(4) `shortcut`(4) `http`(3) `resource`(3) `extra`(7) `clipboard`(2)
- **三种执行模型**：同步方法就地执行；异步方法进并发上限 4 的线程池；事件类方法抛回主事件循环（避免死锁、保证事件时序）
- **自定义协议 `elva://`**：应用资源与本地文件以受控方式提供给渲染进程（`elva://filesystem/<绝对路径>`）
- **安全默认值**：`contextIsolation` + preload 白名单 IPC；生产环境默认拒绝所有权限请求

### 2.2 开发者工具（工作台界面）

- **新建项目**：4 种模板 —— 原生 HTML、Vue + Vite、Vue CLI、React
- **导入项目**：按钮选择，或**把文件夹直接拖进窗口**
- **项目列表**：搜索、最近项目历史、右键删除、**左栏宽度可拖拽**（双击恢复默认）
- **项目信息**：基本信息 / 调试信息 / 构建信息三个页签
- **配置面板**：可视化表单、JSON 编辑器、分屏三种视图共用同一份内容，实时同步；JSON 非法时给出提示；未保存时页签带红点
- **一键调试**：以项目模式重启自身进程（`--debug-config` / `--debug-resource` / `--debug-entry`，并带 `--debug-devtools=true`），按配置里的 `debug.entry` 起窗口
- **一键构建**：macOS 产出可双击的 `.app`（含图标、`Info.plist`、ad-hoc 重签）；Windows 产出带图标与版本信息的 `.exe`
- **内置文档**：状态栏「文档」打开随应用分发的 `elva-docs.html`
- **中英双语**：状态栏一键切换 `zh_CN` / `en_US`
- **键盘操作**：任何功能都不需要鼠标

### 2.3 键盘快捷键

| 快捷键 | 功能 |
| --- | --- |
| `⌘/Ctrl + F` | 聚焦搜索框 |
| `⌘/Ctrl + N` | 新建项目 |
| `⌘/Ctrl + O` | 打开项目 |
| `⌘/Ctrl + D` | 调试当前项目 |
| `⌘/Ctrl + B` | 构建当前项目 |
| `⌘/Ctrl + 1 / 2` | 切换「信息 / 配置」页签 |
| `↑` / `↓` | 在项目列表中移动选择 |
| `Esc` | 清空搜索 / 关闭弹窗 |

> `⌘/Ctrl + R`、`⌘/Ctrl + W`、`⌘/Ctrl + Q` 刻意不占用，留给系统与开发习惯。

---

## 三、目录结构

```
elva/
├── electron/                     # ★ Elva 运行时（主进程）
│   ├── main.js                   #   工作台入口（两种模式：工作台 / 以项目模式运行）
│   ├── packaged-main.js          #   打包产物入口（读 elva.json 起用户应用的窗口）
│   ├── preload.js                #   注入 Niva 运行时到主世界 + 白名单 IPC + 文件拖放
│   └── runtime/                  #   运行时实现
│       ├── context.js            #     上下文（name / uuid / idName / workers / 资源根）
│       ├── windows.js            #     窗口管理（id 体系、close(0) 退出语义）
│       ├── menu.js  tray.js      #     菜单 / 托盘（u8 item id，按窗口命名空间隔离）
│       ├── shortcut.js  events.js#     全局快捷键 / 事件派发
│       ├── resource.js  mime.js  #     elva:// 自定义协议与资源读取
│       ├── options.js            #     命令行参数（--debug-config / --debug-resource …）
│       └── api/                  #     ★ 14 个命名空间 / 133 个 API 方法
│           ├── index.js          #       注册总表（顺序对齐上游）
│           ├── window.js  window-extra.js  fs.js  http.js  os.js  process.js
│           ├── webview.js  resource.js  clipboard.js  shortcut.js
│           └── tray.js  monitor.js  dialog.js  extra.js  helpers.js
│
├── src/                          # ★ 工作台前端（渲染进程，Vue 3）
│   ├── main.js                   #   入口：右键/Ctrl+R 屏蔽、开发日志、挂载
│   ├── App.vue                   #   根组件：标题栏 + 内容区 + 状态栏；启动流程与全局快捷键
│   ├── components/devtools/      #   界面组件
│   │   ├── Titlebar.vue          #     标题栏（macOS 用系统红绿灯，Windows 自绘三个按钮）
│   │   ├── Statusbar.vue         #     状态栏：系统信息、版本、语言、文档、快捷键帮助
│   │   ├── ImportPage.vue        #     导入页（空态）
│   │   ├── ProjectPage.vue       #     项目页：左栏列表 + 右栏信息，可拖拽分栏
│   │   ├── ProjectList.vue       #     项目列表：搜索 / 历史 / 右键删除
│   │   ├── ProjectInfo.vue       #     项目信息：「信息 / 配置」页签
│   │   ├── ProjectDetails.vue    #     基本信息 / 调试信息 / 构建信息
│   │   ├── ConfigPanel.vue       #     配置面板：表单 / JSON / 分屏三视图
│   │   ├── ConfigForm.vue        #     可视化配置表单
│   │   ├── ConfigEditor.vue      #     JSON 配置编辑器
│   │   ├── ModalHost.vue         #     模态框宿主（进度、确认、错误）
│   │   └── ...                   #     Logo / DevIcon / WindowControl / HighlightText
│   ├── devtools/                 #   业务逻辑（与界面解耦）
│   │   ├── models/               #     状态模型：app / project / state / history / modal / locale
│   │   ├── build/                #     构建管线
│   │   │   ├── base.js           #       资源打包（RESOURCE_INDEXES / RESOURCE_DATA）
│   │   │   ├── build-macos.js    #       macOS：.app 装配 + 图标 + Info.plist + 重签
│   │   │   └── build-windows.js  #       Windows：图标 + 版本信息 + 资源嵌入
│   │   ├── composables/          #     useShortcuts（快捷键）/ useFileDrop（拖放导入）
│   │   ├── templates.js          #     新建项目的配置与工程模板
│   │   ├── i18n.js               #     中英词条
│   │   ├── result.js  error.js   #     Result 类型与错误码
│   │   └── utils.js              #     路径、参数解析、资源 URL 等工具
│   └── assets/devtools/          #   样式（base/app/pages.css）、图标、字体
│
├── public/                       # 随应用分发的静态资源（Vite publicDir）
│   ├── elva-docs.html            #   ★ 内置文档（状态栏「文档」打开）
│   ├── logo.png                  #   应用图标
│   └── windows/                  #   ★ Windows 构建依赖的两个工具（见"注意事项"）
│       ├── icon_creator.exe      #     PNG → ICO
│       └── ResourceHacker.exe    #     exe 图标与版本信息写入
│
├── scripts/
│   ├── setup-electron.mjs        # ★ 用本地资源离线装配 Electron（postinstall 调用）
│   └── entitlements.mac.plist    #   ad-hoc 重签用的 entitlements
│
├── index.html                    # 渲染进程页面骨架（Vite 入口）
├── vite.config.mjs               # Vite 配置（含 CSP 注入、base: './'）
├── package.json
└── yarn.lock
```

**未纳入本仓库**：同工程的 `docs/`（开发过程文档）、`example/`（上游 Niva 源码，仅供对照）、`tools/`，以及被 `.gitignore` 排除的构建产物与本地运行时。

---

## 四、环境依赖

| 依赖 | 版本 / 要求 | 说明 |
| --- | --- | --- |
| Node.js | ≥ 20.19（建议 22 LTS） | Vite 8 的下限；Electron 主进程用的是它自带的 Node，与系统 Node 无关 |
| Yarn | 1.x（Classic） | 仓库带 `yarn.lock`（lockfile v1），用 yarn 安装可复现 |
| Electron 运行时 | **44.x（本仓库对照版本：44.0.0）** | 约 290 MB，**不入库**，需要自己准备（见 5.1） |
| 操作系统 | macOS 10.15+ / Windows 10+ | 构建哪个平台的产物，就得在哪个平台上操作 |
| 磁盘空间 | ≈ 1 GB | `node_modules` ≈ 570 MB + Electron 运行时 ≈ 290 MB |

macOS 需要系统自带的 `ditto`、`codesign`、`sips`、`iconutil`（无需额外安装）。Windows 构建依赖仓库内的 `public/windows/*.exe`。

---

## 五、安装

### 5.1 第一步：准备 Electron 运行时（必做）

Electron 的 npm 包只是"壳"，真正的运行时是官方那近 300 MB 的压缩包。它的下载走 GitHub Releases，国内基本拉不动；本仓库又**刻意不把运行时入库**（`.gitignore` 里有 `build-resource`）。所以先手工放一份进去：

```bash
# 以 macOS arm64 + Electron 44.0.0 为例，按你的平台换 URL
curl -L -o /tmp/electron.zip \
  https://registry.npmmirror.com/-/binary/electron/44.0.0/electron-v44.0.0-darwin-arm64.zip

mkdir -p build-resource/electron/dist
ditto -x -k /tmp/electron.zip build-resource/electron/dist
```

> ⚠️ **必须用 `ditto`**（或 Finder 的"归档实用工具"）。用 `unzip` 会丢掉 `Electron.app` 内部大量符号链接与权限，装出来的运行时**启动即静默退出**（退出码 1、零输出），极难排查。

想放到别处也可以，用环境变量指定即可：

```bash
ELVA_ELECTRON_SOURCE=/path/to/electron yarn install
```

### 5.2 第二步：安装依赖

```bash
yarn install
```

安装结束后会自动执行 `scripts/setup-electron.mjs`，它做四件事：把运行时装配进 `node_modules/electron/dist`、做**运行时完整性体检**、清掉 macOS 的 quarantine 属性、必要时做 ad-hoc 重签。看到下面这类输出即为成功：

```
[setup-electron] 源运行时体检通过
[setup-electron] 复制后体检通过
[setup-electron] 装配完成
```

如果它报"运行时尚未装配，且本地资源目录里没有可用的 Electron"，回到 5.1 检查路径。

---

## 六、运行

```bash
# 开发模式：Vite dev server + Electron，改代码热更新
yarn dev

# 生产模式：先构建前端，再用 dist/ 起应用
yarn build
yarn start
```

其他脚本：

| 命令 | 作用 |
| --- | --- |
| `yarn dev` | 开发模式（`vite` + `electron . --dev`，端口固定 5173） |
| `yarn build` | 构建渲染进程到 `dist/` |
| `yarn start` | 用 `dist/` 启动工作台 |
| `yarn dist` | 用 electron-builder 打包**工作台自身**（可选，依赖 `build-resource/electron/dist`） |

> `yarn dev` 的端口是 **strictPort**：5173 被占用时会直接失败，而不会静默换端口——否则 Electron 会连到错误的地址。

---

## 七、使用说明

工作台的完整流程只需三步，全程在图形界面里完成。

**1）新建或导入项目**

- 点「New Project」，选一种模板（原生 HTML / Vue + Vite / Vue CLI / React），再选一个空目录 —— 会生成项目骨架和 `elva.json`；
- 已有项目直接点「Open Project」选目录，或**把文件夹拖进窗口**；
- 目录里没有 `elva.json`（或旧的 `niva.json`）时，工作台会询问是否生成一份。

**2）改配置**

在「Configuration」页签里改。三种视图（可视化表单 / JSON / 分屏）改的是同一份内容，改哪边另一边立刻同步：

| 分组 | 字段 |
| --- | --- |
| 基本信息 | `name`、`uuid`、`icon` |
| 窗口 | `title`、`size`、`minSize`、`resizable`、`decorations`、`devtools`、`alwaysOnTop` |
| 调试 | `debug.entry`（开发时要加载的地址）、`debug.resource`（开发时的资源目录） |
| 构建 | `build.resource`（要打进产物的资源目录） |
| 元信息 | `meta.version / company / description / copyright` |

`elva.json` 示例：

```json
{
  "name": "my-app",
  "uuid": "1f0c9a2e-3b7d-4a55-9c11-2e8f0a6d4b93",
  "icon": "icon.png",
  "window": {
    "title": "My App",
    "size": { "width": 900, "height": 600 },
    "minSize": { "width": 720, "height": 480 },
    "resizable": true,
    "decorations": true,
    "devtools": false
  },
  "debug": { "entry": "http://localhost:5173", "resource": "public" },
  "build": { "resource": "dist" },
  "meta": { "version": "1.0.0", "company": "", "description": "", "copyright": "" }
}
```

`macos` / `windows` 两个字段可做平台差异配置（例如 macOS 透明标题栏、Windows 无边框），完整字段清单见应用内置文档：**状态栏 → 文档**。

**3）调试与构建**

- **Debug**：以项目模式重启自身进程，直接按 `debug.entry` / `debug.resource` 起窗口，等于"用真实运行时预览"（开发服务器要自己先跑起来）；
- **Build**：选一个输出位置，macOS 得到 `.app`、Windows 得到 `.exe`，双击即可运行（macOS 产物会做 ad-hoc 重签，无需开发者证书）。

---

## 八、在应用里调用 API

渲染进程里直接用 `Niva.api.*`（或别名 `Elva.api.*`）：

```js
// 读一段文本、改窗口标题
await Niva.api.clipboard.readText()
await Niva.api.window.setTitle('Hello Elva')

// 建一个窗口
await Niva.api.window.open({
  entry: 'settings.html',
  title: '设置',
  size: { width: 600, height: 400 },
})

// 监听事件（支持 `window.*` 与 `*` 通配）
Niva.addEventListener('window.focused', (event, focused) => {
  console.log(event, focused)
})
```

约定（与原版一致，迁移代码时要注意）：

- 调用报文是 `[callbackId, "namespace.method", argsArray]`；响应是 `[callbackId, code, message, data]`；
- **`code !== 0` 时 reject 的是整个响应数组**，不是 `Error` 对象；
- 事件派发是异步的（`setTimeout 0`），监听器签名是 `(event, data)`；
- 一次派发会按 `event` → `主命名空间.*` → `*` 三个 key 依次通知；
- 关闭 `id === 0` 的窗口 = **退出整个应用**；渲染层要退出时请调用 `window.close()`。

---

## 九、注意事项

1. **首次安装必须自备 Electron 运行时**。`build-resource/` 不入库，直接 `yarn install` 会因为拿不到运行时而失败（在能正常访问 GitHub Releases 的网络下才会自动下载）。见 5.1。
2. **不要用 `unzip` 解压 Electron**，会破坏符号链接，导致启动即静默退出且毫无报错。用 `ditto`。
3. **`public/windows/` 下那两个 exe（合计约 7.4 MB）不要删**，Windows 构建依赖它们；`public/` 是随应用分发的资源目录，删了构建会失败。
4. **跨平台构建有限制**：macOS 产物要在 macOS 上构建（依赖 `ditto`、`codesign`、`iconutil`），Windows 产物要在 Windows 上构建（依赖 exe 工具链）。不支持交叉构建。
5. **产物体积是 Electron 的代价**：`.app` 解压后约 290 MB，因为它包含完整的 Electron 骨架。这是用体积换"零 Rust、零后端"的设计取舍，不是 bug（见 1.2）。
6. **平台行为差异是有意为之**：macOS 保留系统原生红绿灯（系统负责位置与 hover 行为），Windows 无边框自绘最小化/最大化/关闭按钮。
7. **关闭主窗口即退出应用**（沿用 Niva 语义，`id === 0` 的窗口关闭触发退出）。因此主进程里**故意没有**注册 `window-all-closed → app.quit()`；渲染层退出时请走 `window.close()`，不要直接 `app.quit()`，否则会形成关不掉的死循环。
8. **`package.json` 里的 `description` 已过时**：它写着 "Vue 3 + Pinia + Naive UI + Electron"，但实际技术栈是 **Vue 3（Composition API）+ Vite + 手写 CSS**，未使用 Pinia 与 Naive UI（状态管理是自写的 `StateModel`）。建议按实际改掉，以免误导。
9. **与 Niva 的兼容是"能力等价"，不是"逐字节一致"**：命名空间与执行模型对齐，个别 API 在 Electron 上只能降级实现（例如窗口级光标改为渲染进程 CSS 光标），配置或依赖这些细节的旧项目需要实测。
10. **本仓库只包含原工程的 `app/` 目录**：`docs/`、`example/`（上游 Niva 源码）、`tools/` 不在其中。
11. 运行时的完整性体检（`scripts/setup-electron.mjs`）不要关掉。它拦的是"坏资源装出坏运行时"这类事后极难归因的问题。

---

## 十、技术栈

| 层 | 技术 |
| --- | --- |
| 主进程 / 运行时 | Node.js（Electron 内置）+ Electron 44 API |
| 渲染进程 / 界面 | Vue 3（Composition API，`<script setup>`） |
| 构建 | Vite 8（`@vitejs/plugin-vue`），目标 `chrome130` |
| 状态管理 | 自写轻量 `StateModel`（无 Pinia） |
| 样式 | 手写 CSS（`base.css` / `app.css` / `pages.css`） |
| 打包 | 自建构建管线（`src/devtools/build/`）+ electron-builder（可选） |
| 多语言 | 自写词条表（`zh_CN` / `en_US`） |

---

## 十一、致谢与许可证

- API 形态与配置格式对齐 **[Niva](https://github.com/bramblex/niva)**（MIT）——感谢其设计，Elva 的诞生正是为了用 Electron 生态重新支撑这套开发体验。本仓库不含 Niva 的源码。
- 建议本项目采用 **MIT** 许可证（仓库当前尚未放置 `LICENSE` 文件）。
