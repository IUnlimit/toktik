import { request } from '@/utils/request'
import type { PublicUser } from '@shared/types'

export interface AuthStatus {
  hasUsers: boolean
  allowRegister: boolean
  version: string
}

export interface HealthInfo extends AuthStatus {
  ok: boolean
  ffmpeg: boolean
}

/** 服务器状态：是否已有账号、是否开放注册、ffmpeg 是否可用 */
export function serverHealth() {
  return request<HealthInfo>({ url: '/health', method: 'get' })
}

export function authStatus() {
  return request<AuthStatus>({ url: '/auth/status', method: 'get' })
}

export function currentUser() {
  return request<PublicUser>({ url: '/auth/me', method: 'get' })
}

export function login(username: string, password: string) {
  return request<PublicUser>({ url: '/auth/login', method: 'post', data: { username, password } })
}

export function register(username: string, password: string, nickname?: string) {
  return request<PublicUser>({
    url: '/auth/register',
    method: 'post',
    data: { username, password, nickname }
  })
}

export function logout() {
  return request<{ ok: boolean }>({ url: '/auth/logout', method: 'post' })
}

export function updateProfile(payload: { nickname?: string; signature?: string }) {
  return request<PublicUser>({ url: '/auth/profile', method: 'post', data: payload })
}

export function changePassword(oldPassword: string, newPassword: string) {
  return request<{ ok: boolean }>({
    url: '/auth/password',
    method: 'post',
    data: { oldPassword, newPassword }
  })
}
