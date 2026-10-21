import { Router, HttpError, type RouteContext, type RouteResponse } from './router'
import { ALLOW_REGISTER, VERSION } from '../config'
import { covers, library, userData, users, type UserRecord } from '../store'
import {
  changePassword,
  clearSessionCookie,
  createSession,
  createUser,
  destroySession,
  destroyUserSessions,
  pruneSessions,
  publicUser,
  resolveSession,
  sessionCookie,
  tokenFromRequest,
  updateProfile,
  verifyCredentials
} from '../auth'
import {
  deleteSource,
  getSource,
  listSources,
  saveSource,
  serializeSource
} from '../sources'
import { buildDriver, dropAllDrivers } from '../drivers'
import { describeSourceError } from '../drivers/errors'
import { cancelScan, getScanStatus, purgeMissing, startScan } from '../scan'
import { cancelMeta, ffmpegAvailable, getMetaStatus, reprocessAll, reprocessVideo } from '../meta'
import { recommendedPage } from '../feed'
import { applyEnabledToFilter, queryManaged, setVideoEnabled } from '../manage'
import { loadAssembleContext, toAweme, toPosters, toAwemes } from '../aweme'
import { readPrefs, rotateFeedSeed, writePrefs } from '../prefs'
import { coverUrlFor } from '../media-url'
import { clearVariants, getVariantStatus } from '../transcode'
import type { PosterItem } from '../../shared/aweme'
import type { PublicUser, Source, SourceKind, VideoRecord } from '../../shared/types'
import { isVideoEnabled, isVideoVisible, normalizePath } from '../../shared/types'

export const router = new Router()

// ---------------------------------------------------------------- 工具

function ok(data: unknown): RouteResponse {
  return { status: 200, body: { code: 200, msg: '', data } }
}

function requireUserId(ctx: RouteContext): string {
  if (!ctx.user) throw new HttpError(401, '登录已过期，请重新登录')
  return ctx.user.id
}

