import { PassThrough, Writable } from 'node:stream'
import type { DirEntry, FtpConfig, Source } from '../../shared/types'
import { joinPath, normalizePath } from '../../shared/types'
import type { ByteRange, OpenResult, SourceDriver } from './types'

type FtpClient = import('basic-ftp').Client

async function connect(cfg: FtpConfig): Promise<FtpClient> {
  const { Client } = await import('basic-ftp')
  const client = new Client(20000)
  client.ftp.verbose = false
  await client.access({
    host: cfg.host,
    port: Number(cfg.port) || 21,
    user: cfg.user || 'anonymous',
    password: cfg.password || 'anonymous@',
    secure: Boolean(cfg.secure)
  })
  return client
}

export function createFtpDriver(source: Source): SourceDriver {
  const cfg = source.config as FtpConfig
  if (!cfg?.host) throw new Error('FTP 数据源缺少主机地址')

  function fullPath(relPath: string): string {
    return normalizePath(joinPath(normalizePath(source.rootPath), relPath))
  }

  return {
    kind: 'ftp',

    async list(relPath: string): Promise<DirEntry[]> {
      const client = await connect(cfg)
      try {
        const rows = await client.list(fullPath(relPath))
        return rows.map((row) => ({
          name: row.name,
          path: joinPath(relPath, row.name),
          isDir: row.isDirectory,
          size: row.size || 0,
          mtime: row.modifiedAt ? row.modifiedAt.getTime() : 0
        }))
      } finally {
        client.close()
      }
    },

    async open(relPath: string, range: ByteRange): Promise<OpenResult> {
      const client = await connect(cfg)
      const length = range.end - range.start + 1
      const out = new PassThrough()
      let sent = 0
      let settled = false
      let closed = false

      const closeClient = () => {
        if (closed) return
        closed = true
        try {
          client.close()
        } catch {
          /* 关闭失败不影响已发送内容 */
        }
      }

      const dest = new Writable({
        write(chunk: Buffer, _encoding, callback) {
          if (sent >= length) {
            callback()
            return
          }
          const room = length - sent
          const piece = chunk.length <= room ? chunk : chunk.subarray(0, room)
          sent += piece.length
          out.write(piece)
          if (sent >= length) {
            settled = true
            out.end()
            closeClient()
          }
          callback()
        }
      })

      out.on('close', () => {
        settled = true
        closeClient()
      })

      void client
        .downloadTo(dest, fullPath(relPath), range.start)
        .then(() => {
          if (settled) return
          settled = true
          out.end()
        })
        .catch((err) => {
          if (settled) return
          settled = true
          out.destroy(err as Error)
        })
        .finally(() => closeClient())

      return { stream: out, contentLength: length }
    }
  }
}
