/**
 * 错误码与错误对象 —— 对齐原版 packages/devtools/src/common/error.ts
 *
 * ErrorCode 是 Rust 风格的「无显式值」枚举，序号即值。
 * 这里用对象字面量手写序号，保证与声明顺序完全一致。
 */

export const ErrorCode = {
  UNKNOWN: 0,

  PROJECT_PATH_NOT_EXISTS: 1,
  PROJECT_PATH_IS_NOT_DIR: 2,
  PROJECT_CONFIG_NOT_EXISTS: 3,
  PROJECT_CONFIG_CRATE_FAILED: 4,
  PROJECT_CREATE_FAILED: 5,

  PROJECT_LOAD_CONFIG_FAILED: 6,
  PROJECT_CONFIG_VALIDATE_FAILED: 7,
  PROJECT_HAS_UNSAVED_CHANGE: 8,

  SAVE_CONFIG_FAILED: 9,
  SAVE_CONFIG_VALIDATE_FAILED: 10,

  APP_EXIT_PREVENTED_BY_DIALOG: 11,
}

/** 序号 → 名字，用于拼出与原版一致的错误文案 */
const CODE_NAMES = Object.fromEntries(
  Object.entries(ErrorCode).map(([name, code]) => [code, name]),
)

export class AppError extends Error {
  constructor(code, extra) {
    super(`[${CODE_NAMES[code]}] code: ${code}, extra: ${JSON.stringify(extra)}`)
    this.name = 'AppError'
    this.code = code
    this.extra = extra
  }

  /**
   * 原版这里留了 @TODO「补全本地化逻辑」，直接返回 message。
   * 保留同样的行为，避免界面文案与原版出现无意义的差异。
   */
  toLocaleMessage(_app) {
    return this.message
  }
}