function num(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function pageOf(ctx: RouteContext): { offset: number; limit: number; pageNo: number; pageSize: number } {
  const pageNo = Math.max(0, num(ctx.query.get('pageNo'), 0))
  const pageSize = Math.max(1, num(ctx.query.get('pageSize'), 10))
  return { offset: pageNo * pageSize, limit: pageSize, pageNo, pageSize }
}

/** 按 id 顺序批量取记录，过滤失效/禁用项（不改变顺序） */
async function visibleRecordsInOrder(ids: string[]): Promise<VideoRecord[]> {
  const out: VideoRecord[] = []
  const CHUNK = 200
  for (let i = 0; i < ids.length; i += CHUNK) {
    const records = await library.bulkGet(ids.slice(i, i + CHUNK))
    for (const record of records) {
      if (record && isVideoVisible(record)) out.push(record)
    }
  }
  return out
}

async function userPanel(user: UserRecord) {
  return {
    uid: user.id,
    nickname: user.nickname,
    unique_id: user.username,
    signature: user.signature,
    avatar_168x168: { url_list: [] as string[] },
    avatar_300x300: { url_list: [] as string[] },
    aweme_count: 0,
    follower_count: 0,
    following_count: 0,
    total_favorited: 0,
    follow_status: 0,
    user_age: -1,
    gender: '',
    ip_location: '服务器',
    province: '',
    city: '',
    card_entries: []
  }
}

// ------------------------------------------------------------ 登录限流

const failures = new Map<string, { count: number; firstAt: number; blockedUntil: number }>()
const FAILURE_WINDOW = 10 * 60 * 1000
const MAX_FAILURES = 10
const BLOCK_MS = 5 * 60 * 1000

function clientIp(ctx: RouteContext): string {
  const forwarded = String(ctx.req.headers['x-forwarded-for'] ?? '')
  if (forwarded) return forwarded.split(',')[0].trim()
  return ctx.req.socket.remoteAddress || 'unknown'
}

function assertLoginAllowed(key: string): void {
  const row = failures.get(key)
  if (row && row.blockedUntil > Date.now()) {
    throw new HttpError(429, '登录失败次数过多，请 5 分钟后再试')
  }
}

function recordLoginFailure(key: string): void {
  const now = Date.now()
  const row = failures.get(key)
  if (!row || now - row.firstAt > FAILURE_WINDOW) {
    failures.set(key, { count: 1, firstAt: now, blockedUntil: 0 })
    return
  }
  row.count++
  if (row.count >= MAX_FAILURES) row.blockedUntil = now + BLOCK_MS
}

function clearLoginFailures(key: string): void {
  failures.delete(key)
}

// ------------------------------------------------------------------ 认证

router.get(
  '/health',
  async () => {
    const [userRows, ffmpeg] = await Promise.all([users.read(), ffmpegAvailable()])
    const hasUsers = userRows.length > 0
    return ok({
      ok: true,
      version: VERSION,
      hasUsers,
      allowRegister: ALLOW_REGISTER || !hasUsers,
      ffmpeg
    })
  },
  true
)

router.get(
  '/auth/status',
  async () => {
    const userRows = await users.read()
    const hasUsers = userRows.length > 0
    return ok({ hasUsers, allowRegister: ALLOW_REGISTER || !hasUsers, version: VERSION })
  },
  true
)

router.post(
  '/auth/register',
  async (ctx) => {
    const body = ctx.body ?? {}
    const existing = await users.read()
    if (existing.length > 0 && !ALLOW_REGISTER) {
      throw new HttpError(403, '服务器已关闭注册，请联系管理员开通账号')
    }
    const user = await createUser({
      username: String(body.username ?? ''),
      password: String(body.password ?? ''),
      nickname: body.nickname === undefined ? undefined : String(body.nickname)
    })
    const session = await createSession(user.id)
    await pruneSessions()
    return {
      status: 200,
      body: { code: 200, msg: '', data: publicUser(user) },
      headers: { 'Set-Cookie': sessionCookie(session.token, ctx.req) }
    }
  },
  true
)

router.post(
  '/auth/login',
  async (ctx) => {
    const body = ctx.body ?? {}
    const username = String(body.username ?? '').trim()
    const password = String(body.password ?? '')
    const key = clientIp(ctx) + '|' + username.toLowerCase()
    assertLoginAllowed(key)
    let user: UserRecord
    try {
      user = await verifyCredentials(username, password)
    } catch (err) {
      recordLoginFailure(key)
      throw err
    }
    clearLoginFailures(key)
    const session = await createSession(user.id)
    await pruneSessions()
    return {
      status: 200,
      body: { code: 200, msg: '', data: publicUser(user) },
      headers: { 'Set-Cookie': sessionCookie(session.token, ctx.req) }
    }
  },
  true
)

router.post('/auth/logout', async (ctx) => {
  const token = tokenFromRequest(ctx.req)
  if (token) await destroySession(token)
  return {
    status: 200,
    body: { code: 200, msg: '', data: { ok: true } },
    headers: { 'Set-Cookie': clearSessionCookie(ctx.req) }
  }
})

router.get('/auth/me', async (ctx) => ok(publicUser(ctx.user as UserRecord)))

router.post('/auth/password', async (ctx) => {
  const userId = requireUserId(ctx)
  const body = ctx.body ?? {}
  await changePassword(userId, String(body.oldPassword ?? ''), String(body.newPassword ?? ''))
  // 其他设备的会话失效，当前会话保留（重新签发更简单：直接全部失效后由前端重新登录）
  await destroyUserSessions(userId)
  return {
    status: 200,
    body: { code: 200, msg: '', data: { ok: true } },
    headers: { 'Set-Cookie': clearSessionCookie(ctx.req) }
  }
})

router.post('/auth/profile', async (ctx) => {
  const userId = requireUserId(ctx)
  const body = ctx.body ?? {}
  const user = await updateProfile(userId, {
    nickname: body.nickname === undefined ? undefined : String(body.nickname),
    signature: body.signature === undefined ? undefined : String(body.signature)
  })
  return ok(publicUser(user))
})

// ---------------------------------------------------------------- 视频流

router.get('/video/recommended', async (ctx) => {
  const userId = requireUserId(ctx)
  const start = Math.max(0, num(ctx.query.get('start'), 0))
  const pageSize = Math.max(1, num(ctx.query.get('pageSize'), 10))
  const seed = ctx.query.get('seed') || undefined
  const { total, list } = await recommendedPage(userId, start, pageSize, seed)
  const context = await loadAssembleContext(userId)
  return ok({ total, list: toAwemes(list, context) })
})

router.get('/video/like', async (ctx) => {
  const userId = requireUserId(ctx)
  const { offset, limit, pageNo } = pageOf(ctx)
  const likes = (await userData(userId).likes.read()).slice().sort((a, b) => b.likedAt - a.likedAt)
  const visible = await visibleRecordsInOrder(likes.map((like) => like.id))
  const slice = visible.slice(offset, offset + limit)
  const context = await loadAssembleContext(userId)
  return ok({ total: visible.length, pageNo, list: toAwemes(slice, context) })
})

router.get('/video/like/posters', async (ctx) => {
  const userId = requireUserId(ctx)
  const likes = (await userData(userId).likes.read()).slice().sort((a, b) => b.likedAt - a.likedAt)
  const records = await visibleRecordsInOrder(likes.map((like) => like.id))
  const context = await loadAssembleContext(userId)
  const posters: PosterItem[] = toPosters(records, context)
  const likedAt = new Map(likes.map((like) => [like.id, like.likedAt]))
  posters.forEach((poster) => (poster.likedAt = likedAt.get(poster.id)))
  return ok({ total: posters.length, list: posters })
})

router.post('/video/like', async (ctx) => {
  const userId = requireUserId(ctx)
  const id = String(ctx.body?.id ?? '')
  if (!id) throw new HttpError(400, '缺少视频 id')
  const doc = userData(userId).likes
  const likes = await doc.read()
  const existing = likes.find((like) => like.id === id)
  if (existing) {
    await doc.mutate((rows) => {
      const index = rows.findIndex((like) => like.id === id)
      if (index >= 0) rows.splice(index, 1)
    })
  } else {
    const record = await library.get(id)
    if (!record) throw new HttpError(404, '视频不存在')
    await doc.mutate((rows) => {
      rows.push({ id, likedAt: Date.now() })
    })
  }
  const liked = !existing
  return ok({ id, isLoved: liked, digg_count: liked ? 1 : 0 })
})

router.get('/video/history', async (ctx) => {
  const userId = requireUserId(ctx)
  const { offset, limit, pageNo } = pageOf(ctx)
  const rows = (await userData(userId).history.read()).slice().sort((a, b) => b.lastPlayedAt - a.lastPlayedAt)
  const visible = await visibleRecordsInOrder(rows.map((row) => row.id))
  const slice = visible.slice(offset, offset + limit)
  const context = await loadAssembleContext(userId)
  const awemes = toAwemes(slice, context)
  const positions = new Map(rows.map((row) => [row.id, row]))
  awemes.forEach((aweme) => {
    const row = positions.get(aweme.aweme_id)
    if (row) aweme.toktik.lastPositionSec = row.positionSec
  })
  return ok({ total: visible.length, pageNo, list: awemes })
})

router.get('/video/history/posters', async (ctx) => {
  const userId = requireUserId(ctx)
  const rows = (await userData(userId).history.read()).slice().sort((a, b) => b.lastPlayedAt - a.lastPlayedAt)
  const records = await visibleRecordsInOrder(rows.map((row) => row.id))
  const context = await loadAssembleContext(userId)
  const posters = toPosters(records, context)
  const map = new Map(rows.map((row) => [row.id, row]))
  posters.forEach((poster) => {
    const row = map.get(poster.id)
    if (!row) return
    poster.lastPlayedAt = row.lastPlayedAt
    poster.positionSec = row.positionSec
  })
  posters.sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0))
  return ok({ total: posters.length, list: posters })
})

