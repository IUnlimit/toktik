import { Readable, Transform } from 'node:stream'
import type { DirEntry, Source, WebdavConfig } from '../../shared/types'
import { joinPath, normalizePath } from '../../shared/types'
import type { ByteRange, OpenResult, SourceDriver } from './types'
import { RangeError_ } from './types'

const PROPFIND_BODY = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:resourcetype/><d:getcontentlength/><d:getlastmodified/><d:displayname/>
  </d:prop>
</d:propfind>`

/** 不依赖命名空间前缀的标签匹配（服务器可能返回 <D:collection/> 或 <lp1:collection>） */
const XML_PREFIX = '(?:[A-Za-z_][\\w.-]*:)?'

function authHeader(cfg: WebdavConfig): Record<string, string> {
  if (!cfg.username) return {}
  const raw = `${cfg.username}:${cfg.password ?? ''}`
  return { Authorization: 'Basic ' + Buffer.from(raw, 'utf8').toString('base64') }
}

function encodePath(p: string): string {
  return p
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

function joinUrl(base: string, remotePath: string): string {
  return base.replace(/\/+$/, '') + encodePath(normalizePath(remotePath))
}

/** 从 href 中取出解码后的路径（支持绝对 URL、绝对路径与相对引用） */
function hrefPathOf(rawHref: string, baseUrl = ''): string {
  let p = String(rawHref || '').trim()
  if (!p) return ''
  if (/^[a-z][a-z0-9+.-]*:/i.test(p)) {
    try {
      p = new URL(p).pathname
    } catch {
      /* 保留原样 */
    }
  } else if (!p.startsWith('/') && baseUrl) {
    try {
      p = new URL(p, baseUrl).pathname
    } catch {
      /* 保留原样 */
    }
  }
  try {
    p = decodeURIComponent(p)
  } catch {
    /* 保留原样 */
  }
  return p.replace(/\/+$/, '')
}

interface ParsedEntry {
  name: string
  /** 相对本次 PROPFIND 路径的层级路径 */
  rel: string
  isDir: boolean
  size: number
  mtime: number
}

/** 解析 WebDAV multistatus 响应；basePath 为本次 PROPFIND 的远端绝对路径 */
function parseMultistatus(xml: string, basePath: string): ParsedEntry[] {
  const baseDecoded = decodeURIComponent(normalizePath(basePath)).replace(/\/+$/, '') || '/'
  const responseRe = new RegExp(`<${XML_PREFIX}response\\b[\\s\\S]*?</${XML_PREFIX}response>`, 'gi')
  const hrefRe = new RegExp(`<${XML_PREFIX}href\\b[^>]*>([^<]*)</${XML_PREFIX}href>`, 'i')
  const dirRe = new RegExp(`<${XML_PREFIX}collection(?:\\s[^>]*)?/?>`, 'i')
  const sizeRe = new RegExp(`<${XML_PREFIX}getcontentlength>(\\d+)<`, 'i')
  const mtimeRe = new RegExp(`<${XML_PREFIX}getlastmodified>([^<]+)<`, 'i')

  const out: ParsedEntry[] = []
  for (const block of xml.match(responseRe) ?? []) {
    const href = hrefRe.exec(block)?.[1]
    if (!href) continue
    const hrefPath = hrefPathOf(href, `http://dav.local${encodePath(baseDecoded)}/`)
    if (!hrefPath) continue
    // 排除 PROPFIND 返回的当前目录自身
    if (hrefPath === baseDecoded) continue

    let rel: string
    if (baseDecoded === '/') {
      rel = hrefPath.replace(/^\/+/, '')
    } else if (hrefPath.startsWith(baseDecoded + '/')) {
      rel = hrefPath.slice(baseDecoded.length + 1)
    } else if (!hrefPath.startsWith('/')) {
      rel = hrefPath.replace(/^\/+/, '')
    } else {
      continue
    }
    if (!rel) continue
    const name = rel.slice(rel.lastIndexOf('/') + 1)
    if (!name) continue

    const isDir = dirRe.test(block) || /\/\s*$/.test(href)
    const size = Number(sizeRe.exec(block)?.[1] ?? 0)
    const mtimeRaw = mtimeRe.exec(block)?.[1]
    const mtime = mtimeRaw ? Date.parse(mtimeRaw) : 0
    out.push({ name, rel, isDir, size, mtime: Number.isFinite(mtime) ? mtime : 0 })
  }
  return out
}

