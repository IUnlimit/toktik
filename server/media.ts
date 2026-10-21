import type { IncomingMessage, ServerResponse } from 'node:http'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import { mimeForExt } from '../shared/types'
import { covers, library } from './store'
import { driverOf } from './drivers'
import { getSource } from './sources'
import { RangeError_ } from './drivers/types'
import { resolveSession, tokenFromRequest, verifyMediaSignature } from './auth'
import { describeSourceError } from './drivers/errors'
import { fallbackCoverSvg, sniffImageMime } from './cover'
import { secretKey } from './secret'
import { enqueueVariant, resolveVariantFile } from './transcode'
import { ffmpegAvailable } from './meta'

type ParsedRange = { start: number; end: number } | null | 'invalid'

const UNKNOWN_SIZE_CHUNK = 64 * 1024 * 1024 * 1024

function json(res: ServerResponse, status: number, message: string): void {
  const body = JSON.stringify({ code: status, msg: message, data: null })
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  })
  res.end(body)
}

/** 解析单区间 Range；不支持多区间（浏览器播放只会发单区间） */
export function parseRange(header: string | undefined, total: number): ParsedRange {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return 'invalid'
  const [, rawStart, rawEnd] = match
  if (!rawStart && !rawEnd) return 'invalid'

  let start: number
  let end: number
  if (!rawStart) {
    const suffix = Number(rawEnd)
    if (!Number.isFinite(suffix) || suffix <= 0 || total <= 0) return 'invalid'
    start = Math.max(0, total - suffix)
    end = total - 1
  } else {
    start = Number(rawStart)
    if (!rawEnd) {
      if (total <= 0) return 'invalid'
      end = total - 1
    } else {
      end = Number(rawEnd)
    }
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start) return 'invalid'
  if (total > 0) {
    if (start >= total) return 'invalid'
    end = Math.min(end, total - 1)
  }
  return { start, end }
}

async function serveStream(
  req: IncomingMessage,
  res: ServerResponse,
  id: string,
  variant?: string
): Promise<void> {
  const record = await library.get(id)
  if (!record) {
    json(res, 404, '视频不存在')
    return
  }
  let source
  try {
    source = await getSource(record.sourceId)
  } catch {
    json(res, 404, '数据源已被删除')
    return
  }

  // 省流画质：命中转码缓存就直接输出，未命中先回退原片并在后台排队生成
  let variantHeader = ''
  if (variant === 'low') {
    const file = await resolveVariantFile(record)
    if (file) {
      await serveFileRange(req, res, file, 'video/mp4')
      return
    }
    const enabled = await ffmpegAvailable()
    variantHeader = enabled ? 'fallback' : 'unavailable'
    if (enabled) enqueueVariant(record)
  }

  const total = record.size > 0 ? record.size : 0
  const range = parseRange(req.headers.range, total)
  if (range === 'invalid') {
    res.writeHead(416, {
      'Content-Range': `bytes */${total || '*'}`,
      'Cache-Control': 'no-store'
    })
    res.end()
    return
  }

  const start = range ? range.start : 0
  const end = range ? range.end : total > 0 ? total - 1 : start + UNKNOWN_SIZE_CHUNK - 1

  let result
  try {
    result = await driverOf(source).open(record.path, { start, end })
  } catch (err) {
    if (err instanceof RangeError_) {
      res.writeHead(416, { 'Content-Range': `bytes */${total || '*'}` })
      res.end()
      return
    }
    console.warn('[media] 打开视频失败', record.path, err)
    json(res, 502, describeSourceError(source.kind, err))
    return
  }

  const finalTotal = total || result.totalSize || 0
  const finalEnd = finalTotal > 0 ? Math.min(end, finalTotal - 1) : end
  const headers: Record<string, string> = {
    'Content-Type': mimeForExt(record.ext),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=0, must-revalidate',
    'X-Content-Type-Options': 'nosniff'
  }
  if (variantHeader) headers['X-Toktik-Variant'] = variantHeader
  if (range) {
    headers['Content-Range'] = `bytes ${start}-${finalEnd}/${finalTotal || '*'}`
    headers['Content-Length'] = String(result.contentLength)
    res.writeHead(206, headers)
  } else {
    headers['Content-Length'] = String(result.contentLength)
    res.writeHead(200, headers)
  }

  if (req.method === 'HEAD') {
    res.end()
    result.stream.destroy()
    return
  }

  result.stream.on('error', (err) => {
    if (res.headersSent) {
      res.destroy(err as Error)
      return
    }
    json(res, 502, describeSourceError(source.kind, err))
  })
  req.on('close', () => result.stream.destroy())
  result.stream.pipe(res)
}