router.post('/video/history', async (ctx) => {
  const userId = requireUserId(ctx)
  const id = String(ctx.body?.id ?? '')
  if (!id) throw new HttpError(400, '缺少视频 id')
  const positionSec = Math.max(0, num(ctx.body?.positionSec, 0))
  const once = Boolean(ctx.body?.once)
  const now = Date.now()
  await userData(userId).history.mutate((rows) => {
    const existing = rows.find((row) => row.id === id)
    if (existing) {
      existing.lastPlayedAt = now
      existing.positionSec = positionSec
      existing.playCount += once ? 1 : 0
    } else {
      rows.push({ id, lastPlayedAt: now, positionSec, playCount: once ? 1 : 0 })
    }
  })
  return ok({ id })
})

router.delete('/video/history', async (ctx) => {
  const userId = requireUserId(ctx)
  const id = String(ctx.body?.id ?? ctx.query.get('id') ?? ctx.params.id ?? '')
  const doc = userData(userId).history
  if (id) {
    await doc.mutate((rows) => {
      const index = rows.findIndex((row) => row.id === id)
      if (index >= 0) rows.splice(index, 1)
    })
    return ok({ cleared: 1 })
  }
  const count = (await doc.read()).length
  await doc.write([])
  return ok({ cleared: count })
})

