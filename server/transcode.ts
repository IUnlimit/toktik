import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { FFMPEG_BIN } from './config'
import { TRANSCODE_DIR } from './store'
import { signedStreamUrl } from './media-url'
import { ffmpegAvailable } from './meta'
import type { VideoRecord } from '../shared/types'

/**
 * 省流画质（low 变体）。
 *
 * 取舍：不做实时转码 —— 实时转码无法可靠支持任意 Range 拖动，CPU 开销也不可控。
 * 这里按需把源视频转码成一份缓存文件（640p、~900kbps、AAC 64k），
 * 未命中缓存时先回退原片并后台排队生成，下次播放即可命中。
 */
export const LOW_PROFILE = {
  maxWidth: 640,
  maxrate: '900k',
  bufsize: '1800k',
  crf: '30',
  audioBitrate: '64k'
}

const JOB_TIMEOUT = 10 * 60 * 1000
const MAX_QUEUE = 500
const FAIL_COOLDOWN = 10 * 60 * 1000

const queue: VideoRecord[] = []
const queuedKeys = new Set<string>()
const failedAt = new Map<string, number>()
const stats = { done: 0, failed: 0 }
let running = false
let currentKey = ''
/** 服务器没有 ffmpeg 时直接停用，避免每次请求都重复探测 */
let disabled = false

export function variantCacheKey(record: VideoRecord): string {
  const raw = `${record.id}|low|${record.size}|${record.mtime}|${record.width}|${record.height}`
  return crypto.createHash('sha1').update(raw).digest('hex')
}

export function variantFilePath(record: VideoRecord): string {
  return path.join(TRANSCODE_DIR, variantCacheKey(record) + '.mp4')
}

/** 已生成的省流文件路径；未生成返回 null */
export async function resolveVariantFile(record: VideoRecord): Promise<string | null> {
  const file = variantFilePath(record)
  try {
    const stat = await fs.stat(file)
    if (stat.isFile() && stat.size > 1024) return file
  } catch {
    /* 未生成 */
  }
  return null
}

function targetWidth(record: VideoRecord): number {
  const raw = Number(record.width) > 0 ? Number(record.width) : LOW_PROFILE.maxWidth
  const width = Math.min(LOW_PROFILE.maxWidth, raw)
  return Math.max(2, width - (width % 2))
}

export function enqueueVariant(record: VideoRecord): void {
  if (disabled) return
  const key = variantCacheKey(record)
  if (key === currentKey || queuedKeys.has(key)) return
  const failed = failedAt.get(key)
  if (failed && Date.now() - failed < FAIL_COOLDOWN) return
  if (queue.length >= MAX_QUEUE) return
  queuedKeys.add(key)
  queue.push(record)
  void pump()
}

async function pump(): Promise<void> {
  if (running) return
  running = true
  try {
    if (!(await ffmpegAvailable())) {
      disabled = true
      queue.length = 0
      queuedKeys.clear()
      return
    }
    while (queue.length) {
      const record = queue.shift()!
      const key = variantCacheKey(record)
      queuedKeys.delete(key)
      try {
        if (await resolveVariantFile(record)) continue
        currentKey = key
        await transcode(record)
        stats.done++
      } catch (err) {
        stats.failed++
        failedAt.set(key, Date.now())
        console.warn('[transcode] 省流版本生成失败', record.path, err)
      } finally {
        currentKey = ''
      }
    }
  } finally {
    running = false
  }
}

async function transcode(record: VideoRecord): Promise<void> {
  const target = variantFilePath(record)
  await fs.mkdir(TRANSCODE_DIR, { recursive: true, mode: 0o700 })
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`
  const url = await signedStreamUrl(record.id)
  const width = targetWidth(record)
  const args = [
    '-v',
    'error',
    '-nostdin',
    '-i',
    url,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-threads',
    '2',
    '-crf',
    LOW_PROFILE.crf,
    '-maxrate',
    width >= LOW_PROFILE.maxWidth ? LOW_PROFILE.maxrate : '600k',
    '-bufsize',
    LOW_PROFILE.bufsize,
    '-vf',
    `scale=${width}:-2`,
    '-c:a',
    'aac',
    '-b:a',
    LOW_PROFILE.audioBitrate,
    '-ac',
    '1',
    '-movflags',
    '+faststart',
    '-f',
    'mp4',
    '-y',
    tmp
  ]
  const code = await runFfmpeg(args, JOB_TIMEOUT)
  if (code !== 0) {
    await fs.unlink(tmp).catch(() => undefined)
    throw new Error(`ffmpeg 退出码 ${code}`)
  }
  await fs.rename(tmp, target)
}

function runFfmpeg(args: string[], timeoutMs: number): Promise<number | null> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(FFMPEG_BIN, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    } catch (err) {
      console.warn('[transcode] 无法启动 ffmpeg', err)
      resolve(null)
      return
    }
    let stderr = ''
    let settled = false
    const finish = (code: number | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(code)
    }
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        /* 忽略 */
      }
      finish(null)
    }, timeoutMs)
    child.stderr?.on('data', (chunk) => {
      if (stderr.length < 8000) stderr += String(chunk)
    })
    child.on('error', (err) => {
      stderr += (err as Error).message
      finish(null)
    })
    child.on('close', (code) => {
      if (code !== 0 && stderr.trim()) {
        console.warn('[transcode]', stderr.trim().split('\n').slice(-3).join(' | '))
      }
      finish(code)
    })
  })
}

export interface VariantStatus {
  /** 服务器是否具备 ffmpeg（没有时省流不可用） */
  enabled: boolean
  running: boolean
  queued: number
  /** 已生成的缓存文件数 */
  files: number
  /** 已生成的缓存占用字节数 */
  bytes: number
  failed: number
}

export async function getVariantStatus(): Promise<VariantStatus> {
  const enabled = await ffmpegAvailable()
  let files = 0
  let bytes = 0
  try {
    const names = await fs.readdir(TRANSCODE_DIR)
    for (const name of names) {
      if (!name.endsWith('.mp4')) continue
      const stat = await fs.stat(path.join(TRANSCODE_DIR, name)).catch(() => null)
      if (stat?.isFile()) {
        files++
        bytes += stat.size
      }
    }
  } catch {
    /* 目录尚未创建 */
  }
  return { enabled, running, queued: queue.length, files, bytes, failed: stats.failed }
}

/** 清空省流缓存（跳过正在写入的文件） */
export async function clearVariants(): Promise<{ files: number; bytes: number }> {
  let files = 0
  let bytes = 0
  const names = await fs.readdir(TRANSCODE_DIR).catch(() => [] as string[])
  for (const name of names) {
    if (!name.endsWith('.mp4')) continue
    if (currentKey && name === currentKey + '.mp4') continue
    const file = path.join(TRANSCODE_DIR, name)
    const stat = await fs.stat(file).catch(() => null)
    if (!stat?.isFile()) continue
    await fs.unlink(file).catch(() => undefined)
    files++
    bytes += stat.size
  }
  failedAt.clear()
  return { files, bytes }
}
