import { PORT } from './config'
import { secretKey } from './secret'
import { signMediaPath } from './auth'

/** 前端可直接使用的播放地址（同源，带 Cookie）；variant=low 时走后端转码缓存 */
export function streamUrl(videoId: string, variant?: 'low'): string {
  const base = '/api/media/stream/' + encodeURIComponent(videoId)
  return variant ? `${base}?variant=${variant}` : base
}

/** 封面地址；coverAt 变化后地址随之变化，浏览器缓存自动失效 */
export function coverUrlFor(record: { id: string; coverAt?: number }): string {
  const base = '/api/media/cover/' + encodeURIComponent(record.id)
  return record.coverAt ? `${base}?v=${record.coverAt}` : base
}

/** 服务端内部（ffmpeg / ffprobe）使用的短时效签名地址 */
export async function signedStreamUrl(videoId: string): Promise<string> {
  const secret = await secretKey()
  const expires = Date.now() + 60 * 60 * 1000
  const signature = signMediaPath(secret, videoId, expires)
  return (
    `http://127.0.0.1:${PORT}/api/media/stream/${encodeURIComponent(videoId)}` +
    `?e=${expires}&s=${encodeURIComponent(signature)}`
  )
}