router.get('/video/comments', async () => ok({ total: 0, list: [], has_more: 0 }))

router.get('/video/detail', async (ctx) => {
  const userId = requireUserId(ctx)
  const record = await library.get(String(ctx.query.get('id') ?? ''))
  if (!record || !isVideoVisible(record)) throw new HttpError(404, '视频不存在或已被禁用')
  const context = await loadAssembleContext(userId)
  return ok(toAweme(record, context))
})

router.post('/video/reprocess', async (ctx) => {
  const id = String(ctx.body?.id ?? '')
  if (!id) throw new HttpError(400, '缺少视频 id')
  await reprocessVideo(id)
  return ok({ id })
})

// ------------------------------------------------------------- 合集与搜索

router.get('/collection/list', async () => {
  const records = (await library.all()).filter((record) => isVideoVisible(record))
  const groups = new Map<string, VideoRecord[]>()
  for (const record of records) {
    const list = groups.get(record.collection) ?? []
    list.push(record)
    groups.set(record.collection, list)
  }
  const list: PosterItem[] = []
  for (const [name, items] of groups) {
    const first = items[0]
    list.push({
      id: 'collection:' + name,
      title: name,
      collection: name,
      episode: null,
      durationMs: items.reduce((total, item) => total + item.durationMs, 0),
      coverUrl: coverUrlFor(first),
      playable: items.some((item) => item.playable),
      mtime: Math.max(...items.map((item) => item.mtime)),
      size: items.reduce((total, item) => total + item.size, 0)
    })
  }
  list.sort((a, b) => a.title.localeCompare(b.title, 'zh'))
  return ok({ total: list.length, list })
})

router.get('/collection/videos', async (ctx) => {
  const userId = requireUserId(ctx)
  const name = String(ctx.query.get('name') ?? '')
  const records = (await library.all()).filter(
    (record) => isVideoVisible(record) && record.collection === name
  )
  records.sort((a, b) => {
    if (a.episode !== null && b.episode !== null && a.episode !== b.episode) {
      return a.episode - b.episode
    }
    return a.title.localeCompare(b.title, 'zh')
  })
  const context = await loadAssembleContext(userId)
  return ok({ total: records.length, list: toAwemes(records, context) })
})

router.get('/library/search', async (ctx) => {
  const userId = requireUserId(ctx)
  const query = String(ctx.query.get('q') ?? '').trim().toLowerCase()
  if (!query) return ok({ total: 0, list: [] })
  const records = (await library.all()).filter(
    (record) =>
      isVideoVisible(record) &&
      (record.title.toLowerCase().includes(query) || record.collection.toLowerCase().includes(query))
  )
  const context = await loadAssembleContext(userId)
  const posters = toPosters(records.slice(0, 200), context)
  return ok({ total: posters.length, list: posters })
})

