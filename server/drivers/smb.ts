import type { DirEntry, SmbConfig, Source } from '../../shared/types'
import { joinPath, normalizePath } from '../../shared/types'
import type { ByteRange, OpenResult, SourceDriver } from './types'

interface SmbStats {
  name: string
  isDirectory(): boolean
  size?: number
  mtime?: Date | number
}

async function loadSmb2(): Promise<any> {
  const mod: any = await import('@marsaud/smb2')
  return mod?.default ?? mod
}

/** 共享根（UNC），仅用于建立 SMB2 连接 */
function shareRoot(cfg: SmbConfig): string {
  const raw = String(cfg.share || '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
  const share = raw.slice(raw.lastIndexOf('/') + 1)
  const host = String(cfg.host || '')
    .replace(/\\/g, '')
    .replace(/^\/+|\/+$/g, '')
  return '\\\\' + host + '\\' + share
}

/** 数据源相对路径 -> 共享内相对路径（@marsaud/smb2 的路径不能带 \\host\share 前缀） */
function innerPath(rootPath: string, relPath: string): string {
  return normalizePath(joinPath(normalizePath(rootPath), relPath))
    .replace(/^\/+/, '')
    .replace(/\//g, '\\')
}

async function createClient(cfg: SmbConfig): Promise<any> {
  if (!cfg?.host) throw new Error('SMB 数据源缺少主机地址')
  const SMB2 = await loadSmb2()
  return new SMB2({
    share: shareRoot(cfg),
    domain: cfg.domain || '',
    username: cfg.user || 'guest',
    password: cfg.password || ''
  })
}

export function createSmbDriver(source: Source): SourceDriver {
  const cfg = source.config as SmbConfig

  return {
    kind: 'smb',

    async list(relPath: string): Promise<DirEntry[]> {
      const smb = await createClient(cfg)
      const target = innerPath(source.rootPath, relPath)
      try {
        let rows: SmbStats[]
        try {
          rows = await smb.readdir(target, { stats: true })
        } catch {
          // 兼容不支持 stats 选项的实现：退化为逐个 stat
          const names: string[] = await smb.readdir(target)
          rows = []
          for (const name of names) {
            const full = target ? target + '\\' + name : name
            try {
              const stat = await smb.stat(full)
              rows.push({
                name,
                isDirectory: () => stat.isDirectory(),
                size: stat.size,
                mtime: stat.mtime
              })
            } catch {
              rows.push({ name, isDirectory: () => false, size: 0, mtime: 0 })
            }
          }
        }
        return rows
          .filter((row) => row.name !== '.' && row.name !== '..')
          .map((row) => {
            const mtime = row.mtime instanceof Date ? row.mtime.getTime() : Number(row.mtime ?? 0)
            return {
              name: row.name,
              path: joinPath(relPath, row.name),
              isDir: row.isDirectory(),
              size: row.size || 0,
              mtime: Number.isFinite(mtime) ? mtime : 0
            }
          })
      } finally {
        try {
          smb.disconnect()
        } catch {
          /* 忽略断连失败 */
        }
      }
    },

    async open(relPath: string, range: ByteRange): Promise<OpenResult> {
      const smb = await createClient(cfg)
      try {
        const stream = await smb.createReadStream(innerPath(source.rootPath, relPath), {
          start: range.start,
          end: range.end
        })
        const cleanup = () => {
          try {
            smb.disconnect()
          } catch {
            /* 忽略 */
          }
        }
        stream.once('close', cleanup)
        stream.once('error', cleanup)
        return {
          stream,
          contentLength: range.end - range.start + 1
        }
      } catch (err) {
        try {
          smb.disconnect()
        } catch {
          /* 忽略 */
        }
        throw err
      }
    }
  }
}
