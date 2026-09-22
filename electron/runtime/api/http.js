'use strict'

const { net, session } = require('electron')

const { arg, optional } = require('./helpers')

/**
 * http 命名空间 —— 3 个方法，对齐 crates/niva/src/app/api/http.rs
 *
 * 必须保留的行为：
 *   - 统一返回 `{status, headers, body}`，其中 **body 是字符串**（原版 ureq::into_string）
 *   - `request` 支持**单请求级 proxy**（原版给这一个请求单独建 ureq Agent）
 *   - get/post 没有 proxy 参数
 *
 * Electron 侧用 net.request 走 Chromium 网络栈；单请求代理靠一个临时 session 承载，
 * 这样不会污染其它请求 —— 与原版「每次调用单独建 agent」的隔离语义等价。
 */

const proxySessions = new Map()

async function sessionForProxy(proxy) {
  if (proxySessions.has(proxy)) return proxySessions.get(proxy)

  const partition = `elva-proxy-${Buffer.from(proxy).toString('hex').slice(0, 32)}`
  const proxySession = session.fromPartition(partition)
  await proxySession.setProxy({ proxyRules: proxy })
  proxySessions.set(proxy, proxySession)
  return proxySession
}

function request(options) {
  return new Promise((resolve, reject) => {
    const start = async () => {
      const requestOptions = {
        method: options.method,
        url: options.url,
        headers: options.headers || {},
      }
      if (options.proxy) {
        requestOptions.session = await sessionForProxy(options.proxy)
      }

      const clientRequest = net.request(requestOptions)

      clientRequest.on('response', (response) => {
        const chunks = []
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('end', () => {
          const headers = {}
          for (const [name, values] of Object.entries(response.headers)) {
            headers[name] = Array.isArray(values) ? values.join(', ') : String(values)
          }
          resolve({
            status: response.statusCode,
            headers,
            body: Buffer.concat(chunks).toString('utf8'),
          })
        })
        response.on('error', reject)
      })

      clientRequest.on('error', reject)

      if (options.body !== undefined && options.body !== null) {
        clientRequest.write(String(options.body))
      }
      clientRequest.end()
    }

    start().catch(reject)
  })
}

function register(api) {
  api.registerAsync('http.request', ({ args }) => {
    const options = arg(args, 0) || {}
    return request({
      method: options.method,
      url: options.url,
      headers: options.headers,
      body: options.body,
      proxy: options.proxy,
    })
  })

  api.registerAsync('http.get', ({ args }) =>
    request({ method: 'GET', url: String(arg(args, 0)), headers: optional(args, 1) || undefined }),
  )

  api.registerAsync('http.post', ({ args }) =>
    request({
      method: 'POST',
      url: String(arg(args, 0)),
      body: String(arg(args, 1) ?? ''),
      headers: optional(args, 2) || undefined,
    }),
  )
}

module.exports = { register }
