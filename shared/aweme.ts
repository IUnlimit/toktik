/** 与参考项目对齐的 aweme 结构（前后端共享的类型） */

export interface Aweme {
  aweme_id: string
  desc: string
  create_time: number
  video: {
    play_addr: { url_list: string[]; width: number; height: number }
    cover: { url_list: string[]; width: number; height: number }
    poster?: string
    duration: number
    width: number
    height: number
    ratio: string
  }
  author: {
    uid: string
    nickname: string
    unique_id: string
    signature: string
    avatar_168x168: { url_list: string[] }
    avatar_300x300: { url_list: string[] }
    aweme_count: number
    follower_count: number
    total_favorited: number
  }
  statistics: {
    digg_count: number
    comment_count: number
    collect_count: number
    share_count: number
    play_count: number
  }
  isLoved: boolean
  isCollect: boolean
  /** 本项目扩展字段 */
  toktik: {
    collection: string
    episode: number | null
    durationMs: number
    path: string
    sourceId: string
    playable: boolean
    ext: string
    crossOrigin: boolean
    lastPositionSec: number
    /** 播放画质地址：original 为原文件，low 为服务端转码的省流版本（未就绪时后端会回退原画） */
    playQualities?: { original: string; low: string }
  }
}

/** 网格视图只需要封面与基础信息，不需要播放地址 */
export interface PosterItem {
  id: string
  title: string
  collection: string
  episode: number | null
  durationMs: number
  coverUrl: string | null
  playable: boolean
  lastPlayedAt?: number
  positionSec?: number
  likedAt?: number
  mtime: number
  size: number
  /** 合集网格上的角标文案（如集数） */
  badge?: string
}