/** 服务器忽略 Range 时，在本地丢弃前 skip 字节并只保留 take 字节 */
function sliceStream(source: Readable, skip: number, take: number): Readable {
  let skipped = 0
  let sent = 0
  const slicer = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      let data = chunk
      if (skipped < skip) {
        const room = skip - skipped
        if (data.length <= room) {
          skipped += data.length
          callback()
          return
        }
        skipped = skip
        data = data.subarray(room)
      }
      if (sent >= take) {
        callback()
        return
      }
      const room = take - sent
      const out = data.length <= room ? data : data.subarray(0, room)
      sent += out.length
      if (sent >= take) {
        this.push(out)
        this.push(null)
        source.destroy()
        callback()
        return
      }
      callback(null, out)
    }
  })
  return source.pipe(slicer)
}

async function propfind(
  cfg: WebdavConfig,
  url: string
): Promise<{ status: number; xml: string }> {
  const res = await fetch(url, {
    method: 'PROPFIND',
    headers: {
      Depth: '1',
      'Content-Type': 'application/xml; charset=utf-8',
      'User-Agent': 'TokTik/0.2',
      ...authHeader(cfg)
    },
    body: PROPFIND_BODY
  })
  const xml = await res.text()
  return { status: res.status, xml }
}

export function createWebdavDriver(source: Source): SourceDriver {
  const cfg = source.config as WebdavConfig
  const baseUrl = String(cfg?.baseUrl ?? '').trim()
  if (!baseUrl) throw new Error('WebDAV 数据源缺少服务器地址')
  const root = normalizePath(source.rootPath || '/')

  function fullPath(relPath: string): string {
    const rel = normalizePath(relPath)
    if (root === '/') return rel
    return rel === '/' ? root : root + rel
  }

  return {
    kind: 'webdav',

    async list(relPath: string): Promise<DirEntry[]> {
      const remote = fullPath(relPath)
      const { status, xml } = await propfind(cfg, joinUrl(baseUrl, remote))
      if (status === 401) throw new Error('WebDAV 认证失败（HTTP 401）')
      if (status === 404) throw new Error('WebDAV 路径不存在（HTTP 404）')
      if (status !== 207 && (status < 200 || status >= 300)) {
        throw new Error(`WebDAV 请求失败（HTTP ${status}）`)
      }
      return parseMultistatus(xml, remote).map((entry) => ({
        name: entry.name,
        path: joinPath(relPath, entry.rel),
        isDir: entry.isDir,
        size: entry.size,
        mtime: entry.mtime
      }))
    },

    async open(relPath: string, range: ByteRange): Promise<OpenResult> {
      const remote = fullPath(relPath)
      const res = await fetch(joinUrl(baseUrl, remote), {
        headers: {
          'User-Agent': 'TokTik/0.2',
          Range: `bytes=${range.start}-${range.end}`,
          ...authHeader(cfg)
        }
      })
      if (res.status === 401) throw new Error('WebDAV 认证失败（HTTP 401）')
      if (res.status === 416) throw new RangeError_()
      if (!res.ok) throw new Error(`WebDAV 请求失败（HTTP ${res.status}）`)
      if (!res.body) throw new Error('WebDAV 响应没有内容')

      const contentRange = res.headers.get('content-range') ?? ''
      const totalMatch = /bytes\s+\d+-\d+\/(\d+|\*)/i.exec(contentRange)
      const totalSize = totalMatch && totalMatch[1] !== '*' ? Number(totalMatch[1]) : undefined
      const contentLength = Number(res.headers.get('content-length') ?? 0)
      const expected = range.end - range.start + 1
      const raw = Readable.fromWeb(res.body as any)

      if (res.status === 206) {
        return {
          stream: raw,
          contentLength: contentLength > 0 ? contentLength : expected,
          totalSize
        }
      }
      return {
        stream: sliceStream(raw, range.start, expected),
        contentLength: totalSize ? Math.min(totalSize - range.start, expected) : expected,
        totalSize: contentLength || undefined
      }
    }
  }
}
