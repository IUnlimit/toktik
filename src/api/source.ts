import { request } from '@/utils/request'
import type { Prefs, Source } from '@shared/types'

export interface SourceRow extends Source {
  address: string
  kindLabel: string
  videoCount: number
  disabledCount: number
}

export interface ScanStatusPayload {
  scan: {
    running: boolean
    phase: 'idle' | 'listing' | 'saving' | 'done' | 'error'
    sourceId?: string
    sourceName?: string
    scanned: number
    found: number
    dirs: number
    failedDirs: number
    errors: string[]
    current: string
    error?: string
    startedAt?: number
    finishedAt?: number
  }
  meta: { running: boolean; done: number; total: number; current: string }
}

export function sourceList() {
  return request<{ total: number; list: SourceRow[] }>({ url: '/source/list', method: 'get' })
}

export function saveSource(source: Partial<Source> & { kind: Source['kind'] }) {
  return request<SourceRow>({ url: '/source/save', method: 'post', data: source })
}

export function deleteSource(id: string) {
  return request({ url: '/source/delete', method: 'post', data: { id } })
}

export function toggleSource(id: string, enabled: boolean) {
  return request<SourceRow>({ url: '/source/toggle', method: 'post', data: { id, enabled } })
}

export function startScan(id?: string) {
  return request({ url: '/source/scan', method: 'post', data: id ? { id } : {} })
}

export function scanStatus() {
  return request<ScanStatusPayload>({ url: '/source/scan/status', method: 'get' })
}

export function cancelScan() {
  return request({ url: '/source/scan/cancel', method: 'post' })
}

export function purgeMissing() {
  return request<{ removed: number }>({ url: '/source/purge-missing', method: 'post' })
}

export interface SourceTestResult {
  ok: boolean
  rootPath?: string
  total?: number
  dirs?: number
  files?: number
  names?: string[]
  error?: string
}

export function testSource(data: {
  id?: string
  kind: string
  config: Record<string, any>
  rootPath: string
}) {
  return request<SourceTestResult>({ url: '/source/test', method: 'post', data })
}

export function getPrefs() {
  return request<Prefs>({
    url: '/prefs/get',
    method: 'get'
  })
}

export function setPrefs(patch: Partial<Prefs>) {
  return request<Prefs>({ url: '/prefs/set', method: 'post', data: patch })
}
