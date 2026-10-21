/**
 * 开发用极简 WebDAV 服务器（零依赖）
 *
 * 只实现浏览器需要的两件事：PROPFIND 列目录 + GET 读文件（含 Range）。
 * 同时发送 CORS 头，方便在本地验证「WebDAV 纯前端访问」链路。
 *
 * 用法：
 *   pnpm dev-webdav [根目录] [端口]
 *   pnpm dev-webdav /tmp/toktik-fixtures 8000
 */
import http from 'node:http'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

const ROOT = path.resolve(process.argv[2] || process.cwd())
const PORT = Number(process.argv[3] || 8000)

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.ogv': 'video/ogg',
  '.ogg': 'video/ogg',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml'
}

function cors(res: http.ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS,PROPFIND')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,Depth')
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length,Content-Range,Accept-Ranges')
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function resolveSafe(urlPath: string): string | null {
  const decoded = decodeURIComponent(urlPath.split('?')[0])
  const normalized = path.posix.normalize('/' + decoded.replace(/^\/+/, ''))
  const abs = path.join(ROOT, normalized)
  if (!abs.startsWith(ROOT)) return null
  return abs
}

async function propfind(req: http.IncomingMessage, res: http.ServerResponse, abs: string, urlPath: string) {
  const stats = await fsp.stat(abs).catch(() => null)
  if (!stats) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Not Found')
    return
  }
  const entries: { href: string; isDir: boolean; size: number; mtime: number }[] = []
  // urlPath 已经是 URL 编码后的形式，先解码再逐段编码，避免双重编码
  const segments = urlPath.split('/').filter(Boolean).map((v) => decodeURIComponent(v))
  const baseHref = '/' + segments.map(encodeURIComponent).join('/')
  entries.push({
    href: stats.isDirectory() ? (baseHref === '/' ? '/' : baseHref + '/') : baseHref,
    isDir: stats.isDirectory(),
    size: stats.size,
    mtime: stats.mtimeMs
  })

  if (stats.isDirectory() && (req.headers.depth ?? '1') !== '0') {
    const names = await fsp.readdir(abs)
    for (const name of names) {
      const childAbs = path.join(abs, name)
      const childStats = await fsp.stat(childAbs).catch(() => null)
      if (!childStats) continue
      const childHref = (baseHref === '/' ? '' : baseHref) + '/' + encodeURIComponent(name)
      entries.push({
        href: childStats.isDirectory() ? childHref + '/' : childHref,
        isDir: childStats.isDirectory(),
        size: childStats.size,
        mtime: childStats.mtimeMs
      })
    }
  }

  const body =
    '<?xml version="1.0" encoding="utf-8"?>\n<d:multistatus xmlns:d="DAV:">\n' +
    entries
      .map((e) => {
        const type = e.isDir
          ? '<d:resourcetype><d:collection/></d:resourcetype>'
          : '<d:resourcetype/>'
        return (
          '  <d:response>\n' +
          `    <d:href>${escapeXml(e.href)}</d:href>\n` +
          '    <d:propstat><d:prop>' +
          type +
          `<d:getcontentlength>${e.size}</d:getcontentlength>` +
          `<d:getlastmodified>${new Date(e.mtime).toUTCString()}</d:getlastmodified>` +
          '</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>\n' +
          '  </d:response>\n'
        )
      })
      .join('') +
    '</d:multistatus>'

  res.writeHead(207, { 'Content-Type': 'application/xml; charset=utf-8' })
  res.end(body)
}

function serveFile(req: http.IncomingMessage, res: http.ServerResponse, abs: string) {
  const stat = fs.statSync(abs)
  const ext = path.extname(abs).toLowerCase()
  const size = stat.size
  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream')
  res.setHeader('Accept-Ranges', 'bytes')

  const range = req.headers.range
  if (!range) {
    res.writeHead(200, { 'Content-Length': size })
    fs.createReadStream(abs).pipe(res)
    return
  }
  const m = /bytes=(\d*)-(\d*)/.exec(range)
  if (!m) {
    res.writeHead(200, { 'Content-Length': size })
    fs.createReadStream(abs).pipe(res)
    return
  }
  let start = m[1] ? Number(m[1]) : 0
  let end = m[2] ? Number(m[2]) : size - 1
  if (!m[1] && m[2]) {
    start = Math.max(0, size - Number(m[2]))
    end = size - 1
  }
  if (start > end || start >= size) {
    res.writeHead(416, { 'Content-Range': `bytes */${size}` })
    res.end()
    return
  }
  res.writeHead(206, {
    'Content-Range': `bytes ${start}-${end}/${size}`,
    'Content-Length': end - start + 1
  })
  fs.createReadStream(abs, { start, end }).pipe(res)
}

const server = http.createServer((req, res) => {
  cors(res)
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }
  const urlPath = (req.url || '/').split('?')[0]
  const abs = resolveSafe(urlPath)
  if (!abs) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }
  if (req.method === 'PROPFIND') {
    void propfind(req, res, abs, urlPath).catch((err) => {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(String(err))
    })
    return
  }
  if (req.method === 'GET' || req.method === 'HEAD') {
    if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
      res.writeHead(404)
      res.end('Not Found')
      return
    }
    serveFile(req, res, abs)
    return
  }
  res.writeHead(405)
  res.end('Method Not Allowed')
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[dev-webdav] serving ${ROOT} at http://127.0.0.1:${PORT}/`)
  console.log('[dev-webdav] 在 TokTik「数据源 → 添加 → WebDAV」填写该地址')
})
