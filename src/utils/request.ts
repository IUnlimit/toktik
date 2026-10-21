import axios, { type AxiosError, type AxiosRequestConfig, type AxiosResponse } from 'axios'
import config from '@/config'
import { _notice } from './index'

/** 同源 /api 请求；会话走 HttpOnly Cookie，浏览器不持有任何信源凭据 */
export const axiosInstance = axios.create({
  baseURL: config.baseUrl,
  timeout: 120000,
  withCredentials: true
})

axiosInstance.interceptors.request.use(
  (cfg) => {
    if (!cfg.headers['Content-Type']) {
      cfg.headers['Content-Type'] = 'application/json'
    }
    return cfg
  },
  (error) => Promise.reject(error)
)

/**
 * 会话探测类接口：401 表示「当前没有登录态」而不是「登录态刚刚失效」。
 * 这类请求绝不能触发整页跳转，否则首屏每次加载都会再跳一次。
 */
function isSessionProbe(url?: string): boolean {
  if (!url) return false
  return /\/auth\/(me|status|login|register|logout)$/.test(url) || /\/health$/.test(url)
}

const REDIRECT_GUARD_KEY = 'toktik:auth-redirect-at'
/** 本次页面生命周期内是否已经发起过整页跳转（防止并发 401 重复刷新） */
let redirecting = false

function onLoginPage(): boolean {
  const path = window.location.pathname.replace(/\/+$/, '') || '/'
  return path === '/login'
}

/**
 * 登录态失效时清理前端状态并整页回到登录页。
 * 用整页跳转丢弃 keep-alive 里的旧账号页面缓存。
 *
 * 注意：这里必须用 location.pathname 判断是否已在登录页，而不能依赖
 * router.currentRoute —— 首屏导航完成之前它仍是起始位置（'/'），
 * 会让登录页反复整页刷新，形成无限重定向。
 */
async function redirectToLogin(msg?: string) {
  if (redirecting || onLoginPage()) return

  const now = Date.now()
  let last = 0
  try {
    last = Number(sessionStorage.getItem(REDIRECT_GUARD_KEY) || 0)
  } catch {
    last = 0
  }
  // 整页重载后 sessionStorage 仍然保留：2 秒内不重复跳转，彻底切断刷新循环
  if (Number.isFinite(last) && now - last < 2000) return
  try {
    sessionStorage.setItem(REDIRECT_GUARD_KEY, String(now))
  } catch {
    /* 隐私模式下可能不可用，忽略 */
  }

  redirecting = true
  try {
    const { useBaseStore } = await import('@/store/pinia')
    useBaseStore().clearSession()
  } catch {
    /* store 尚未初始化时忽略 */
  }
  if (msg) _notice(msg)
  const from = window.location.pathname + window.location.search
  const target = !from.startsWith('/') || from.startsWith('/login') ? '/home' : from
  window.location.replace('/login?redirect=' + encodeURIComponent(target))
}

/**
 * 统一的 401 处理：
 * - 前端还没确认登录（首屏探测、登录页刷新）→ 只清理内存态，跳转交给路由守卫；
 * - 前端确认已登录（会话刚刚失效）→ 提示并整页回登录页。
 */
async function handleUnauthorized(msg?: string) {
  let store: any = null
  try {
    const { useBaseStore } = await import('@/store/pinia')
    store = useBaseStore()
  } catch {
    /* ignore */
  }
  if (!store || !store.authReady || !store.user) {
    store?.clearSession()
    return
  }
  await redirectToLogin(msg || '登录已过期，请重新登录')
}

axiosInstance.interceptors.response.use(
  (response: AxiosResponse) => {
    const { data } = response
    if (data === undefined || data === null || data === '') {
      // 2xx 但没有响应体：这是正常的空结果，不是错误
      return { code: 200, msg: '', data: null }
    } else if (typeof data === 'string') {
      return { success: true, code: 200, data }
    } else {
      if (data.data === undefined || data.data === null) {
        data.data = { ...data }
      }
      let resCode = data.code
      if (resCode) {
        try {
          resCode = Number(resCode)
        } catch (e) {
          data.code = resCode = 500
          data.success = false
        }
        if (resCode === 0) {
          data.code = resCode = 200
          data.success = true
        }
        if (resCode !== 200) {
          _notice(data.msg || '请求失败，请稍后重试！')
        } else {
          data.success = true
        }
      } else {
        data.code = 200
        data.success = true
      }
      return data
    }
  },
  (error: AxiosError) => {
    const status = error.response?.status
    const data: any = error.response?.data

    if (status === 401) {
      // 401 统一交给会话失效逻辑处理，不再弹通用错误提示
      if (!isSessionProbe(error.config?.url)) void handleUnauthorized(data?.msg)
      return { success: false, code: 401, msg: data?.msg || '未登录', data: data ?? [] }
    }

    if (data && typeof data === 'object') {
      if (data.data === undefined || data.data === null) data.data = { ...data }
      if (status === 404) _notice(data.msg || '接口不存在')
      else if (status && status >= 500) _notice(data.msg || '服务器出现错误')
      else if (status === 400) _notice(data.msg || '参数不正确')
      else if (status !== 401) _notice(data.msg || '请求失败，请稍后重试！')
      return { success: false, code: status ?? 500, msg: data.msg, data }
    }
    if (status === undefined) {
      _notice('无法连接服务器，请确认后端已启动')
      return { success: false, code: 0, msg: '无法连接服务器', data: [] }
    }
    _notice('请求失败')
    return { success: false, code: status, msg: '请求失败', data: [] }
  }
)

export interface ApiResponse<T = any> {
  data: T
  success: boolean
  code?: number
  msg?: string
}

export async function request<T = any>(cfg: AxiosRequestConfig): Promise<ApiResponse<T>> {
  return axiosInstance
    .request<T>(cfg)
    .then((res: any) => {
      // 响应拦截器的失败分支返回的是普通对象，axios 会把它当成 resolved 值；
      // 这里必须原样透传，否则 401/500 会被包装成 success:true 骗过调用方。
      if (res && typeof res === 'object' && res.success === false) {
        return res as ApiResponse<T>
      }
      return { success: true, data: res?.data } as unknown as ApiResponse<T>
    })
    .catch((err) => {
      return { success: false, data: err } as unknown as ApiResponse<T>
    })
}
