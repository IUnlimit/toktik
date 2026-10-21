import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { FFMPEG_BIN, FFPROBE_BIN } from './config'
import { covers, library } from './store'
import { registerMetaKick } from './scan'
import { signedStreamUrl } from './media-url'
import type { VideoRecord } from '../shared/types'

const CONCURRENCY = 2
const PROBE_TIMEOUT = 20_000
const COVER_TIMEOUT = 25_000
const COVER_WIDTH = 480

export interface MetaStatus {
  running: boolean
  done: number
  total: number
  current: string
  /** 服务器是否具备 ffmpeg / ffprobe（缺失时界面会提示） */
  ffmpeg: boolean
}

const status: MetaStatus = {
  running: false,
  done: 0,
  total: 0,
  current: '',
  ffmpeg: false
}

let workerPromise: Promise<void> | null = null
let cancelled = false
let availability: boolean | null = null

interface RunResult {
  code: number | null
  stdout: string
  stderr: string
}

function run(bin: string, args: string[], timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (err) {
      resolve({ code: null, stdout: '', stderr: String((err as Error)?.message ?? err) })
      return
    }
    const finish = (code: number | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code, stdout, stderr })
    }
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        /* 忽略 */
      }
      finish(null)
    }, timeoutMs)
    child.stdout?.on('data', (chunk) => {
      if (stdout.length < 2_000_000) stdout += String(chunk)
    })
    child.stderr?.on('data', (chunk) => {
      if (stderr.length < 64_000) stderr += String(chunk)
    })
    child.on('error', (err) => {
      stderr += (err as Error).message
      finish(null)
    })
    child.on('close', (code) => finish(code))
  })
}

/** 检测服务器上的 ffmpeg / ffprobe；结果缓存到进程生命周期 */
export async function ffmpegAvailable(): Promise<boolean> {
  if (availability !== null) return availability
  const [probe, encode] = await Promise.all([
    run(FFPROBE_BIN, ['-version'], 5000),
    run(FFMPEG_BIN, ['-version'], 5000)
  ])
  availability = probe.code === 0 && encode.code === 0
  status.ffmpeg = availability
  if (!availability) {
    console.warn(
      '[meta] 未找到 ffmpeg/ffprobe，视频时长与封面将使用兜底方案；安装后重启服务即可启用刮削'
    )
  }
  return availability
}

export function getMetaStatus(): MetaStatus {
  return { ...status, ffmpeg: availability ?? status.ffmpeg }
}

export function cancelMeta(): void {
  cancelled = true
}

interface ProbeInfo {
  durationMs: number
  width: number
  height: number
}

async function probe(url: string): Promise<ProbeInfo> {
  const result = await run(
    FFPROBE_BIN,
    [
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      '-i',
      url
    ],
    PROBE_TIMEOUT
  )
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || 'ffprobe 读取失败')
  }
  let parsed: any
  try {
    parsed = JSON.parse(result.stdout)
  } catch {
    throw new Error('ffprobe 输出无法解析')
  }
  const video = (parsed.streams ?? []).find((stream: any) => stream.codec_type === 'video')
  const duration = Number(parsed.format?.duration ?? video?.duration ?? 0)
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('无法读取视频时长')
  return {
    durationMs: Math.round(duration * 1000),
    width: Number(video?.width ?? 0),
    height: Number(video?.height ?? 0)
  }
}

async function grabCover(url: string, durationMs: number): Promise<Buffer | null> {
  const durationSec = durationMs / 1000
  const at = Math.min(Math.max(durationSec * 0.15, 0.4), 5, Math.max(durationSec - 0.5, 0.1))
  const key = crypto.randomBytes(6).toString('hex')
  const attempts = [
    { file: path.join(os.tmpdir(), `toktik-cover-${key}.webp`), args: ['-f', 'webp'] },
    { file: path.join(os.tmpdir(), `toktik-cover-${key}.jpg`), args: ['-f', 'image2'] }
  ]
  for (const attempt of attempts) {
    await run(
      FFMPEG_BIN,
      [
        '-v',
        'error',
        '-ss',
        String(at),
        '-i',
        url,
        '-frames:v',
        '1',
        '-vf',
        `scale=${COVER_WIDTH}:-2`,
        ...attempt.args,
        '-y',
        attempt.file
      ],
      COVER_TIMEOUT
    )
    try {
      const data = await fs.readFile(attempt.file)
      await fs.unlink(attempt.file).catch(() => undefined)
      if (data.length) return data
    } catch {
      /* 该格式输出失败，尝试下一种 */
    }
  }
  return null
}

async function processOne(record: VideoRecord): Promise<void> {
  status.current = record.title
  try {
    const url = await signedStreamUrl(record.id)
    const info = await probe(url)
    await library.update(record.id, {
      durationMs: info.durationMs,
      width: info.width,
      height: info.height,
      metaStatus: 'done'
    })
    const cover = await grabCover(url, info.durationMs)
    if (cover) {
      await covers.write(record.id, cover)
      await library.update(record.id, { coverAt: Date.now() })
    }
  } catch (err) {
    console.warn('[meta] 刮削失败', record.path, err)
    await library.update(record.id, { metaStatus: 'failed' })
  }
}

async function runQueue(): Promise<void> {
  cancelled = false
  status.running = true
  status.done = 0
  status.current = ''

  try {
    if (!(await ffmpegAvailable())) {
      // 没有 ffmpeg 时不要无限重试：统一标记失败，封面走兜底 SVG
      const pending = (await library.all()).filter((record) => record.metaStatus === 'pending')
      await library.bulkUpdate(pending.map((record) => record.id), { metaStatus: 'failed' })
      status.total = 0
      return
    }
    status.total = (await library.all()).filter((record) => record.metaStatus === 'pending').length
    if (!status.total) return

    for (;;) {
      if (cancelled) break
      const batch = (await library.all())
        .filter((record) => record.metaStatus === 'pending')
        .slice(0, CONCURRENCY)
      if (!batch.length) break
      await Promise.all(
        batch.map(async (record) => {
          await processOne(record)
          status.done++
        })
      )
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  } finally {
    status.running = false
    status.current = ''
  }
}

export function kickMeta(): void {
  if (workerPromise) return
  workerPromise = runQueue().finally(() => {
    workerPromise = null
  })
}

registerMetaKick(kickMeta)

/** 手动重新刮削单条 */
export async function reprocessVideo(id: string): Promise<void> {
  const record = await library.get(id)
  if (!record) return
  await covers.remove([id])
  await library.update(id, { metaStatus: 'pending', durationMs: 0, coverAt: undefined })
  kickMeta()
}

/** 重新刮削全部：清空时长与封面后排队 */
export async function reprocessAll(): Promise<number> {
  const all = await library.all()
  await covers.clear()
  await library.bulkUpdate(
    all.map((record) => record.id),
    { metaStatus: 'pending', durationMs: 0, coverAt: undefined }
  )
  kickMeta()
  return all.length
}

/** 启动时补跑上次未完成的刮削队列 */
export async function resumeMeta(): Promise<void> {
  const pending = (await library.all()).filter((record) => record.metaStatus === 'pending')
  if (pending.length) kickMeta()
}
