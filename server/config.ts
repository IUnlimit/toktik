import path from 'node:path'

function intEnv(name: string, fallback: number): number {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

export const VERSION = '0.2.0'

/** HTTP 监听端口 */
export const PORT = intEnv('PORT', intEnv('TOKTIK_PORT', 8787))
export const HOST = process.env.HOST || process.env.TOKTIK_HOST || '0.0.0.0'

/** 持久化目录（账号、索引、封面、喜欢/历史） */
export const DATA_DIR = path.resolve(process.env.TOKTIK_DATA || 'data')

/** 前端构建产物目录；开发模式下由 vite 托管，不存在时后端只提供 /api */
export const DIST_DIR = path.resolve(process.env.TOKTIK_DIST || 'dist')

/** 是否允许新账号注册（首个账号始终可以创建；默认关闭，避免公网被任意注册） */
export const ALLOW_REGISTER = process.env.TOKTIK_ALLOW_REGISTER === '1'

/** 反向代理终结 HTTPS 时置 1，让会话 Cookie 带上 Secure */
export const SECURE_COOKIE = process.env.TOKTIK_SECURE_COOKIE === '1'

/** 会话有效期（滑动续期） */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

export const FFMPEG_BIN = process.env.TOKTIK_FFMPEG || process.env.FFMPEG_PATH || 'ffmpeg'
export const FFPROBE_BIN = process.env.TOKTIK_FFPROBE || process.env.FFPROBE_PATH || 'ffprobe'
