import type {
  ManagedMeta,
  ManagedQuery,
  ManagedSort,
  ManagedState,
  VideoFilter
} from '../shared/manage'
import type { VideoRecord } from '../shared/types'
import { isVideoEnabled } from '../shared/types'
import { library, sources } from './store'

const SORTS = new Set<ManagedSort>(['mtime', 'name', 'size', 'duration'])
const STATES = new Set<ManagedState>(['all', 'enabled', 'disabled'])
const METAS = new Set<ManagedMeta>(['all', 'done', 'pending', 'failed'])

function numberOrUndefined(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const num = Number(value)
  return Number.isFinite(num) && num >= 0 ? num : undefined
}

function normalizeFilter(input: VideoFilter | Record<string, any> | undefined): VideoFilter {
  const raw = input ?? {}
  const sourceIds = Array.isArray(raw.sourceIds)
    ? raw.sourceIds
    : typeof raw.sourceIds === 'string' && raw.sourceIds
      ? raw.sourceIds.split(',')
      : []
  let minDurationMs = numberOrUndefined(raw.minDurationMs)
  let maxDurationMs = numberOrUndefined(raw.maxDurationMs)
  let minSize = numberOrUndefined(raw.minSize)
  let maxSize = numberOrUndefined(raw.maxSize)
  if (minDurationMs !== undefined && maxDurationMs !== undefined && minDurationMs > maxDurationMs) {
    ;[minDurationMs, maxDurationMs] = [maxDurationMs, minDurationMs]
  }
  if (minSize !== undefined && maxSize !== undefined && minSize > maxSize) {
    ;[minSize, maxSize] = [maxSize, minSize]
  }
  return {
    sourceIds: sourceIds.map((id: unknown) => String(id)).filter(Boolean),
    q: typeof raw.q === 'string' ? raw.q.trim().toLowerCase() : '',
    state: STATES.has(raw.state) ? raw.state : 'all',
    meta: METAS.has(raw.meta) ? raw.meta : 'all',
    minDurationMs,
    maxDurationMs,
    minSize,
    maxSize,
    sort: SORTS.has(raw.sort) ? raw.sort : 'mtime',
    order: raw.order === 'asc' ? 'asc' : 'desc'
  }
}

function matches(record: VideoRecord, filter: VideoFilter): boolean {
  if (record.missing) return false

  if (filter.sourceIds?.length && !filter.sourceIds.includes(record.sourceId)) return false

  if (filter.q) {
    const query = filter.q
    if (!record.title.toLowerCase().includes(query) && !record.path.toLowerCase().includes(query)) {
      return false
    }
  }

  const enabled = isVideoEnabled(record)
  if (filter.state === 'enabled' && !enabled) return false
  if (filter.state === 'disabled' && enabled) return false

  if (filter.meta && filter.meta !== 'all' && record.metaStatus !== filter.meta) return false

  // 时长条件只匹配已刮削的条目：未刮削（0）不能被“X 分钟以下”误命中
  const hasDurationFilter = filter.minDurationMs !== undefined || filter.maxDurationMs !== undefined
  if (hasDurationFilter) {
    if (record.durationMs <= 0) return false
    if (filter.minDurationMs !== undefined && record.durationMs < filter.minDurationMs) return false
    if (filter.maxDurationMs !== undefined && record.durationMs > filter.maxDurationMs) return false
  }

  if (filter.minSize !== undefined && record.size < filter.minSize) return false
  if (filter.maxSize !== undefined && record.size > filter.maxSize) return false

  return true
}

function compareRecords(a: VideoRecord, b: VideoRecord, filter: VideoFilter): number {
  let result = 0
  switch (filter.sort) {
    case 'name':
      result = a.title.localeCompare(b.title, 'zh')
      break
    case 'size':
      result = a.size - b.size
      break
    case 'duration':
      result = a.durationMs - b.durationMs
      break
    default:
      result = a.mtime - b.mtime
  }
  return filter.order === 'asc' ? result : -result
}

/** 管理页查询：服务端筛选 + 摘要 + 分页 */
export async function queryManaged(
  input: VideoFilter | Record<string, any> | undefined,
  pageNo = 0,
  pageSize = 50
): Promise<ManagedQuery> {
  const filter = normalizeFilter(input)
  const [records, sourceRows] = await Promise.all([library.all(), sources.read()])
  const sourceNames = new Map(sourceRows.map((source) => [source.id, source.name]))
  const matched = records.filter((record) => matches(record, filter))
  matched.sort((a, b) => compareRecords(a, b, filter))

  const safePageSize = Math.min(200, Math.max(1, Math.floor(Number(pageSize)) || 50))
  const safePageNo = Math.max(0, Math.floor(Number(pageNo)) || 0)
  const start = safePageNo * safePageSize
  const enabled = matched.filter((record) => isVideoEnabled(record)).length

  return {
    total: matched.length,
    enabled,
    disabled: matched.length - enabled,
    bytes: matched.reduce((sum, record) => sum + record.size, 0),
    durationMs: matched.reduce((sum, record) => sum + record.durationMs, 0),
    pendingMeta: matched.filter((record) => record.metaStatus === 'pending').length,
    pageNo: safePageNo,
    pageSize: safePageSize,
    list: matched.slice(start, start + safePageSize).map((record) => ({
      id: record.id,
      title: record.title,
      path: record.path,
      collection: record.collection,
      sourceId: record.sourceId,
      sourceName: sourceNames.get(record.sourceId) ?? '已删除的数据源',
      size: record.size,
      durationMs: record.durationMs,
      metaStatus: record.metaStatus,
      playable: record.playable,
      enabled: isVideoEnabled(record),
      mtime: record.mtime
    }))
  }
}

/** 单条切换；记录不存在时返回 null，由路由层转成 404 */
export async function setVideoEnabled(
  id: string,
  enabled: boolean
): Promise<{ id: string; enabled: boolean } | null> {
  const record = await library.get(id)
  if (!record) return null
  if (isVideoEnabled(record) !== enabled) await library.update(id, { enabled })
  return { id, enabled }
}

/** 按当前筛选条件批量启用/禁用；只更新状态确实需要变化的条目 */
export async function applyEnabledToFilter(
  input: VideoFilter | Record<string, any> | undefined,
  enabled: boolean
): Promise<{ updated: number }> {
  const filter = normalizeFilter(input)
  const records = await library.all()
  const ids = records
    .filter((record) => matches(record, filter) && isVideoEnabled(record) !== enabled)
    .map((record) => record.id)
  await library.bulkUpdate(ids, { enabled })
  return { updated: ids.length }
}
