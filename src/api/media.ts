import { request } from '@/utils/request'

export interface VariantStatus {
  enabled: boolean
  running: boolean
  queued: number
  files: number
  bytes: number
  failed: number
}

/** 省流画质缓存状态（是否可用、占用空间、排队数） */
export function variantStatus() {
  return request<VariantStatus>({ url: '/media/variants/status', method: 'get' })
}

/** 清空省流画质缓存 */
export function clearVariants() {
  return request<{ files: number; bytes: number }>({ url: '/media/variants/clear', method: 'post' })
}
