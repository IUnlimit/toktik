import type { DirEntry, Source, VideoRecord } from '../shared/types'
import {
  SKIP_DIRS,
  extOf,
  isPlayableExt,
  isVideoExt,
  isVideoEnabled,
  joinPath,
  normalizePath,
  videoId
} from '../shared/types'
import { covers, library, userData, users } from './store'
import { driverOf } from './drivers'
import { listSources, touchSourceScan } from './sources'
import { parseCollection, parseVideoName } from './parse'

const DEPTH_LIMIT = 64
const CONCURRENCY = 4

export type ScanPhase = 'idle' | 'listing' | 'saving' | 'done' | 'error'

export interface ScanStatus {
  running: boolean
  phase: ScanPhase
  sourceId?: string
  sourceName?: string
  scanned: number
  found: number
  /** 已成功列出的目录数 */
  dirs: number
  /** 列目录失败的目录数（权限不足、路径失效等）；大于 0 说明扫描结果可能不完整 */
  failedDirs: number
  /** 最近几次列目录失败的原因，便于在界面上排查 */
  errors: string[]
  current: string
  error?: string
  startedAt?: number
  finishedAt?: number
}

const status: ScanStatus = {
  running: false,
  phase: 'idle',
  scanned: 0,
  found: 0,
  dirs: 0,
  failedDirs: 0,
  errors: [],
  current: ''
}

let cancelRequested = false
let runningPromise: Promise<ScanStatus> | null = null
/** 元数据队列的唤醒函数，由 meta.ts 注册 */
let metaKick: (() => void) | null = null

export function registerMetaKick(fn: () => void): void {
  metaKick = fn
}

export function getScanStatus(): ScanStatus {
  return { ...status }
}

export function cancelScan(): void {
  cancelRequested = true
}

export function isScanning(): boolean {
  return status.running
}

async function collectVideos(source: Source): Promise<DirEntry[]> {
  const driver = driverOf(source)
  const collected: DirEntry[] = []
  const queue: { path: string; depth: number }[] = [{ path: '/', depth: 0 }]
  /** 已经入队/列过的目录，避免异常驱动返回重复路径时重复遍历 */
  const visitedDirs = new Set<string>([normalizePath('/')])
  let visited = 0

  while (queue.length) {
    if (cancelRequested) break
    const batch = queue.splice(0, CONCURRENCY)
    const results = await Promise.all(
      batch.map(async ({ path, depth }) => {
        try {
          const entries = await driver.list(path)
          return { path, depth, entries, failed: false as const, reason: '' }
        } catch (err) {
          console.warn('[scan] 列目录失败', source.name, path, err)
          return {
            path,
            depth,
            entries: [] as DirEntry[],
            failed: true as const,
            reason: err instanceof Error ? err.message : String(err)
          }
        }
      })
    )

    for (const { path, depth, entries, failed, reason } of results) {
      if (failed && path === '/') {
        throw new Error(
          `无法读取数据源「${source.name}」的根目录${reason ? '：' + reason : ''}`
        )
      }
      if (failed) {
        // 子目录读取失败时继续扫描其它目录，但把失败原因暴露到状态里，
        // 避免用户误以为「只扫到第一级」是正常结果。
        status.failedDirs++
        const detail = `${path}：${reason || '未知错误'}`
        if (!status.errors.includes(detail)) status.errors.push(detail)
        if (status.errors.length > 5) status.errors.shift()
        continue
      }
      visited++
      status.dirs = visited
      status.current = path
      if (visited % 12 === 0) await new Promise((resolve) => setTimeout(resolve, 0))

      for (const entry of entries) {
        if (entry.isDir) {
          if (depth + 1 > DEPTH_LIMIT) continue
          if (SKIP_DIRS.has(entry.name.toLowerCase())) continue
          if (entry.name.startsWith('.')) continue
          const childPath = normalizePath(entry.path)
          if (visitedDirs.has(childPath)) continue
          visitedDirs.add(childPath)
          queue.push({ path: entry.path, depth: depth + 1 })
        } else {
          const ext = extOf(entry.name)
          if (!isVideoExt(ext)) continue
          collected.push(entry)
          status.found = collected.length
        }
      }
    }
  }
  return collected
}

