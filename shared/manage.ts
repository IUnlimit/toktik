/** 视频管理页的筛选/分页协议（前后端共享） */

export type ManagedSort = 'mtime' | 'name' | 'size' | 'duration'
export type ManagedState = 'all' | 'enabled' | 'disabled'
export type ManagedMeta = 'all' | 'done' | 'pending' | 'failed'

/** 管理台筛选条件；全部可选，空条件表示“匹配所有未失效视频” */
export interface VideoFilter {
  sourceIds?: string[]
  /** 标题或路径模糊匹配 */
  q?: string
  state?: ManagedState
  meta?: ManagedMeta
  minDurationMs?: number
  maxDurationMs?: number
  minSize?: number
  maxSize?: number
  sort?: ManagedSort
  order?: 'asc' | 'desc'
}

export interface ManagedVideo {
  id: string
  title: string
  path: string
  collection: string
  sourceId: string
  sourceName: string
  size: number
  durationMs: number
  metaStatus: 'pending' | 'done' | 'failed'
  playable: boolean
  enabled: boolean
  mtime: number
}

export interface ManagedQuery {
  /** 匹配总数 */
  total: number
  enabled: number
  disabled: number
  /** 匹配项的合计大小（字节） */
  bytes: number
  /** 匹配项的合计时长（毫秒） */
  durationMs: number
  /** 匹配项中尚未刮削时长的数量 */
  pendingMeta: number
  pageNo: number
  pageSize: number
  list: ManagedVideo[]
}
