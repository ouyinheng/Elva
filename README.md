# Elva

用前端技术写桌面应用。写 HTML/CSS/JS，或者 Vue、React，Elva 负责把它变成能双击运行的 macOS / Windows 应用，再把窗口、托盘、菜单、剪贴板、文件、全局快捷键这些系统能力以 JS API 的形式交给页面。

仓库里是两层东西：

- `electron/` 是运行时。自定义协议 `elva://`、窗口和菜单托盘的调度、事件总线、IPC 协议，以及 14 个命名空间、133 个方法的 JS API 都在这里。
- `src/` 是开发者工具，也就是工作台。新建、导入、改配置、调试、构建，图形界面里点完，不用敲命令。

## 和 Niva 的关系

API 形态和配置格式是对着 [Niva](https://github.com/bramblex/niva) 做的（Rust + tao/wry，MIT，2023 年之后没再更新）。配置文件优先读 `elva.json`，也认旧的 `niva.json`；渲染进程里 `window.Niva` 和 `window.Elva` 是同一个运行时，所以没动过的 Niva 项目丢进来能直接跑。

实现上不一样：Niva 是 Rust 加系统 WebView，Elva 是 Electron。代价很直白，`.app` 解压出来 290MB 上下，跟 Niva 那 3MB 不是一个量级。换来的是不用写 Rust，也不用自己搭后端。想要小体积就直接用 Niva 或 Tauri。

## 环境要求

- Node.js 20.19 以上（Vite 8 的门槛），建议 22 LTS。Electron 主进程用的是自带的 Node，跟系统这份无关
- yarn 1.x，仓库里有 `yarn.lock`
- Electron 运行时 44.x，约 290MB，不进仓库，需要自己准备，见下面
- 磁盘留 1GB 左右：`node_modules` 约 570MB，运行时约 290MB

## 安装

Electron 那个 npm 包只是一层壳，真正的运行时是官方近 300MB 的压缩包，走 GitHub Releases，国内基本拉不动。所以运行时没入库（`.gitignore` 里有 `build-resource`），先自己放一份：

```bash
# 按自己的平台换 URL，这里以 macOS arm64 为例
curl -L -o /tmp/electron.zip \
  https://registry.npmmirror.com/-/binary/electron/44.0.0/electron-v44.0.0-darwin-arm64.zip

mkdir -p build-resource/electron/dist
ditto -x -k /tmp/electron.zip build-resource/electron/dist
```

解压一定用 `ditto`。`unzip` 会丢掉 `Electron.app` 内部的符号链接，装出来的运行时启动时静默退出，退出码 1，零输出，事后很难归因。

运行时想放别处也行：

```bash
ELVA_ELECTRON_SOURCE=/path/to/electron yarn install
```

然后装依赖：

```bash
yarn install
```

装完会自动跑 `scripts/setup-electron.mjs`：把运行时装配进 `node_modules/electron/dist`，检查运行时是否完整，清掉 macOS 的 quarantine 属性，签名不自洽时做一次 ad-hoc 重签。正常输出是这样：

```
[setup-electron] 源运行时体检通过
[setup-electron] 复制后体检通过
[setup-electron] 装配完成
```

如果它说找不到可用的 Electron，就是上面那一步没做对。

## 运行

```bash
yarn dev     # Vite 加 Electron，改代码热更新
yarn build   # 构建渲染进程到 dist/
yarn start   # 用 dist/ 起工作台
yarn dist    # 用 electron-builder 打包工作台自己，可选
```

`yarn dev` 的端口固定 5173，被占用会直接失败，不会静默换端口。不这么做的话 Electron 会连到错的地址上去。

## 用法

新建项目点 New Project，选模板（原生 HTML、Vue + Vite、Vue CLI、React），再选个空目录，会生成项目骨架和 `elva.json`。

导入项目点 Open Project 选目录，或者把文件夹直接拖进窗口。目录里没有配置文件时会问要不要生成一份。

配置在 Configuration 页签。可视化表单和 JSON 编辑器读写的是同一份内容，切到分屏视图就能看到表单改动对应的 JSON：

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
  "meta": { "version": "1.0.0" }
}
```

字段全表在应用自带的文档里，状态栏点「文档」打开。

调试点 Debug，它会以项目模式重启自己，按 `debug.entry` 和 `debug.resource` 起窗口。前端 dev server 要自己先跑起来。

构建点 Build，选个输出位置。macOS 出 `.app`，Windows 出 `.exe`，双击就能运行。macOS 产物会做 ad-hoc 重签，不需要开发者证书。

## 快捷键

| 键 | 作用 |
| --- | --- |
| `⌘/Ctrl + F` | 聚焦搜索框 |
| `⌘/Ctrl + N` | 新建项目 |
| `⌘/Ctrl + O` | 打开项目 |
| `⌘/Ctrl + D` | 调试当前项目 |
| `⌘/Ctrl + B` | 构建当前项目 |
| `⌘/Ctrl + 1 / 2` | 切「信息 / 配置」页签 |
| `↑` `↓` | 项目列表里移动选择 |
| `Esc` | 清空搜索，或关掉弹窗 |

`⌘/Ctrl + R`、`W`、`Q` 故意没占用，留给系统。

## API

渲染进程里直接用：

```js
await Niva.api.window.setTitle('Hello Elva')
await Niva.api.clipboard.readText()