async function saveSourceVideos(source: Source, files: DirEntry[]): Promise<void> {
  const existing = (await library.all()).filter((record) => record.sourceId === source.id)
  const existingMap = new Map(existing.map((record) => [record.path, record]))
  const now = Date.now()
  const changed: VideoRecord[] = []
  const seen = new Set<string>()

  for (const file of files) {
    const id = videoId(source.id, file.path)
    seen.add(file.path)
    const prev = existingMap.get(file.path)
    const parsed = parseVideoName(file.name)
    const collection = parseCollection(file.path)
    const playable = isPlayableExt(extOf(file.name))

    const unchanged =
      prev &&
      prev.size === file.size &&
      prev.mtime === file.mtime &&
      prev.title === parsed.title &&
      prev.collection === collection

    if (unchanged) continue

    const keepMeta = prev && prev.size === file.size && prev.mtime === file.mtime
    changed.push({
      id,
      sourceId: source.id,
      path: file.path,
      name: file.name,
      ext: extOf(file.name),
      size: file.size,
      mtime: file.mtime || now,
      title: parsed.title,
      collection,
      episode: parsed.episode,
      durationMs: keepMeta ? prev.durationMs : 0,
      width: keepMeta ? prev.width : 0,
      height: keepMeta ? prev.height : 0,
      playable,
      metaStatus: keepMeta && prev.metaStatus === 'done' ? 'done' : 'pending',
      missing: false,
      // 重新扫描不能覆盖用户在管理页做出的启用/禁用选择
      enabled: prev?.enabled ?? true,
      coverAt: keepMeta ? prev.coverAt : undefined,
      scannedAt: now
    })
  }

  // 移除了失效标记的旧条目（文件重新出现）
  const revived: VideoRecord[] = []
  for (const record of existing) {
    if (seen.has(record.path) && record.missing) revived.push({ ...record, missing: false })
  }

  // 记录本次未出现的旧条目：不物理删除，保留与喜欢/历史的关联
  const gone = existing
    .filter((record) => !seen.has(record.path) && !record.missing)
    .map((record) => ({ ...record, missing: true }))

  const patches = [...revived, ...gone, ...changed]
  if (patches.length) await library.bulkPut(patches)
}

async function runScan(sourceIds?: string[]): Promise<ScanStatus> {
  cancelRequested = false
  status.running = true
  status.phase = 'listing'
  status.error = undefined
  status.scanned = 0
  status.found = 0
  status.dirs = 0
  status.failedDirs = 0
  status.errors = []
  status.current = ''
  status.startedAt = Date.now()
  status.finishedAt = undefined

  try {
    const all = await listSources()
    const targets = all.filter(
      (source) => source.enabled && (!sourceIds?.length || sourceIds.includes(source.id))
    )
    if (!targets.length) {
      status.phase = 'done'
      status.running = false
      status.finishedAt = Date.now()
      return getScanStatus()
    }

    for (const source of targets) {
      if (cancelRequested) break
      status.sourceId = source.id
      status.sourceName = source.name
      status.phase = 'listing'
      status.found = 0
      status.dirs = 0
      status.failedDirs = 0
      status.errors = []
      status.current = ''

      const files = await collectVideos(source)
      if (cancelRequested) break

      status.phase = 'saving'
      await saveSourceVideos(source, files)
      await touchSourceScan(source.id, files.length)
      status.scanned += files.length
    }

    status.phase = 'done'
    status.current = ''
    metaKick?.()
  } catch (err) {
    status.phase = 'error'
    status.error = err instanceof Error ? err.message : String(err)
  } finally {
    status.running = false
    status.finishedAt = Date.now()
  }
  return getScanStatus()
}

/** 触发扫描；正在扫描时复用现有任务 */
export function startScan(sourceIds?: string[]): Promise<ScanStatus> {
  if (runningPromise) return runningPromise
  runningPromise = runScan(sourceIds).finally(() => {
    runningPromise = null
  })
  return runningPromise
}

/** 清理 missing 且无关联的条目 */
export async function purgeMissing(): Promise<number> {
  const all = await library.all()
  const userRows = await users.read()
  const referenced = new Set<string>()
  for (const user of userRows) {
    const docs = userData(user.id)
    for (const like of await docs.likes.read()) referenced.add(like.id)
    for (const row of await docs.history.read()) referenced.add(row.id)
  }

  const removable = all.filter((record) => record.missing === true && !referenced.has(record.id))
  if (!removable.length) return 0
  const ids = removable.map((record) => record.id)
  await library.remove(ids)
  await covers.remove(ids)
  return ids.length
}
