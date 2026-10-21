import type { PlayQuality, Prefs } from '../shared/types'
import { userData } from './store'

const DEFAULTS: Prefs = {
  autoMute: true,
  rememberPosition: true,
  quality: 'auto',
  preloadAhead: 2
}

const QUALITIES: PlayQuality[] = ['auto', 'original', 'low']

function normalizeQuality(value: unknown, fallback: PlayQuality): PlayQuality {
  return QUALITIES.includes(value as PlayQuality) ? (value as PlayQuality) : fallback
}

function normalizeAhead(value: unknown, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(0, Math.min(3, Math.round(parsed)))
}

export async function readPrefs(userId: string): Promise<Prefs> {
  const stored = await userData(userId).prefs.read()
  return { ...DEFAULTS, ...stored }
}

export async function writePrefs(userId: string, patch: Partial<Prefs>): Promise<Prefs> {
  const current = await readPrefs(userId)
  const next: Prefs = {
    ...current,
    ...patch,
    autoMute: patch.autoMute ?? current.autoMute,
    rememberPosition: patch.rememberPosition ?? current.rememberPosition,
    quality: normalizeQuality(patch.quality, current.quality ?? 'auto'),
    preloadAhead: normalizeAhead(patch.preloadAhead, current.preloadAhead ?? 2)
  }
  await userData(userId).prefs.write(next)
  return next
}

/** 推荐流种子：每个账号独立，首次访问时生成 */
export async function feedSeed(userId: string): Promise<string> {
  const prefs = await readPrefs(userId)
  if (prefs.seed) return prefs.seed
  const seed = Math.random().toString(36).slice(2, 10)
  await writePrefs(userId, { seed })
  return seed
}

export async function rotateFeedSeed(userId: string): Promise<string> {
  const seed = Math.random().toString(36).slice(2, 10)
  await writePrefs(userId, { seed })
  return seed
}
