import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { DATA_DIR } from './config'
import type { HistoryEntry, Like, Prefs, PublicUser, Source, VideoRecord } from '../shared/types'

const WRITE_DELAY = 200

export interface UserRecord extends PublicUser {
  salt: string
  passwordHash: string
  updatedAt: number
}

export interface SessionRecord {
  token: string
  userId: string
  createdAt: number
  expiresAt: number
  lastSeenAt: number
}

export interface ServerMeta {
  createdAt: number
}

export const USERS_FILE = path.join(DATA_DIR, 'users.json')
export const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json')
export const SOURCES_FILE = path.join(DATA_DIR, 'sources.json')
export const VIDEOS_FILE = path.join(DATA_DIR, 'videos.json')
export const META_FILE = path.join(DATA_DIR, 'meta.json')
export const COVERS_DIR = path.join(DATA_DIR, 'covers')
/** 省流画质（low 变体）的转码缓存目录 */
export const TRANSCODE_DIR = path.join(DATA_DIR, 'transcode')
const LIKES_DIR = path.join(DATA_DIR, 'likes')
const HISTORY_DIR = path.join(DATA_DIR, 'history')
const PREFS_DIR = path.join(DATA_DIR, 'prefs')

let dirsReady: Promise<void> | null = null
let tmpCounter = 0

/** 创建数据目录（权限收紧到 700，信源密码按明文存储，务必限制目录访问） */
export function ensureDataDirs(): Promise<void> {
  if (!dirsReady) {
    dirsReady = (async () => {
      for (const dir of [DATA_DIR, COVERS_DIR, TRANSCODE_DIR, LIKES_DIR, HISTORY_DIR, PREFS_DIR]) {
        await fs.mkdir(dir, { recursive: true, mode: 0o700 })
      }
    })()
  }
  return dirsReady
}

