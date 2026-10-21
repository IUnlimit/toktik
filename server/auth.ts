import crypto from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import { sessions, users, type SessionRecord, type UserRecord } from './store'
import { SECURE_COOKIE, SESSION_TTL_MS } from './config'
import type { PublicUser } from '../shared/types'

export const COOKIE_NAME = 'toktik_sid'

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

export class AuthError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
  }
}

export function hashPassword(password: string): { salt: string; hash: string } {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64, SCRYPT).toString('hex')
  return { salt, hash }
}

export function verifyPassword(password: string, salt: string, hash: string): boolean {
  let candidate: Buffer
  try {
    candidate = crypto.scryptSync(password, salt, 64, SCRYPT)
  } catch {
    return false
  }
  const expected = Buffer.from(hash, 'hex')
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected)
}

export function publicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    signature: user.signature,
    createdAt: user.createdAt
  }
}

function normalizeUsername(username: string): string {
  return String(username ?? '').trim()
}

export function validateUsername(username: string): string | null {
  if (!/^[A-Za-z0-9_.-]{3,32}$/.test(username)) {
    return '用户名需为 3-32 位字母、数字、下划线、点或短横线'
  }
  return null
}

export function validatePassword(password: string): string | null {
  if (typeof password !== 'string' || password.length < 6) return '密码至少 6 位'
  if (password.length > 200) return '密码过长'
  return null
}

export async function findByUsername(username: string): Promise<UserRecord | undefined> {
  const target = normalizeUsername(username).toLowerCase()
  const all = await users.read()
  return all.find((u) => u.username.toLowerCase() === target)
}

export async function createUser(input: {
  username: string
  password: string
  nickname?: string
}): Promise<UserRecord> {
  const username = normalizeUsername(input.username)
  const usernameError = validateUsername(username)
  if (usernameError) throw new AuthError(400, usernameError)
  const passwordError = validatePassword(input.password)
  if (passwordError) throw new AuthError(400, passwordError)
  if (await findByUsername(username)) throw new AuthError(409, '该用户名已被注册')

  const { salt, hash } = hashPassword(input.password)
  const now = Date.now()
  const record: UserRecord = {
    id: 'usr_' + crypto.randomBytes(8).toString('hex'),
    username,
    nickname: (input.nickname ?? '').trim().slice(0, 32) || username,
    signature: '所有视频都在我自己的服务器上',
    createdAt: now,
    updatedAt: now,
    salt,
    passwordHash: hash
  }
  await users.mutate((all) => {
    all.push(record)
  })
  return record
}

export async function verifyCredentials(username: string, password: string): Promise<UserRecord> {
  const user = await findByUsername(username)
  if (!user) throw new AuthError(401, '用户名或密码不正确')
  if (!verifyPassword(String(password ?? ''), user.salt, user.passwordHash)) {
    throw new AuthError(401, '用户名或密码不正确')
  }
  return user
}

export async function createSession(userId: string): Promise<SessionRecord> {
  const now = Date.now()
  const record: SessionRecord = {
    token: crypto.randomBytes(32).toString('base64url'),
    userId,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
    lastSeenAt: now
  }
  await sessions.mutate((all) => {
    all.push(record)
  })
  return record
}

export async function destroySession(token: string): Promise<void> {
  await sessions.mutate((all) => {
    const index = all.findIndex((row) => row.token === token)
    if (index >= 0) all.splice(index, 1)
  })
}

export async function destroyUserSessions(userId: string, exceptToken?: string): Promise<void> {
  await sessions.mutate((all) => {
    for (let i = all.length - 1; i >= 0; i--) {
      if (all[i].userId === userId && all[i].token !== exceptToken) all.splice(i, 1)
    }
  })
}

export async function resolveSession(token: string | null): Promise<UserRecord | null> {
  if (!token) return null
  const rows = await sessions.read()
  const session = rows.find((row) => row.token === token)
  if (!session) return null
  if (session.expiresAt <= Date.now()) {
    await destroySession(token)
    return null
  }
  const user = (await users.read()).find((row) => row.id === session.userId)
  if (!user) {
    await destroySession(token)
    return null
  }
  // 滑动续期：每小时最多落盘一次，避免每个请求都写 sessions.json
  if (Date.now() - session.lastSeenAt > 60 * 60 * 1000) {
    await sessions.mutate((all) => {
      const row = all.find((item) => item.token === token)
      if (!row) return
      row.lastSeenAt = Date.now()
      row.expiresAt = Date.now() + SESSION_TTL_MS
    })
  }
  return user
}

