import { request } from '@/utils/request'
import type { PosterItem } from '@shared/aweme'

export interface AwemeListData<T = any> {
  total: number
  pageNo?: number
  list: T[]
}

/** 推荐流：start/pageSize 偏移分页，seed 决定本次顺序 */
export function recommendedVideo(params?: any) {
  return request<AwemeListData>({ url: '/video/recommended', method: 'get', params })
}

/** 喜欢列表（aweme 形状，用于竖屏播放） */
export function likeVideo(params?: any) {
  return request<AwemeListData>({ url: '/video/like', method: 'get', params })
}

/** 喜欢列表（封面网格） */
export function likePosters() {
  return request<AwemeListData<PosterItem>>({ url: '/video/like/posters', method: 'get' })
}

/** 切换喜欢 */
export function toggleLike(id: string) {
  return request<{ id: string; isLoved: boolean; digg_count: number }>({
    url: '/video/like',
    method: 'post',
    data: { id }
  })
}

/** 历史记录（aweme 形状） */
export function historyVideo(params?: any) {
  return request<AwemeListData>({ url: '/video/history', method: 'get', params })
}

/** 历史记录（封面网格） */
export function historyPosters() {
  return request<AwemeListData<PosterItem>>({ url: '/video/history/posters', method: 'get' })
}

/** 上报播放进度；once=true 表示首次进入该视频 */
export function reportHistory(id: string, positionSec: number, once = false) {
  return request({ url: '/video/history', method: 'post', data: { id, positionSec, once } })
}

/** 删除单条历史；不传 id 即清空 */
export function clearHistory(id?: string) {
  return request({ url: '/video/history', method: 'delete', data: id ? { id } : {} })
}

export function videoComments(id: string) {
  return request({ url: '/video/comments', method: 'get', params: { id } })
}

export function videoDetail(id: string) {
  return request({ url: '/video/detail', method: 'get', params: { id } })
}

export function reprocessVideo(id: string) {
  return request({ url: '/video/reprocess', method: 'post', data: { id } })
}

/** 服务端把整个库标记为待重新刮削 */
export function reprocessAll() {
  return request<{ updated: number }>({ url: '/library/reprocess-all', method: 'post' })
}

export function refreshFeedSeed() {
  return request<{ seed: string }>({ url: '/feed/refresh', method: 'get' })
}
