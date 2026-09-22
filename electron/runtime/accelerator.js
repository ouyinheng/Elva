'use strict'

/**
 * accelerator 归一化：W3C Code / tao 写法 → Electron 能识别的 token。
 *
 * 为什么需要这一层：
 *   原版用 tao 的 `Accelerator::from_str`，它按 **W3C UI Events 的 code 名**解析，
 *   所以 `CommandOrControl+Shift+Backslash`（simple-project 的配置）在 Niva 里是合法的。
 *   而 Electron 的 accelerator 解析器只认单个字符 `\`，收到 `Backslash` 会直接报
 *   "Invalid accelerator token: Backslash"。
 *
 * 不做这一层的话，官方示例的快捷键会在启动时注册失败 —— 这是实测出来的差异。
 */

const MODIFIERS = {
  commandorcontrol: 'CommandOrControl',
  cmdorctrl: 'CommandOrControl',
  command: 'Command',
  cmd: 'Command',
  control: 'Control',
  ctrl: 'Control',
  alt: 'Alt',
  option: 'Alt',
  altgr: 'AltGr',
  shift: 'Shift',
  super: 'Super',
  meta: 'Super',
  win: 'Super',
}

/** W3C code 名 → Electron token（同名可直传的不列） */
const CODE_TO_TOKEN = {
  backslash: '\\',
  slash: '/',
  semicolon: ';',
  comma: ',',
  period: '.',
  quote: "'",
  backquote: '`',
  minus: '-',
  equal: '=',
  bracketleft: '[',
  bracketright: ']',
  enter: 'Return',
  numpadenter: 'Return',
  escape: 'Esc',
  space: 'Space',
  arrowup: 'Up',
  arrowdown: 'Down',
  arrowleft: 'Left',
  arrowright: 'Right',
  nop: '',
}

function normalizeKey(raw) {
  const lower = raw.toLowerCase()

  if (CODE_TO_TOKEN[lower] !== undefined) return CODE_TO_TOKEN[lower]

  // W3C：KeyA / Digit1 / Numpad5
  const letter = /^key([a-z])$/i.exec(raw)
  if (letter) return letter[1].toUpperCase()

  const digit = /^digit([0-9])$/i.exec(raw)
  if (digit) return digit[1]

  const numpad = /^numpad([0-9])$/i.exec(raw)
  if (numpad) return `num${numpad[1]}`

  const numpadOp = {
    numpadadd: 'numadd',
    numpadsubtract: 'numsub',
    numpadmultiply: 'nummult',
    numpaddivide: 'numdiv',
    numpaddecimal: 'numdec',
  }[lower]
  if (numpadOp) return numpadOp

  // 函数键：tao 写 F1，Electron 也是 F1
  if (/^f([1-9]|1[0-9]|2[0-4])$/i.test(raw)) return raw.toUpperCase()

  // 单字符直接原样传（含 `\`、`/`、`|` 等）
  if (raw.length === 1) return raw

  // 其余按名字处理：Home/End/PageUp/PageDown/Insert/Delete/Tab/Backspace/Capslock...
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

/**
 * @param {string} accelerator 原始写法（tao / W3C code / 已可被 Electron 识别的形式）
 * @returns {string} Electron 能注册的 accelerator
 */
function normalizeAccelerator(accelerator) {
  const raw = String(accelerator || '').trim()
  if (!raw) return raw

  // 用 `+` 切分；键名里合法的 `+` 形如 `Plus`，不会被切到
  const parts = raw
    .split('+')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)

  if (parts.length === 0) return raw

  const modifiers = []
  let key = null

  for (const part of parts) {
    const mapped = MODIFIERS[part.toLowerCase()]
    if (mapped) {
      modifiers.push(mapped)
      continue
    }
    // 最后一个非修饰键当作主键
    key = part
  }

  if (key === null) return modifiers.join('+')
  return [...modifiers, normalizeKey(key)].join('+')
}

module.exports = { normalizeAccelerator, normalizeKey }
