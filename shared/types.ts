/** 前后端共享的领域模型与协议常量（纯类型/纯函数，不依赖运行时环境） */

export type SourceKind = 'local' | 'webdav' | 'ftp' | 'smb'

/** 服务器本地目录：后端直接读文件系统 */
export interface LocalConfig {
  /** 服务器上的绝对路径，例如 /mnt/media 或 D:\\media */
  path: string
}

export interface WebdavConfig {
  baseUrl: string
  username?: string
  password?: string
}

export interface FtpConfig {
  host: string
  port: number
  user: string
  password: string
  secure?: boolean
}

export interface SmbConfig {
  host: string
  port: number
  share: string
  domain?: string
  user: string
  password: string
}

export type SourceConfig = LocalConfig | WebdavConfig | FtpConfig | SmbConfig

export interface Source {
  id: string
  name: string
  kind: SourceKind
  /** 数据源内的根路径，'/' 表示整个源 */
  rootPath: string
  config: SourceConfig
  enabled: boolean
  /** 创建者（服务器共享库，仅用于展示） */
  createdBy?: string
  createdAt: number
  lastScanAt?: number
  lastScanCount?: number
}

export interface VideoRecord {
  /** 稳定 id：sourceId + '|' + path */
  id: string
  sourceId: string
  path: string
  name: string
  ext: string
  size: number
  mtime: number
  title: string
  collection: string
  episode: number | null
  durationMs: number
  width: number
  height: number
  playable: boolean
  metaStatus: 'pending' | 'done' | 'failed'
  missing: boolean
  /** 是否参与浏览；旧记录缺省视为启用 */
  enabled: boolean
  scannedAt: number
  /** 封面生成时间，用于封面 URL 的缓存失效 */
  coverAt?: number
}

/** 兼容旧记录：没有 enabled 字段时按启用处理 */
export function isVideoEnabled(video: { enabled?: boolean }): boolean {
  return video.enabled !== false
}

/** 可参与浏览：未失效且未被禁用 */
export function isVideoVisible(video: VideoRecord): boolean {
  return !video.missing && isVideoEnabled(video)
}

export interface Like {
  id: string
  likedAt: number
}

export interface HistoryEntry {
  id: string
  lastPlayedAt: number
  positionSec: number
  playCount: number
}

export interface Prefs {
  autoMute: boolean
  rememberPosition: boolean
  /** 播放画质：auto 按网络状况自动选择；original 始终原画；low 始终省流 */
  quality?: PlayQuality
  /** 预加载后续条数（0~3），默认 2 */
  preloadAhead?: number
  /** 推荐流洗牌种子（每个账号独立） */
  seed?: string
}

/** 播放画质偏好 */
export type PlayQuality = 'auto' | 'original' | 'low'

/** 对外暴露的用户信息（永远不含密码散列） */
export interface PublicUser {
  id: string
  username: string
  nickname: string
  signature: string
  createdAt: number
}

export interface DirEntry {
  name: string
  path: string
  isDir: boolean
  size: number
  mtime: number
}

export interface PlayableExt {
  ext: string
  mime: string
}

/** 浏览器可稳定播放的容器 */
export const PLAYABLE_EXTS: PlayableExt[] = [
  { ext: 'mp4', mime: 'video/mp4' },
  { ext: 'm4v', mime: 'video/mp4' },
  { ext: 'webm', mime: 'video/webm' },
  { ext: 'ogv', mime: 'video/ogg' },
  { ext: 'ogg', mime: 'video/ogg' },
  { ext: 'mov', mime: 'video/quicktime' }
]

/** 参与索引但通常无法在浏览器播放的容器 */
export const INDEXED_ONLY_EXTS = [
  'mkv',
  'avi',
  'flv',
  'wmv',
  'ts',
  'm2ts',
  'rmvb',
  'rm',
  'mpg',
  'mpeg',
  '3gp',
  'vob',
  'asf',
  'mts'
]

export const VIDEO_EXTS = [...PLAYABLE_EXTS.map((v) => v.ext), ...INDEXED_ONLY_EXTS]

/** 扫描时跳过的目录名（小写比较） */
export const SKIP_DIRS = new Set([
  '@eadir',
  '@recycle',
  '#recycle',
  '$recycle.bin',
  'system volume information',
  'node_modules',
  '.git',
  '.trash',
  '.trashes',
  'lost+found',
  'recycler',
  '.ds_store'
])

export function isPlayableExt(ext: string): boolean {
  return PLAYABLE_EXTS.some((v) => v.ext === ext.toLowerCase())
}

export function isVideoExt(ext: string): boolean {
  return VIDEO_EXTS.includes(ext.toLowerCase())
}

export function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i < 0 ? '' : name.slice(i + 1).toLowerCase()
}

/** 由数据源 id 与路径生成稳定主键 */
export function videoId(sourceId: string, path: string): string {
  return sourceId + '|' + path
}

export function joinPath(base: string, name: string): string {
  const b = base === '/' || base === '' ? '' : base.replace(/\/+$/, '')
  return b + '/' + name
}

export function parentPath(path: string): string {
  const i = path.lastIndexOf('/')
  return i <= 0 ? '/' : path.slice(0, i)
}

export function baseName(path: string): string {
  const i = path.lastIndexOf('/')
  return i < 0 ? path : path.slice(i + 1)
}

export function normalizePath(path: string): string {
  if (!path) return '/'
  let p = path.replace(/\\/g, '/')
  if (!p.startsWith('/')) p = '/' + p
  p = p.replace(/\/{2,}/g, '/')
  if (p.length > 1) p = p.replace(/\/+$/, '')
  return p || '/'
}

export function mimeForExt(ext: string): string {
  return PLAYABLE_EXTS.find((v) => v.ext === ext.toLowerCase())?.mime ?? 'video/mp4'
}
