import { request } from '@/utils/request'
import type { PosterItem } from '@shared/aweme'

export function userinfo() {
  return request({ url: '/user/panel', method: 'get' })
}

export function friends() {
  return request({ url: '/user/friends', method: 'get' })
}

export function userCollect() {
  return request({ url: '/user/collect', method: 'get' })
}

export function collectionList() {
  return request<{ total: number; list: PosterItem[] }>({
    url: '/collection/list',
    method: 'get'
  })
}

export function collectionVideos(name: string) {
  return request({ url: '/collection/videos', method: 'get', params: { name } })
}

export function libraryStats() {
  return request<{
    videos: number
    totalVideos: number
    disabled: number
    missing: number
    collections: number
    likes: number
    history: number
    sources: number
    playable: number
    pendingMeta: number
    failedMeta: number
    totalBytes: number
    totalDurationMs: number
    disabledBytes: number
    disabledDurationMs: number
  }>({ url: '/library/stats', method: 'get' })
}

export function searchLibrary(q: string) {
  return request<{ total: number; list: PosterItem[] }>({
    url: '/library/search',
    method: 'get',
    params: { q }
  })
}

export function resetLibrary() {
  return request({ url: '/library/reset', method: 'post' })
}