router.get('/library/stats', async (ctx) => {
  const userId = requireUserId(ctx)
  const [allVideos, likes, historyRows, sourceRows] = await Promise.all([
    library.all(),
    userData(userId).likes.read(),
    userData(userId).history.read(),
    listSources()
  ])
  const present = allVideos.filter((record) => !record.missing)
  const enabled = present.filter((record) => isVideoEnabled(record))
  const disabled = present.filter((record) => !isVideoEnabled(record))
  const visibleIds = new Set(enabled.map((record) => record.id))
  const collections = new Set(enabled.map((record) => record.collection))
  return ok({
    videos: enabled.length,
    totalVideos: present.length,
    disabled: disabled.length,
    missing: allVideos.length - present.length,
    collections: collections.size,
    likes: likes.filter((like) => visibleIds.has(like.id)).length,
    history: historyRows.filter((row) => visibleIds.has(row.id)).length,
    sources: sourceRows.length,
    playable: enabled.filter((record) => record.playable).length,
    pendingMeta: enabled.filter((record) => record.metaStatus === 'pending').length,
    failedMeta: enabled.filter((record) => record.metaStatus === 'failed').length,
    totalBytes: enabled.reduce((total, record) => total + record.size, 0),
    totalDurationMs: enabled.reduce((total, record) => total + record.durationMs, 0),
    disabledBytes: disabled.reduce((total, record) => total + record.size, 0),
    disabledDurationMs: disabled.reduce((total, record) => total + record.durationMs, 0)
  })
})

// ---------------------------------------------------------------- 视频管理

router.get('/library/videos', async (ctx) => {
  const filter: Record<string, any> = {}
  ctx.query.forEach((value, key) => {
    filter[key] = value
  })
  const data = await queryManaged(
    filter,
    num(ctx.query.get('pageNo'), 0),
    num(ctx.query.get('pageSize'), 50)
  )
  return ok(data)
})

router.post('/library/videos/toggle', async (ctx) => {
  const id = String(ctx.body?.id ?? '')
  if (!id) throw new HttpError(400, '缺少视频 id')
  const data = await setVideoEnabled(id, Boolean(ctx.body?.enabled))
  if (!data) throw new HttpError(404, '视频不存在')
  return ok(data)
})

router.post('/library/videos/bulk', async (ctx) => {
  const enabled = Boolean(ctx.body?.enabled)
  const data = await applyEnabledToFilter(ctx.body?.filter ?? {}, enabled)
  return ok(data)
})

router.post('/library/reprocess-all', async () => ok({ updated: await reprocessAll() }))

router.post('/library/reset', async () => {
  dropAllDrivers()
  await library.clear()
  await covers.clear()
  await clearVariants()
  await import('../store').then((mod) => mod.sources.write([]))
  const userRows = await users.read()
  for (const user of userRows) {
    await userData(user.id).likes.write([])
    await userData(user.id).history.write([])
  }
  return ok({ ok: true })
})

// ------------------------------------------------------------ 省流画质

router.get('/media/variants/status', async () => ok(await getVariantStatus()))

router.post('/media/variants/clear', async () => ok(await clearVariants()))

// ---------------------------------------------------------------- 数据源

router.get('/source/list', async () => {
  const sourceRows = await listSources()
  const records = (await library.all()).filter((record) => !record.missing)
  const counts = new Map<string, number>()
  const disabledCounts = new Map<string, number>()
  for (const record of records) {
    counts.set(record.sourceId, (counts.get(record.sourceId) ?? 0) + 1)
    if (!isVideoEnabled(record)) {
      disabledCounts.set(record.sourceId, (disabledCounts.get(record.sourceId) ?? 0) + 1)
    }
  }
  return ok({
    total: sourceRows.length,
    list: sourceRows.map((source) => ({
      ...serializeSource(source),
      videoCount: counts.get(source.id) ?? 0,
      disabledCount: disabledCounts.get(source.id) ?? 0
    }))
  })
})

router.post('/source/save', async (ctx) => {
  const userId = requireUserId(ctx)
  const input = (ctx.body ?? {}) as Partial<Source> & { kind: SourceKind }
  if (!input?.kind) throw new HttpError(400, '缺少数据源类型')
  const config: Record<string, any> = { ...((input.config as Record<string, any>) ?? {}) }
  if (input.id && config.password === '••••••') {
    const existing = await getSource(input.id)
    config.password = (existing.config as Record<string, any>).password
  }
  switch (input.kind) {
    case 'local':
      if (!String(config.path ?? '').trim()) {
        throw new HttpError(400, '服务器目录需要填写绝对路径，例如 /mnt/media')
      }
      break
    case 'webdav':
      if (!String(config.baseUrl ?? '').trim()) throw new HttpError(400, 'WebDAV 需要填写服务器地址')
      break
    case 'ftp':
      if (!String(config.host ?? '').trim()) throw new HttpError(400, 'FTP 需要填写主机地址')
      config.port = num(config.port, 21)
      break
    case 'smb':
      if (!String(config.host ?? '').trim()) throw new HttpError(400, 'SMB 需要填写主机地址')
      if (!String(config.share ?? '').trim()) throw new HttpError(400, 'SMB 需要填写共享名')
      config.port = num(config.port, 445)
      break
    default:
      throw new HttpError(400, '未知的数据源类型')
  }
  const source = await saveSource(
    { ...input, config: config as unknown as Source['config'] },
    userId
  )
  return ok(serializeSource(source))
})

