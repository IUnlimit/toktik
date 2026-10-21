import type { PlayQuality } from '@shared/types'

export type ResolvedQuality = 'original' | 'low'

/**
 * 根据账号偏好与浏览器的网络提示选择本次播放画质。
 * auto：优先使用 Network Information API（Chrome / Android 可用）；
 * 不支持时回退原画，避免在未知网络下误降画质。
 */
export function pickQuality(pref: PlayQuality | undefined): ResolvedQuality {
  const mode = pref ?? 'auto'
  if (mode === 'original' || mode === 'low') return mode
  const conn: any = (navigator as any).connection
  if (!conn) return 'original'
  if (conn.saveData) return 'low'
  const type = String(conn.effectiveType || '')
  if (type === 'slow-2g' || type === '2g' || type === '3g') return 'low'
  const downlink = Number(conn.downlink)
  if (Number.isFinite(downlink) && downlink > 0 && downlink < 1.5) return 'low'
  return 'original'
}

/** 网络状况变化时回调；返回取消订阅函数 */
export function watchNetwork(cb: () => void): () => void {
  const conn: any = (navigator as any).connection
  if (!conn?.addEventListener) return () => undefined
  const handler = () => cb()
  conn.addEventListener('change', handler)
  return () => conn.removeEventListener('change', handler)
}

/** 设置页展示用的网络说明 */
export function networkHint(): string {
  const conn: any = (navigator as any).connection
  if (!conn) return '当前浏览器不提供网络状态，自动模式将按原画播放'
  if (conn.saveData) return '浏览器已开启省流量模式'
  const type = String(conn.effectiveType || 'unknown')
  const downlink = Number(conn.downlink)
  return Number.isFinite(downlink) && downlink > 0 ? `${type} · 约 ${downlink} Mbps` : type
}