Niva.addEventListener('window.focused', (event, focused) => {
  console.log(event, focused)
})
```

有几个地方跟浏览器习惯不一样，写代码时注意：

- 请求报文是 `[callbackId, "namespace.method", argsArray]`，响应是 `[callbackId, code, message, data]`
- `code !== 0` 时 reject 出来的是整个响应数组，不是 `Error` 对象
- 事件是异步派发的，回调签名 `(event, data)`
- 一次派发会依次通知三个 key：`event`、`主命名空间.*`、`*`
- 关掉 `id === 0` 的窗口等于退出整个应用

## 平台差异

macOS 上标题栏用系统原生的红绿灯按钮，位置和 hover 行为都交给系统；Windows 没有原生按钮，所以无边框加自绘。这两个是故意不一样的。

## 目录

```
electron/
  main.js            工作台入口
  packaged-main.js   打包产物的入口
  preload.js         注入 Niva 运行时，白名单 IPC，文件拖放
  runtime/           上下文、窗口、菜单、托盘、快捷键、事件、elva:// 协议
    api/             14 个命名空间
src/
  main.js            渲染进程入口
  App.vue            标题栏、内容区、状态栏
  components/devtools/   界面组件
  devtools/
    models/          状态模型
    build/           构建管线，资源打包与 mac / win 两套产物
    composables/     快捷键、文件拖放
    templates.js     新建项目的模板
    i18n.js          中英词条
  assets/devtools/   样式、图标、字体
public/
  elva-docs.html     应用内置文档
  windows/           Windows 构建用的两个 exe
scripts/
  setup-electron.mjs 离线装配 Electron 运行时
```

## 一些坑

`public/windows/` 里那两个 exe 加起来 7.4MB，别删，Windows 构建依赖它们做 PNG 转 ICO 和写入图标版本信息。

不能交叉构建。macOS 产物只能在 macOS 上出，要 `ditto`、`codesign`、`iconutil`；Windows 产物只能在 Windows 上出。

主进程里没有 `window-all-closed → app.quit()`，这是照着 Niva 的语义做的：关掉 `id === 0` 的窗口才退出应用。渲染层要退出请调 `window.close()`，直接 `app.quit()` 会变成关不掉的死循环。

`scripts/setup-electron.mjs` 里的运行时体检别关。它拦的是坏资源装出坏运行时那类问题，事后再查成本很高。

## License

MIT
