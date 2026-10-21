import type { PosterItem } from '../shared/aweme'
import { buildDescription } from './parse'
import { coverUrlFor, streamUrl } from './media-url'
import { userData } from './store'
import type { VideoRecord } from '../shared/types'
import { isVideoVisible } from '../shared/types'
import type { Aweme } from '../shared/aweme'

export interface AssembleContext {
  likedIds: Set<string>
  historyMap: Map<string, { positionSec: number; lastPlayedAt: number }>
  /** 合集名 -> 该合集视频数量，用于生成“作品 N” */
  collectionCount: Map<string, number>
  /** 全局点赞总数，作为作者获赞的近似 */
  totalLikes: number
}

export async function loadAssembleContext(
  userId: string,
  records?: VideoRecord[]
): Promise<AssembleContext> {
  const [likes, history, visible] = await Promise.all([
    userData(userId).likes.read(),
    userData(userId).history.read(),
    records ? Promise.resolve(records) : loadVisibleRecords()
  ])
  const collectionCount = new Map<string, number>()
  for (const record of visible) {
    collectionCount.set(record.collection, (collectionCount.get(record.collection) ?? 0) + 1)
  }
  return {
    likedIds: new Set(likes.map((like) => like.id)),
    historyMap: new Map(
      history.map((row) => [row.id, { positionSec: row.positionSec, lastPlayedAt: row.lastPlayedAt }])
    ),
    collectionCount,
    totalLikes: likes.length
  }
}

async function loadVisibleRecords(): Promise<VideoRecord[]> {
  const { library } = await import('./store')
  return (await library.all()).filter((record) => isVideoVisible(record))
}

/**
 * 把一条视频记录组装成抖音风格的 aweme。
 * 播放地址与封面都由后端 /api/media 提供，前端不再接触任何信源凭据。
 */
export function toAweme(record: VideoRecord, ctx: AssembleContext): Aweme {
  const cover = coverUrlFor(record)
  const play = record.playable ? streamUrl(record.id) : null
  const durationSec = Math.round(record.durationMs / 1000)
  const history = ctx.historyMap.get(record.id)

  return {
    aweme_id: record.id,
    desc: buildDescription(record),
    create_time: Math.floor(record.mtime / 1000),
    video: {
      play_addr: {
        url_list: play ? [play] : [],
        width: record.width,
        height: record.height
      },
      cover: {
        url_list: [cover],
        width: 480,
        height: Math.max(1, Math.round((record.height / Math.max(record.width, 1)) * 480))
      },
      poster: cover,
      duration: durationSec,
      width: record.width,
      height: record.height,
      ratio: record.height >= record.width ? '720p' : '1080p'
    },
    author: {
      uid: 'collection:' + record.collection,
      nickname: record.collection,
      unique_id: record.collection,
      signature: `${record.collection} · ${ctx.collectionCount.get(record.collection) ?? 1} 个作品`,
      avatar_168x168: { url_list: [cover] },
      avatar_300x300: { url_list: [cover] },
      aweme_count: ctx.collectionCount.get(record.collection) ?? 1,
      follower_count: ctx.collectionCount.get(record.collection) ?? 1,
      total_favorited: ctx.totalLikes
    },
    statistics: {
      digg_count: ctx.likedIds.has(record.id) ? 1 : 0,
      comment_count: 0,
      collect_count: 0,
      share_count: 0,
      play_count: 0
    },
    isLoved: ctx.likedIds.has(record.id),
    isCollect: false,
    toktik: {
      collection: record.collection,
      episode: record.episode,
      durationMs: record.durationMs,
      path: record.path,
      sourceId: record.sourceId,
      playable: record.playable,
      ext: record.ext,
      crossOrigin: false,
      lastPositionSec: history?.positionSec ?? 0,
      playQualities: play
        ? { original: play, low: streamUrl(record.id, 'low') }
        : undefined
    }
  }
}

export function toAwemes(records: VideoRecord[], ctx: AssembleContext): Aweme[] {
  return records.map((record) => toAweme(record, ctx))
}

export function toPosters(records: VideoRecord[], ctx: AssembleContext): PosterItem[] {
  return records.map((record) => {
    const history = ctx.historyMap.get(record.id)
    return {
      id: record.id,
      title: record.title,
      collection: record.collection,
      episode: record.episode,
      durationMs: record.durationMs,
      coverUrl: coverUrlFor(record),
      playable: record.playable,
      lastPlayedAt: history?.lastPlayedAt,
      positionSec: history?.positionSec,
      mtime: record.mtime,
      size: record.size
    }
  })
}
