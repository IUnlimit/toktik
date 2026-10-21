import crypto from 'node:crypto'
import type { Source, SourceKind } from '../shared/types'
import { normalizePath } from '../shared/types'
import { covers, library, sources } from './store'
import { dropDriver } from './drivers'

export function newSourceId(): string {
  return 'src_' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex')
}

export async function listSources(): Promise<Source[]> {
  const all = await sources.read()
  return all.slice().sort((a, b) => a.createdAt - b.createdAt)
}

export async function getSource(id: string): Promise<Source> {
  const source = (await sources.read()).find((row) => row.id === id)
  if (!source) throw new Error('数据源不存在：' + id)
  return source
}

export async function saveSource(
  input: Partial<Source> & { kind: SourceKind },
  createdBy?: string
): Promise<Source> {
  const now = Date.now()
  const all = await sources.read()
  const existing = input.id ? all.find((row) => row.id === input.id) : undefined
  const source: Source = {
    id: existing?.id ?? input.id ?? newSourceId(),
    name: (input.name ?? existing?.name ?? '未命名').trim() || '未命名',
    kind: input.kind ?? existing?.kind ?? 'local',
    rootPath: normalizePath(input.rootPath ?? existing?.rootPath ?? '/'),
    config: (input.config ?? existing?.config ?? {}) as Source['config'],
    enabled: input.enabled ?? existing?.enabled ?? true,
    createdBy: existing?.createdBy ?? input.createdBy ?? createdBy,
    createdAt: existing?.createdAt ?? now,
    lastScanAt: existing?.lastScanAt,
    lastScanCount: existing?.lastScanCount
  }
  await sources.mutate((rows) => {
    const index = rows.findIndex((row) => row.id === source.id)
    if (index >= 0) rows[index] = source
    else rows.push(source)
  })
  dropDriver(source.id)
  return source
}

export async function deleteSource(id: string): Promise<number> {
  const records = (await library.all()).filter((video) => video.sourceId === id)
  const ids = records.map((video) => video.id)
  await library.remove(ids)
  await covers.remove(ids)
  await sources.mutate((rows) => {
    const index = rows.findIndex((row) => row.id === id)
    if (index >= 0) rows.splice(index, 1)
  })
  dropDriver(id)
  return ids.length
}

export async function touchSourceScan(id: string, count: number): Promise<void> {
  await sources.mutate((rows) => {
    const row = rows.find((item) => item.id === id)
    if (!row) return
    row.lastScanAt = Date.now()
    row.lastScanCount = count
  })
}

export function sourceAddress(source: Source): string {
  const path = normalizePath(source.rootPath || '/')
  switch (source.kind) {
    case 'local': {
      const base = String((source.config as any)?.path ?? '')
      return path === '/' ? base : base.replace(/[\\/]+$/, '') + path
    }
    case 'webdav': {
      const cfg = source.config as any
      const base = String(cfg.baseUrl ?? '未配置地址').replace(/\/+$/, '')
      return path === '/' ? base : base + path
    }
    case 'ftp': {
      const cfg = source.config as any
      return `ftp://${cfg.host}:${cfg.port ?? 21}${path === '/' ? '' : path}`
    }
    case 'smb': {
      const cfg = source.config as any
      return `smb://${cfg.host}/${cfg.share ?? ''}${path === '/' ? '' : path}`
    }
    default:
      return ''
  }
}

export function kindLabel(kind: SourceKind): string {
  switch (kind) {
    case 'local':
      return '服务器目录'
    case 'webdav':
      return 'WebDAV'
    case 'ftp':
      return 'FTP'
    case 'smb':
      return 'SMB'
    default:
      return kind
  }
}

/** 回传给 UI 的数据源：密码只回传是否存在 */
export function serializeSource(source: Source) {
  const config = { ...((source.config ?? {}) as unknown as Record<string, unknown>) }
  if (config.password) config.password = '••••••'
  return {
    ...source,
    config,
    address: sourceAddress(source),
    kindLabel: kindLabel(source.kind)
  }
}
