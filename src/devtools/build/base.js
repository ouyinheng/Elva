/**
 * 资源打包 —— 对齐原版 packages/devtools/src/build-scripts/base.ts
 *
 * 产物格式完全一致：
 *   RESOURCE_INDEXES = { "<相对路径>": [offset, length] }
 *   RESOURCE_DATA    = deflateRaw(拼接后的全部文件字节) 的 base64
 * 这两个 key 也是原版运行时读资源的入口，名字不能改。
 *
 * pako 的替代：原版用 pako.deflateRaw()，elva 改用浏览器原生的
 * CompressionStream('deflate-raw')（Chromium 108+ 支持，Electron 44 可用），
 * 产出同样的 raw deflate 字节流，不引第三方库。
 */

import { pathJoin } from '../utils'

const { fs } = Niva.api

export const indexesKey = 'RESOURCE_INDEXES'
export const dataKey = 'RESOURCE_DATA'

/**
 * 递归收集资源目录下的全部文件。
 * 注意原版用的是 fs.readDirAll —— 它返回的是**递归展开的绝对路径**，
 * 所以这里直接把返回项当路径用（与原版一致，不做二次拼接）。
 */
export async function packageResource(
  projectResourcePath,
  fileIndex = {},
  buffer = new ArrayBuffer(0),
) {
  for (const name of await fs.readDirAll(projectResourcePath)) {
    const filePath = pathJoin(projectResourcePath, name)
    const fileKey = name.replace(/\\/g, '/')
    const [newFileIndex, newBuffer] = await appendResource(
      filePath,
      fileKey,
      fileIndex,
      buffer,
    )
    buffer = newBuffer
    fileIndex = newFileIndex
  }
  return [fileIndex, buffer]
}

export async function appendResource(
  filePath,
  fileKey,
  fileIndex = {},
  buffer = new ArrayBuffer(0),
) {
  const fileBuffer = base64ToArrayBuffer(await fs.read(filePath, 'base64'))
  return [
    {
      ...fileIndex,
      [fileKey]: [buffer.byteLength, fileBuffer.byteLength],
    },
    concatArrayBuffers(buffer, fileBuffer),
  ]
}

export function base64ToArrayBuffer(base64) {
  const binary_string = window.atob(base64)
  const len = binary_string.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i)
  }
  return bytes.buffer
}

export function arrayBufferToBase64(buffer) {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const len = bytes.byteLength
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return window.btoa(binary)
}

export function concatArrayBuffers(buffer1, buffer2) {
  const newBuffer = new ArrayBuffer(buffer1.byteLength + buffer2.byteLength)
  new Uint8Array(newBuffer, 0, buffer1.byteLength).set(new Uint8Array(buffer1))
  new Uint8Array(newBuffer, buffer1.byteLength, buffer2.byteLength).set(
    new Uint8Array(buffer2),
  )
  return newBuffer
}

/** pako.deflateRaw(buffer).buffer 的等价实现 */
export async function deflateRaw(buffer) {
  const stream = new Blob([buffer])
    .stream()
    .pipeThrough(new CompressionStream('deflate-raw'))
  return await new Response(stream).arrayBuffer()
}
