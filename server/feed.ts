import type { VideoRecord } from '../shared/types'
import { isVideoVisible } from '../shared/types'
import { library } from './store'
import { feedSeed } from './prefs'

/** 可复现的伪随机洗牌（mulberry32） */
function mulberry32(a: number) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seedToInt(seed: string): number {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (Math.imul(hash, 31) + seed.charCodeAt(i)) | 0
  return hash >>> 0
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const list = arr.slice()
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  return list
}

/**
 * 生成推荐顺序：同合集交错，避免连续刷到同一合集。
 * 同一 seed 下顺序稳定，因此翻页不会重复或跳条。
 */
export function buildOrder(records: VideoRecord[], seed: string): VideoRecord[] {
  const groups = new Map<string, VideoRecord[]>()
  for (const record of records) {
    const list = groups.get(record.collection) ?? []
    list.push(record)
    groups.set(record.collection, list)
  }
  for (const list of groups.values()) {
    list.sort((a, b) => {
      if (a.episode !== null && b.episode !== null && a.episode !== b.episode) {
        return a.episode - b.episode
      }
      return b.mtime - a.mtime
    })
  }

  const rand = mulberry32(seedToInt(seed))
  const keys = shuffle([...groups.keys()], rand)
  const queues = keys.map((key) => groups.get(key)!.slice())
  const out: VideoRecord[] = []
  let remaining = queues.reduce((total, queue) => total + queue.length, 0)
  let cursor = 0
  while (remaining > 0) {
    let guard = 0
    while (guard < queues.length) {
      const queue = queues[cursor % queues.length]
      cursor++
      guard++
      if (queue.length) {
        out.push(queue.shift()!)
        remaining--
        break
      }
    }
  }
  return out
}

export async function recommendedPage(
  userId: string,
  start: number,
  pageSize: number,
  seedOverride?: string
): Promise<{ total: number; list: VideoRecord[] }> {
  const all = (await library.all()).filter((record) => isVideoVisible(record) && record.playable)
  const seed = seedOverride || (await feedSeed(userId))
  const ordered = buildOrder(all, seed)
  return {
    total: ordered.length,
    list: ordered.slice(start, start + pageSize)
  }
}