router.post('/source/delete', async (ctx) => {
  const id = String(ctx.body?.id ?? '')
  if (!id) throw new HttpError(400, '缺少数据源 id')
  await deleteSource(id)
  return ok({ id })
})

router.post('/source/toggle', async (ctx) => {
  const id = String(ctx.body?.id ?? '')
  const enabled = Boolean(ctx.body?.enabled)
  if (!id) throw new HttpError(400, '缺少数据源 id')
  const source = await getSource(id)
  const saved = await saveSource({ ...source, enabled })
  return ok(serializeSource(saved))
})

router.post('/source/scan', async (ctx) => {
  const id = ctx.body?.id ? String(ctx.body.id) : undefined
  void startScan(id ? [id] : undefined)
  return ok(getScanStatus())
})

router.get('/source/scan/status', async () => ok({ scan: getScanStatus(), meta: getMetaStatus() }))

router.post('/source/scan/cancel', async () => {
  cancelScan()
  cancelMeta()
  return ok(getScanStatus())
})

router.post('/source/purge-missing', async () => ok({ removed: await purgeMissing() }))

router.post('/source/test', async (ctx) => {
  const kind = String(ctx.body?.kind ?? 'webdav') as SourceKind
  const config: Record<string, any> = { ...(ctx.body?.config ?? {}) }
  const rootPath = normalizePath(ctx.body?.rootPath || '/')
  const id = String(ctx.body?.id ?? '')
  if (id && config.password === '••••••') {
    const existing = await getSource(id)
    config.password = (existing.config as Record<string, any>).password
  }
  const probe: Source = {
    id: 'probe_' + Date.now().toString(36),
    name: 'probe',
    kind,
    rootPath,
    config: config as unknown as Source['config'],
    enabled: true,
    createdAt: Date.now()
  }
  try {
    const entries = await buildDriver(probe).list('/')
    return ok({
      ok: true,
      rootPath,
      total: entries.length,
      dirs: entries.filter((entry) => entry.isDir).length,
      files: entries.filter((entry) => !entry.isDir).length,
      names: entries.slice(0, 6).map((entry) => entry.name)
    })
  } catch (err) {
    return ok({ ok: false, error: describeSourceError(kind, err) })
  }
})

// ------------------------------------------------------------ 偏好与用户

router.get('/prefs/get', async (ctx) => ok(await readPrefs(requireUserId(ctx))))

router.post('/prefs/set', async (ctx) => {
  const userId = requireUserId(ctx)
  const prefs = await writePrefs(userId, ctx.body ?? {})
  return ok(prefs)
})

router.get('/user/panel', async (ctx) => ok(await userPanel(ctx.user as UserRecord)))

router.get('/user/friends', async () => ok([]))

router.get('/user/collect', async (ctx) => {
  const userId = requireUserId(ctx)
  const [likes, allVideos] = await Promise.all([userData(userId).likes.read(), library.all()])
  const visible = allVideos.filter((record) => isVideoVisible(record))
  const visibleIds = new Set(visible.map((record) => record.id))
  const collections = new Set(visible.map((record) => record.collection))
  return ok({
    video: { total: likes.filter((like) => visibleIds.has(like.id)).length, list: [] },
    music: { total: collections.size, list: [] }
  })
})

router.get('/feed/refresh', async (ctx) => ok({ seed: await rotateFeedSeed(requireUserId(ctx)) }))

/** 解析请求的会话；供 HTTP 入口复用 */
export async function resolveRequestUser(token: string | null): Promise<UserRecord | null> {
  return resolveSession(token)
}

export type { PublicUser }
