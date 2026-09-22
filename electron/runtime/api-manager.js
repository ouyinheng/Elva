'use strict'

const { sendIpcCallback } = require('./events')

/**
 * API 注册表与三类执行模型 —— 对齐 crates/niva/src/app/api_manager/mod.rs
 *
 * 原版把 136 个 API 分成三类，这不是实现细节，而是决定时序的行为特征：
 *   register_api        (93 个) 调用线程同步执行
 *   register_async_api  (22 个) 线程池执行，并发上限 options.workers（默认 4）
 *   register_event_api  (21 个) 抛回主事件循环
 *
 * 对应到 Electron：
 *   sync  → 直接执行
 *   async → setImmediate + 自建并发闸（保序 + 限流）
 *   event → setImmediate（回到主循环）
 *
 * 响应包结构逐字对齐 ApiResponse(u8, Code, String, Value)：
 *   [callbackId, 0,  "ok",  data]      成功
 *   [callbackId, -1, "原因", null]     失败
 */

const KIND_SYNC = 'api'
const KIND_ASYNC = 'async_api'
const KIND_EVENT = 'event_api'

/** 对齐 utils.rs / api_manager：默认 4 个工作线程 */
class ConcurrencyPool {
  constructor(size) {
    this.size = Math.max(1, Number(size) || 4)
    this.running = 0
    this.queue = []
  }

  run(task) {
    this.queue.push(task)
    this._drain()
  }

  _drain() {
    while (this.running < this.size && this.queue.length > 0) {
      const task = this.queue.shift()
      this.running += 1
      Promise.resolve()
        .then(task)
        .catch(() => {})
        .finally(() => {
          this.running -= 1
          this._drain()
        })
    }
  }
}

class ApiManager {
  constructor(ctx, deps) {
    this.ctx = ctx
    /** { windows, emit } —— 由 runtime/index.js 注入，避免循环依赖 */
    this.deps = deps
    /** @type {Map<string, {kind:string, fn:Function}>} */
    this.registry = new Map()
    this.pool = new ConcurrencyPool(ctx.workers)
  }

  register(name, fn) {
    this.registry.set(name, { kind: KIND_SYNC, fn })
  }

  registerAsync(name, fn) {
    this.registry.set(name, { kind: KIND_ASYNC, fn })
  }

  registerEvent(name, fn) {
    this.registry.set(name, { kind: KIND_EVENT, fn })
  }

  /** 对齐 ApiRequest::ok */
  static ok(callbackId, data) {
    return [callbackId, 0, 'ok', data === undefined ? null : data]
  }

  /** 对齐 ApiRequest::err */
  static err(callbackId, message) {
    return [callbackId, -1, String(message), null]
  }

  /**
   * 对齐 ApiManager::call
   * @param {object} nivaWindow 发起调用的窗口
   * @param {string} requestStr `[callbackId, "ns.method", argsArray]`
   */
  call(nivaWindow, requestStr) {
    let request
    try {
      request = JSON.parse(requestStr)
    } catch (error) {
      throw new Error(`请求解析失败: ${error.message}`)
    }

    if (!Array.isArray(request) || request.length < 2) {
      throw new Error('请求格式非法：应为 [callbackId, method, args]')
    }

    const callbackId = request[0]
    const method = request[1]
    const args = Array.isArray(request[2]) ? request[2] : []

    const entry = this.registry.get(method)
    if (!entry) {
      // 对齐 call() 的 else 分支：respond "api not found" 并把错误抛给上层
      sendIpcCallback(nivaWindow, ApiManager.err(callbackId, 'api not found'))
      throw new Error('api not found')
    }

    const respond = (response) => {
      try {
        sendIpcCallback(nivaWindow, response)
      } catch {
        /* 窗口已销毁，忽略 */
      }
    }

    const invoke = () => {
      let result
      try {
        result = entry.fn({ window: nivaWindow, args, ctx: this.ctx, deps: this.deps })
      } catch (error) {
        respond(ApiManager.err(callbackId, error && error.message ? error.message : String(error)))
        return
      }

      // 部分 API（dialog / http）在 Electron 侧天然异步，统一支持 thenable
      if (result && typeof result.then === 'function') {
        result.then(
          (data) => respond(ApiManager.ok(callbackId, data)),
          (error) => respond(ApiManager.err(callbackId, error && error.message ? error.message : String(error))),
        )
        return
      }

      respond(ApiManager.ok(callbackId, result))
    }

    if (entry.kind === KIND_EVENT) {
      setImmediate(invoke)
    } else if (entry.kind === KIND_ASYNC) {
      this.pool.run(invoke)
    } else {
      invoke()
    }
  }
}

module.exports = { ApiManager, ConcurrencyPool, KIND_SYNC, KIND_ASYNC, KIND_EVENT }
