import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

/**
 * 注入 CSP（只能走 meta 标签：Electron 用 file:// 加载时 HTTP 响应头不生效）。
 * 开发 / 生产两套策略，因为 Vite 的 HMR 需要额外的放行：
 *  - 开发：放行 ws://127.0.0.1:5173（HMR 长连接）与内联样式（Vite 注入 style 标签）
 *  - 生产：收回到只允许本地资源
 * 两边都不给 script-src 加 'unsafe-eval'——Electron 正是靠这一点判定「CSP 是安全」的。
 */
function injectCsp() {
  const devServerUrl = 'http://127.0.0.1:5173'

  /*
   * 应用自己的自定义协议。项目图标是通过 `elva://filesystem/<绝对路径>` 直接喂给
   * `<img src>` 的（见 src/devtools/models/project.js），所以 img-src 必须显式放行
   * 这个 scheme。
   *
   * 注意这里**必须显式写**，不能指望 `'self'`：
   *  - 生产：页面基址就是 `elva://<idName>`，`'self'` 恰好覆盖，看不出问题；
   *  - 开发：页面基址是 http://127.0.0.1:5173，`'self'` 只等于 dev server，
   *    于是 `elva://.../icon.png` 被 CSP 拦掉，表现为**项目图标在 dev 下不显示**，
   *    控制台报 "violates ... img-src 'self' data:"。
   * 两种环境下都显式放行，行为才一致。
   */
  const APP_SCHEME = 'elva:'

  const base = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'", // Naive UI 是 CSS-in-JS，运行时注入 style 标签
    `img-src 'self' data: ${APP_SCHEME}`,
    "font-src 'self' data:",
  ]

  const prodPolicy = [...base, "connect-src 'self'"].join('; ')

  const devPolicy = [
    ...base,
    // HMR 走 websocket，不显式放行会静默失效（页面不报错，但改代码不再热更新）
    `connect-src 'self' ${devServerUrl} ws://127.0.0.1:5173`,
  ].join('; ')

  return {
    name: 'elva-inject-csp',
    transformIndexHtml(html, ctx) {
      const policy = ctx.server ? devPolicy : prodPolicy
      return html.replace(
        '</head>',
        `  <meta http-equiv="Content-Security-Policy" content="${policy}">\n  </head>`,
      )
    },
  }
}

export default defineConfig({
  plugins: [vue(), injectCsp()],

  // Electron 用 file:// 加载 index.html，必须用相对路径，否则 /assets/xxx 会 404
  base: './',

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  server: {
    host: '127.0.0.1',
    port: 5173,
    // 端口被占用时直接失败，而不是静默换端口——否则 Electron 会连到错误的地址
    strictPort: true,
  },

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // 桌面端不需要为老浏览器降级，直接用现代目标
    target: 'chrome130',
  },
})