/** 为服务端生成的文件（省流转码版本）提供 Range / HEAD / ETag 支持 */
async function serveFileRange(
  req: IncomingMessage,
  res: ServerResponse,
  file: string,
  mime: string
): Promise<void> {
  let stat: Awaited<ReturnType<typeof fsp.stat>>
  try {
    stat = await fsp.stat(file)
  } catch {
    json(res, 404, '文件不存在')
    return
  }
  if (!stat.isFile()) {
    json(res, 404, '文件不存在')
    return
  }
  const total = stat.size
  const range = parseRange(req.headers.range, total)
  if (range === 'invalid') {
    res.writeHead(416, { 'Content-Range': `bytes */${total}`, 'Cache-Control': 'no-store' })
    res.end()
    return
  }

  const etag = `"${total.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`
  const headers: Record<string, string> = {
    'Content-Type': mime,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=3600',
    ETag: etag,
    'X-Content-Type-Options': 'nosniff',
    'X-Toktik-Variant': 'low'
  }
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers)
    res.end()
    return
  }

  const start = range ? range.start : 0
  const end = range ? Math.min(range.end, total - 1) : total - 1
  headers['Content-Length'] = String(end - start + 1)
  if (range) headers['Content-Range'] = `bytes ${start}-${end}/${total}`
  res.writeHead(range ? 206 : 200, headers)
  if (req.method === 'HEAD') {
    res.end()
    return
  }

  const stream = fs.createReadStream(file, { start, end })
  stream.on('error', () => res.destroy())
  req.on('close', () => stream.destroy())
  stream.pipe(res)
}

async function serveCover(req: IncomingMessage, res: ServerResponse, id: string): Promise<void> {
  const record = await library.get(id)
  if (!record) {
    json(res, 404, '视频不存在')
    return
  }
  const data = await covers.read(id)
  const isHead = req.method === 'HEAD'
  if (data && data.length) {
    res.writeHead(200, {
      'Content-Type': sniffImageMime(data),
      'Content-Length': String(data.length),
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff'
    })
    if (isHead) res.end()
    else res.end(data)
    return
  }
  const svg = fallbackCoverSvg(record.title, record.id)
  res.writeHead(200, {
    'Content-Type': 'image/svg+xml; charset=utf-8',
    'Content-Length': String(svg.length),
    'Cache-Control': 'private, max-age=120',
    'X-Content-Type-Options': 'nosniff'
  })
  if (isHead) res.end()
  else res.end(svg)
}

/**
 * 处理 /api/media/*。
 * 鉴权：会话 Cookie/Bearer，或 ffmpeg 使用的短时效签名。
 * 返回 true 表示已处理该请求。
 */
export async function handleMedia(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<boolean> {
  const streamMatch = /^\/api\/media\/stream\/([^/]+)$/.exec(url.pathname)
  const coverMatch = /^\/api\/media\/cover\/([^/]+)$/.exec(url.pathname)
  if (!streamMatch && !coverMatch) return false

  const rawId = streamMatch?.[1] ?? coverMatch?.[1] ?? ''
  let id: string
  try {
    id = decodeURIComponent(rawId)
  } catch {
    id = rawId
  }

  const user = await resolveSession(tokenFromRequest(req))
  if (!user) {
    const expires = Number(url.searchParams.get('e') ?? 0)
    const signature = url.searchParams.get('s') ?? ''
    const valid = await verifyMediaSignature(await secretKey(), id, expires, signature)
    if (!valid) {
      json(res, 401, '登录已过期，请重新登录')
      return true
    }
  }

  const variant = url.searchParams.get('variant') || undefined
  try {
    if (coverMatch) await serveCover(req, res, id)
    else await serveStream(req, res, id, variant)
  } catch (err) {
    console.error('[media] 处理失败', url.pathname, err)
    if (!res.headersSent) json(res, 500, '媒体读取失败')
    else res.destroy()
  }
  return true
}
