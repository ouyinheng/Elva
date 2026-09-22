/**
 * Result 类型 —— 语义对齐原版用的 neverthrow（packages/devtools/src/common/result.ts）
 *
 * 原版依赖 neverthrow 的 Result/Option。这里不引第三方库，手写一层等价实现，
 * 把原版代码里实际用到的 API 面（isOk / isErr / value / error / unwrapOr）补全。
 */

import { AppError, ErrorCode } from './error'

class ResultImpl {
  constructor(value, error) {
    this.value = value
    this.error = error
    /** 内部判据：有 error 即失败。Ok(void 0) 的 value 是 undefined，同样走这一条。 */
    this.ok = error === undefined
  }

  isOk() {
    return this.ok
  }

  isErr() {
    return !this.ok
  }

  /** neverthrow 的 unwrap_or：失败时给兜底值 */
  unwrapOr(fallback) {
    return this.ok ? this.value : fallback
  }

  unwrap() {
    if (!this.ok) throw this.error
    return this.value
  }
}

export function Ok(value) {
  return new ResultImpl(value, undefined)
}

export function Err(code, extra) {
  return new ResultImpl(undefined, new AppError(code, extra))
}

export function fromThrowable(fn) {
  try {
    return Ok(fn())
  } catch (error) {
    return Err(ErrorCode.UNKNOWN, { error })
  }
}

export async function fromThrowableAsync(fn) {
  try {
    return Ok(await fn())
  } catch (error) {
    return Err(ErrorCode.UNKNOWN, { error })
  }
}

export { ResultImpl }