async function atomicWrite(file: string, text: string): Promise<void> {
  await ensureDataDirs()
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${tmpCounter++}.tmp`
  await fs.writeFile(tmp, text, { mode: 0o600 })
  await fs.rename(tmp, file)
}

/**
 * 单个 JSON 文件的持久化文档。
 * 读取后常驻内存，写入合并到 200ms 的窗口内，落盘用「临时文件 + rename」保证原子性。
 */
export class JsonDoc<T> {
  private value: T | undefined
  private loaded = false
  private dirty = false
  private timer: NodeJS.Timeout | null = null
  private chain: Promise<void> = Promise.resolve()
  private loading: Promise<void> | null = null

  constructor(
    private readonly file: string,
    private readonly fallback: () => T
  ) {}

  async read(): Promise<T> {
    if (this.loaded) return this.value as T
    if (!this.loading) {
      this.loading = this.load().finally(() => {
        this.loading = null
      })
    }
    await this.loading
    return this.value as T
  }

  private async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.file, 'utf8')
      this.value = raw.trim() ? (JSON.parse(raw) as T) : this.fallback()
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') {
        console.error('[store] 读取失败，将重新初始化', this.file, err)
        // 保留坏文件以便排查，不要静默覆盖
        try {
          await fs.rename(this.file, `${this.file}.broken-${Date.now()}`)
        } catch {
          /* 忽略 */
        }
      }
      this.value = this.fallback()
    }
    this.loaded = true
  }

  async mutate(fn: (value: T) => void): Promise<T> {
    const value = await this.read()
    fn(value)
    this.markDirty()
    return value
  }

  async write(value: T): Promise<void> {
    this.value = value
    this.loaded = true
    this.markDirty()
  }

  private markDirty(): void {
    this.dirty = true
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      void this.flush().catch((err) => console.error('[store] 写入失败', this.file, err))
    }, WRITE_DELAY)
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (!this.dirty || !this.loaded) return
    this.dirty = false
    const text = JSON.stringify(this.value)
    const file = this.file
    this.chain = this.chain
      .then(() => atomicWrite(file, text))
      .catch((err) => console.error('[store] 写入失败', file, err))
    await this.chain
  }
}

// ------------------------------------------------------------------ 文档

export const users = new JsonDoc<UserRecord[]>(USERS_FILE, () => [])
export const sessions = new JsonDoc<SessionRecord[]>(SESSIONS_FILE, () => [])
export const sources = new JsonDoc<Source[]>(SOURCES_FILE, () => [])
export const videos = new JsonDoc<VideoRecord[]>(VIDEOS_FILE, () => [])
export const serverMeta = new JsonDoc<ServerMeta>(META_FILE, () => ({ createdAt: Date.now() }))

interface UserDocs {
  likes: JsonDoc<Like[]>
  history: JsonDoc<HistoryEntry[]>
  prefs: JsonDoc<Prefs>
}

const userDocs = new Map<string, UserDocs>()

function safeId(userId: string): string {
  return /^[A-Za-z0-9_-]{4,64}$/.test(userId) ? userId : crypto.createHash('sha1').update(userId).digest('hex')
}

const DEFAULT_PREFS: Prefs = { autoMute: true, rememberPosition: true }

/** 每个账号独立的喜欢 / 历史 / 偏好 */
export function userData(userId: string): UserDocs {
  const key = safeId(userId)
  let docs = userDocs.get(key)
  if (!docs) {
    docs = {
      likes: new JsonDoc<Like[]>(path.join(LIKES_DIR, `${key}.json`), () => []),
      history: new JsonDoc<HistoryEntry[]>(path.join(HISTORY_DIR, `${key}.json`), () => []),
      prefs: new JsonDoc<Prefs>(path.join(PREFS_DIR, `${key}.json`), () => ({ ...DEFAULT_PREFS }))
    }
    userDocs.set(key, docs)
  }
  return docs
}

// ------------------------------------------------------------ 视频索引

export const library = {
  async all(): Promise<VideoRecord[]> {
    return videos.read()
  },
  async get(id: string): Promise<VideoRecord | undefined> {
    const all = await videos.read()
    return all.find((v) => v.id === id)
  },
  async bulkGet(ids: string[]): Promise<(VideoRecord | undefined)[]> {
    const all = await videos.read()
    const map = new Map(all.map((v) => [v.id, v]))
    return ids.map((id) => map.get(id))
  },
  async put(record: VideoRecord): Promise<void> {
    await videos.mutate((all) => {
      const index = all.findIndex((v) => v.id === record.id)
      if (index >= 0) all[index] = record
      else all.push(record)
    })
  },
  async bulkPut(records: VideoRecord[]): Promise<void> {
    if (!records.length) return
    await videos.mutate((all) => {
      const index = new Map(all.map((v, i) => [v.id, i]))
      for (const record of records) {
        const at = index.get(record.id)
        if (at === undefined) {
          index.set(record.id, all.length)
          all.push(record)
        } else {
          all[at] = record
        }
      }
    })
  },
  async update(id: string, patch: Partial<VideoRecord>): Promise<VideoRecord | undefined> {
    let updated: VideoRecord | undefined
    await videos.mutate((all) => {
      const index = all.findIndex((v) => v.id === id)
      if (index < 0) return
      all[index] = { ...all[index], ...patch }
      updated = all[index]
    })
    return updated
  },
  async bulkUpdate(ids: string[], patch: Partial<VideoRecord>): Promise<void> {
    if (!ids.length) return
    const set = new Set(ids)
    await videos.mutate((all) => {
      for (let i = 0; i < all.length; i++) {
        if (set.has(all[i].id)) all[i] = { ...all[i], ...patch }
      }
    })
  },
  async remove(ids: string[]): Promise<void> {
    if (!ids.length) return
    const set = new Set(ids)
    await videos.mutate((all) => {
      const keep = all.filter((v) => !set.has(v.id))
      all.length = 0
      all.push(...keep)
    })
  },
  async clear(): Promise<void> {
    await videos.write([])
  }
}

// ---------------------------------------------------------------- 封面

function coverFile(id: string): string {
  return path.join(COVERS_DIR, crypto.createHash('sha1').update(id).digest('hex'))
}

export const covers = {
  async read(id: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(coverFile(id))
    } catch {
      return null
    }
  },
  async write(id: string, data: Buffer): Promise<void> {
    await ensureDataDirs()
    await fs.writeFile(coverFile(id), data, { mode: 0o600 })
  },
  async remove(ids: string[]): Promise<void> {
    await Promise.all(
      ids.map((id) => fs.unlink(coverFile(id)).catch(() => undefined))
    )
  },
  async clear(): Promise<void> {
    const names = await fs.readdir(COVERS_DIR).catch(() => [] as string[])
    await Promise.all(names.map((name) => fs.unlink(path.join(COVERS_DIR, name)).catch(() => undefined)))
  }
}

/** 把所有待写入的文档落盘（退出/测试时调用） */
export async function flushAll(): Promise<void> {
  const docs: JsonDoc<any>[] = [users, sessions, sources, videos, serverMeta]
  for (const docs2 of userDocs.values()) docs.push(docs2.likes, docs2.history, docs2.prefs)
  await Promise.all(docs.map((doc) => doc.flush()))
}

/** 仅供测试/维护：丢弃内存缓存（下次读取重新从磁盘加载） */
export function resetStoreCache(): void {
  userDocs.clear()
}
