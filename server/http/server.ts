import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { DIST_DIR, HOST, PORT } from '../config'
import { router } from './api'
import { pruneSessions, resolveSession, tokenFromRequest } from '../auth'
import { handleMedia } from '../media'
import { flushAll } from '../store'
import { ffmpegAvailable, resumeMeta } from '../meta'

const MAX_BODY = 4 * 1024 * 1024

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.txt': 'text/plain; charset=utf-8'
}

function json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const data = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers
  })
  res.end(data)
}

async function readBody(req: IncomingMessage): Promise<any> {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return undefined
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buf = chunk as Buffer
    size += buf.length
    if (size > MAX_BODY) throw new Error('请求体过大')
    chunks.push(buf)
  }
  if (!chunks.length) return {}
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return { raw }
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await fsp.access(file)
    return true
  } catch {
    return false
  }
}

async function serveStatic(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const indexFile = path.join(DIST_DIR, 'index.html')
  if (!(await exists(indexFile))) {
    json(res, 404, {
      code: 404,
      msg: '前端未构建：请先执行 pnpm build，或在开发时用 pnpm dev 启动 vite（/api 会代理到本服务）',
      data: null
    })
    return
  }

  let pathname: string
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch {
    pathname = url.pathname
  }
  if (pathname === '/' || pathname === '') pathname = '/index.html'

  let file = path.resolve(DIST_DIR, '.' + pathname)
  if (file !== DIST_DIR && !file.startsWith(DIST_DIR + path.sep)) {
    json(res, 403, { code: 403, msg: '禁止访问', data: null })
    return
  }

  let stat: Awaited<ReturnType<typeof fsp.stat>> | null = null
  try {
    stat = await fsp.stat(file)
  } catch {
    stat = null
  }
  if (!stat || !stat.isFile()) {
    // SPA 回退：所有非静态资源路径都交给前端路由
    file = indexFile
    try {
      stat = await fsp.stat(file)
    } catch {
      json(res, 404, { code: 404, msg: '页面不存在', data: null })
      return
    }
  }

  const ext = path.extname(file).toLowerCase()
  const cache =
    pathname.startsWith('/assets/') || pathname.startsWith('/js/')
      ? 'public, max-age=31536000, immutable'
      : 'no-cache'
  res.writeHead(200, {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Content-Length': String(stat.size),
    'Cache-Control': cache,
    'X-Content-Type-Options': 'nosniff'
  })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  fs.createReadStream(file).pipe(res)
}

async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  if (url.pathname.startsWith('/api/media/')) {
    const handled = await handleMedia(req, res, url)
    if (handled) return
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Max-Age': '600' })
    res.end()
    return
  }

  const relPath = url.pathname.replace(/^\/api/, '') || '/'
  const token = tokenFromRequest(req)
  const user = await resolveSession(token)

  if (!router.isPublic(req.method ?? 'GET', relPath) && !user) {
    json(res, 401, { code: 401, msg: '登录已过期，请重新登录', data: null })
    return
  }

  let body: any
  try {
    body = await readBody(req)
  } catch (err) {
    json(res, 413, { code: 413, msg: (err as Error).message || '请求体过大', data: null })
    return
  }

  const result = await router.handle(req.method ?? 'GET', relPath, {
    query: url.searchParams,
    body,
    user,
    req,
    res
  })
  json(res, result.status, result.body, result.headers)
}

export function createAppServer(): http.Server {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
    const task = url.pathname.startsWith('/api/')
      ? handleApi(req, res, url)
      : serveStatic(req, res, url)
    task.catch((err) => {
      console.error('[http] 请求处理失败', req.method, url.pathname, err)
      if (!res.headersSent) {
        json(res, 500, { code: 500, msg: '服务器内部错误', data: null })
      } else {
        res.destroy()
      }
    })
  })
  server.requestTimeout = 0
  server.headersTimeout = 60_000
  return server
}

export async function startServer(): Promise<http.Server> {
  const server = createAppServer()
  const sessionTimer = setInterval(() => {
    void pruneSessions().catch((err) => console.error('[auth] 清理会话失败', err))
  }, 60 * 60 * 1000)
  sessionTimer.unref?.()

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(PORT, HOST, () => {
      server.removeListener('error', reject)
      resolve()
    })
  })

  const scope = HOST === '127.0.0.1' || HOST === 'localhost' ? '仅本机' : '局域网'
  console.log(`[toktik] 服务已启动：http://${HOST}:${PORT}（${scope}可访问）`)
  console.log(`[toktik] 数据目录：${path.resolve(process.env.TOKTIK_DATA || 'data')}`)

  const hasFfmpeg = await ffmpegAvailable()
  console.log(`[toktik] 刮削：${hasFfmpeg ? 'ffmpeg 可用' : '未找到 ffmpeg，使用兜底封面'}`)
  await resumeMeta()

  return server
}

let shuttingDown = false

/** 注册优雅退出：停止接收请求并把内存中的 JSON 落盘 */
export function installShutdown(server: http.Server): void {
  const shutdown = (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`\n[toktik] 收到 ${signal}，正在保存数据并退出…`)
    server.close()
    void flushAll()
      .catch((err) => console.error('[store] 退出前落盘失败', err))
      .finally(() => {
        // 未完成的连接最多等 2 秒
        setTimeout(() => process.exit(0), 2000).unref()
        process.exit(0)
      })
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}
