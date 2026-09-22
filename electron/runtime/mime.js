'use strict'

const path = require('node:path')

/**
 * 极简 MIME 推断，替代原版依赖的 mime_guess。
 * 原版在协议处理器里用 mime_guess::from_path(path).first()，
 * 任何未知扩展名回落到 text/plain —— 这一条行为要保留。
 */
const TYPES = {
  '.html': 'text/html',
  '.htm': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.cjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.map': 'application/json',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.xml': 'text/xml',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.wasm': 'application/wasm',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
}

/** 未知扩展名 → text/plain（对齐 mime_guess 的回落行为） */
function guessMime(filePath) {
  return TYPES[path.extname(filePath).toLowerCase()] || 'text/plain'
}

module.exports = { guessMime }