export async function pruneSessions(): Promise<void> {
  const now = Date.now()
  const rows = await sessions.read()
  if (!rows.some((row) => row.expiresAt <= now)) return
  await sessions.mutate((all) => {
    for (let i = all.length - 1; i >= 0; i--) {
      if (all[i].expiresAt <= now) all.splice(i, 1)
    }
  })
}

export async function changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
  const user = (await users.read()).find((row) => row.id === userId)
  if (!user) throw new AuthError(404, '账号不存在')
  if (!verifyPassword(String(oldPassword ?? ''), user.salt, user.passwordHash)) {
    throw new AuthError(400, '原密码不正确')
  }
  const error = validatePassword(newPassword)
  if (error) throw new AuthError(400, error)
  const { salt, hash } = hashPassword(newPassword)
  await users.mutate((all) => {
    const row = all.find((item) => item.id === userId)
    if (!row) return
    row.salt = salt
    row.passwordHash = hash
    row.updatedAt = Date.now()
  })
}

export async function updateProfile(
  userId: string,
  patch: { nickname?: string; signature?: string }
): Promise<UserRecord> {
  const nickname = patch.nickname === undefined ? undefined : String(patch.nickname).trim().slice(0, 32)
  if (nickname !== undefined && !nickname) throw new AuthError(400, '昵称不能为空')
  const signature =
    patch.signature === undefined ? undefined : String(patch.signature).trim().slice(0, 120)
  await users.mutate((all) => {
    const row = all.find((item) => item.id === userId)
    if (!row) return
    if (nickname !== undefined) row.nickname = nickname
    if (signature !== undefined) row.signature = signature
    row.updatedAt = Date.now()
  })
  const user = (await users.read()).find((row) => row.id === userId)
  if (!user) throw new AuthError(404, '账号不存在')
  return user
}

// --------------------------------------------------------------- Cookie

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index < 0) continue
    const key = part.slice(0, index).trim()
    if (!key) continue
    const value = part.slice(index + 1).trim()
    try {
      out[key] = decodeURIComponent(value)
    } catch {
      out[key] = value
    }
  }
  return out
}

/** 从请求中取会话 token：优先 Authorization: Bearer，其次 Cookie */
export function tokenFromRequest(req: IncomingMessage): string | null {
  const header = req.headers.authorization
  if (header && header.toLowerCase().startsWith('bearer ')) {
    const token = header.slice(7).trim()
    if (token) return token
  }
  const cookie = parseCookies(req.headers.cookie)[COOKIE_NAME]
  return cookie || null
}

function isSecureRequest(req?: IncomingMessage): boolean {
  if (SECURE_COOKIE) return true
  const proto = String(req?.headers['x-forwarded-proto'] ?? '')
  return proto.split(',')[0].trim() === 'https'
}

export function sessionCookie(token: string, req?: IncomingMessage): string {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000)
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`
  ]
  if (isSecureRequest(req)) parts.push('Secure')
  return parts.join('; ')
}

export function clearSessionCookie(req?: IncomingMessage): string {
  const parts = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0']
  if (isSecureRequest(req)) parts.push('Secure')
  return parts.join('; ')
}

/** 媒体 URL 的短时效签名（供 ffmpeg 在服务端进程内读取自身流） */
export function signMediaPath(secret: Buffer, videoId: string, expires: number): string {
  const payload = `${videoId}:${expires}`
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url')
}

export function verifyMediaSignature(
  secret: Buffer,
  videoId: string,
  expires: number,
  signature: string
): boolean {
  if (!Number.isFinite(expires) || expires < Date.now()) return false
  const expected = Buffer.from(signMediaPath(secret, videoId, expires))
  const actual = Buffer.from(String(signature ?? ''))
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
}
