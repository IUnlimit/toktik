import { request } from '@/utils/request'
import type { ManagedQuery, ManagedVideo, VideoFilter } from '@shared/manage'

export type { ManagedQuery, ManagedVideo, VideoFilter }

/** 管理台查询：服务端筛选 + 摘要 + 分页 */
export function queryManagedVideos(filter: VideoFilter, pageNo: number, pageSize = 50) {
  return request<ManagedQuery>({
    url: '/library/videos',
    method: 'get',
    params: { ...filter, pageNo, pageSize, sourceIds: filter.sourceIds?.join(',') }
  })
}

/** 单条启用/禁用 */
export function toggleManagedVideo(id: string, enabled: boolean) {
  return request<{ id: string; enabled: boolean }>({
    url: '/library/videos/toggle',
    method: 'post',
    data: { id, enabled }
  })
}

/** 按当前筛选条件批量启用/禁用 */
export function bulkManagedVideos(filter: VideoFilter, enabled: boolean) {
  return request<{ updated: number }>({
    url: '/library/videos/bulk',
    method: 'post',
    data: { filter, enabled }
  })
}
