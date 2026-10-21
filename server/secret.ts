import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { DATA_DIR } from './config'
import { ensureDataDirs } from './store'

const KEY_FILE = path.join(DATA_DIR, 'secret.key')

let cached: Buffer | null = null
let pending: Promise<Buffer> | null = null

async function loadKey(): Promise<Buffer> {
  await ensureDataDirs()
  try {
    const raw = await fs.readFile(KEY_FILE)
    if (raw.length >= 32) return raw
  } catch {
    /* 首次启动 */
  }
  const key = crypto.randomBytes(32)
  await fs.writeFile(KEY_FILE, key, { mode: 0o600 })
  return key
}

/**
 * 媒体签名密钥：首次启动时生成并持久化，用于服务端 ffmpeg 读取自身流。
 * 并发调用共享同一次初始化，避免多个刮削 worker 各自生成密钥后签名互相失效。
 */
export function secretKey(): Promise<Buffer> {
  if (cached) return Promise.resolve(cached)
  if (!pending) {
    pending = loadKey().then(
      (key) => {
        cached = key
        pending = null
        return key
      },
      (err) => {
        pending = null
        throw err
      }
    )
  }
  return pending
}
