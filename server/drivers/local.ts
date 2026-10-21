import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import type { DirEntry, LocalConfig, Source } from '../../shared/types'
import { joinPath, normalizePath } from '../../shared/types'
import type { ByteRange, OpenResult, SourceDriver } from './types'
import { RangeError_ } from './types'

/** 把「数据源根路径 + 相对路径」映射到服务器文件系统上的绝对路径，并阻止越界 */
function resolveInside(base: string, rootPath: string, relPath: string): string {
  const baseResolved = path.resolve(base)
  const merged = normalizePath(joinPath(normalizePath(rootPath), relPath))
  const target = path.resolve(baseResolved, '.' + merged)
  if (target !== baseResolved && !target.startsWith(baseResolved + path.sep)) {
    throw new Error('路径超出数据源范围')
  }
  return target
}

export function createLocalDriver(source: Source): SourceDriver {
  const cfg = source.config as LocalConfig
  const base = String(cfg?.path ?? '').trim()
  if (!base) throw new Error('本地数据源缺少服务器目录路径')

  return {
    kind: 'local',

    async list(relPath: string): Promise<DirEntry[]> {
      const dir = resolveInside(base, source.rootPath, relPath)
      const dirents = await fsp.readdir(dir, { withFileTypes: true })
      const entries: DirEntry[] = []
      for (const dirent of dirents) {
        const full = path.join(dir, dirent.name)
        let isDir = dirent.isDirectory()
        if (dirent.isSymbolicLink()) {
          try {
            isDir = (await fsp.stat(full)).isDirectory()
          } catch {
            continue
          }
        }
        if (isDir) {
          entries.push({ name: dirent.name, path: joinPath(relPath, dirent.name), isDir: true, size: 0, mtime: 0 })
          continue
        }
        try {
          const stat = await fsp.stat(full)
          if (!stat.isFile()) continue
          entries.push({
            name: dirent.name,
            path: joinPath(relPath, dirent.name),
            isDir: false,
            size: stat.size,
            mtime: stat.mtimeMs
          })
        } catch {
          /* 无权限/已删除的条目直接跳过 */
        }
      }
      return entries
    },

    async open(relPath: string, range: ByteRange): Promise<OpenResult> {
      const file = resolveInside(base, source.rootPath, relPath)
      const stat = await fsp.stat(file)
      if (!stat.isFile()) throw new Error('不是普通文件')
      const total = stat.size
      if (range.start >= total) throw new RangeError_()
      const end = Math.min(range.end, total - 1)
      if (end < range.start) throw new RangeError_()
      return {
        stream: fs.createReadStream(file, { start: range.start, end }),
        contentLength: end - range.start + 1,
        totalSize: total
      }
    }
  }
}
