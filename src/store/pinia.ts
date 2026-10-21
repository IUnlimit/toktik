import { defineStore } from 'pinia'
import { collectionList, libraryStats, userinfo } from '@/api/user'
import { sourceList, scanStatus, getPrefs, setPrefs } from '@/api/source'
import type { SourceRow } from '@/api/source'
import { currentUser, login, logout, register, serverHealth } from '@/api/auth'
import type { AuthStatus } from '@/api/auth'
import type { Prefs, PublicUser } from '@shared/types'

/** 播放偏好的本地默认值；服务端返回后会覆盖 */
export const DEFAULT_PREFS: Prefs = {
  autoMute: true,
  rememberPosition: true,
  quality: 'auto',
  preloadAhead: 2
}

export interface Stats {
  /** 已启用且未失效 */
  videos: number
  /** 未失效总数（含已禁用） */
  totalVideos: number
  /** 未失效但已禁用 */
  disabled: number
  missing: number
  collections: number
  likes: number
  history: number
  sources: number
  playable: number
  pendingMeta: number
  failedMeta: number
  totalBytes: number
  totalDurationMs: number
  disabledBytes: number
  disabledDurationMs: number
}

const EMPTY_STATS: Stats = {
  videos: 0,
  totalVideos: 0,
  disabled: 0,
  missing: 0,
  collections: 0,
  likes: 0,
  history: 0,
  sources: 0,
  playable: 0,
  pendingMeta: 0,
  failedMeta: 0,
  totalBytes: 0,
  totalDurationMs: 0,
  disabledBytes: 0,
  disabledDurationMs: 0
}

/**
 * 会话探测 / 首屏数据加载的并发去重。
 * 路由守卫、App.vue 与各页面 onMounted 都会触发，必须合并成一次请求。
 */
let booting: Promise<PublicUser | null> | null = null
let initing: Promise<void> | null = null

export const useBaseStore = defineStore('base', {
  state: () => {
    return {
      bodyHeight: document.body.clientHeight,
      bodyWidth: document.body.clientWidth,
      maskDialog: false,
      maskDialogMode: 'dark',
      judgeValue: 20,
      homeRefresh: 60,
      loading: false,
      version: '0.1.0',
      users: [] as any[],
      userinfo: {
        uid: 'toktik-local',
        nickname: '本地放映员',
        unique_id: 'toktik',
        signature: '所有视频都在我自己的硬盘上',
        avatar_168x168: { url_list: [] as string[] },
        avatar_300x300: { url_list: [] as string[] },
        aweme_count: 0,
        follower_count: 0,
        total_favorited: 0
      } as any,
      stats: { ...EMPTY_STATS } as Stats,
      sources: [] as SourceRow[],
      routeData: null as any,
      ready: false,
      /** 当前登录账号（未登录为 null） */
      user: null as PublicUser | null,
      /** 服务器状态：是否已有账号 / 是否开放注册 */
      authStatus: null as AuthStatus | null,
      /** 服务端 ffmpeg 是否可用（不可用时封面走兜底） */
      ffmpeg: true,
      /** 账号级播放偏好（自动静音、记忆进度、画质、预加载条数） */
      prefs: { ...DEFAULT_PREFS } as Prefs,
      /** 会话纪元：退出 / 换账号时自增，用于丢弃过期的在途请求结果 */
      sessionEpoch: 0,
      /** 会话探测是否已完成 */
      authReady: false,
      scanning: false,
      metaRunning: false
    }
  },
  getters: {
    authenticated(state) {
      return Boolean(state.user)
    },
    hasLibrary(state) {
      return state.stats.totalVideos > 0
    },
    emptyLibrary(state) {
      return state.sources.length === 0 || state.stats.totalVideos === 0
    }
  },
  actions: {
    /** 会话探测：服务器状态 + 当前账号；不触发跳转，由路由守卫决定 */
    async bootstrap(): Promise<PublicUser | null> {
      if (this.authReady) return this.user
      if (!booting) {
        booting = this.runBootstrap().finally(() => {
          booting = null
        })
      }
      return booting
    },
    async runBootstrap(): Promise<PublicUser | null> {
      const epoch = this.sessionEpoch
      const health = await serverHealth()
      if (epoch !== this.sessionEpoch) return this.user
      if (health.success && health.data) {
        this.authStatus = {
          hasUsers: health.data.hasUsers,
          allowRegister: health.data.allowRegister,
          version: health.data.version
        }
        this.ffmpeg = health.data.ffmpeg !== false
        this.version = health.data.version || this.version
      }
      if (!this.authStatus?.hasUsers) {
        this.user = null
        this.authReady = true
        return null
      }
      const me = await currentUser()
      if (epoch !== this.sessionEpoch) return this.user
      this.user = me.success && me.data ? me.data : null
      this.authReady = true
      return this.user
    },
    /** 登录/注册成功后载入该账号的浏览数据 */
    async onAuthenticated(user: PublicUser) {
      this.user = user
      this.authReady = true
      this.ready = false
      await this.init()
    },
    async init(): Promise<void> {
      if (this.ready && this.user) return
      if (!initing) {
        initing = this.runInit().finally(() => {
          initing = null
        })
      }
      return initing
    },
    async runInit(): Promise<void> {
      if (!this.authReady) await this.bootstrap()
      if (!this.user) {
        this.ready = false
        return
      }
      const epoch = this.sessionEpoch
      await Promise.all([this.loadUser(), this.loadStats(), this.loadSources(), this.loadPrefs()])
      if (epoch !== this.sessionEpoch) return
      this.ready = true
    },
    /** 退出登录：清空本地状态后整页回到登录页（顺带丢弃 keep-alive 缓存） */
    async signOut() {
      await logout()
      this.clearSession()
      window.location.replace('/login')
    },
    /** 只清理内存态；跳转由调用方负责 */
    clearSession() {
      this.sessionEpoch++
      booting = null
      initing = null
      this.user = null
      this.authReady = true
      this.ready = false
      this.stats = { ...EMPTY_STATS }
      this.sources = []
      this.prefs = { ...DEFAULT_PREFS }
      this.userinfo = {
        ...this.userinfo,
        nickname: '',
        unique_id: '',
        signature: '',
        uid: ''
      }
    },
    async signIn(username: string, password: string) {
      const res = await login(username, password)
      if (!res.success || !res.data) return res
      this.authStatus = { ...(this.authStatus ?? { hasUsers: true, allowRegister: false, version: this.version }), hasUsers: true }
      await this.onAuthenticated(res.data)
      return res
    },
    async signUp(username: string, password: string, nickname?: string) {
      const res = await register(username, password, nickname)
      if (!res.success || !res.data) return res
      this.authStatus = {
        ...(this.authStatus ?? { hasUsers: true, allowRegister: false, version: this.version }),
        hasUsers: true
      }
      await this.onAuthenticated(res.data)
      return res
    },
    async loadUser() {
      const res: any = await userinfo()
      if (res.success && res.data) {
        this.userinfo = { ...this.userinfo, ...res.data }
      }
    },
    async loadStats() {
      const res: any = await libraryStats()
      if (res.success && res.data) {
        this.stats = { ...EMPTY_STATS, ...res.data }
      }
      return this.stats
    },
    async loadSources() {
      const res: any = await sourceList()
      if (res.success && res.data) {
        this.sources = res.data.list ?? []
      }
      return this.sources
    },
    /** 账号级播放偏好；各页面与播放器共享，避免每个视频实例各请求一次 */
    async loadPrefs() {
      const res: any = await getPrefs()
      if (res.success && res.data) {
        this.prefs = { ...DEFAULT_PREFS, ...res.data }
        window.isMuted = this.prefs.autoMute !== false
      }
      return this.prefs
    },
    async savePrefs(patch: Partial<Prefs>) {
      const res: any = await setPrefs(patch)
      if (res.success && res.data) {
        this.prefs = { ...DEFAULT_PREFS, ...res.data }
      } else {
        this.prefs = { ...this.prefs, ...patch }
      }
      return this.prefs
    },
    async loadCollections() {
      const res: any = await collectionList()
      return res.success ? (res.data?.list ?? []) : []
    },
    async refreshAll() {
      await Promise.all([this.loadStats(), this.loadSources()])
    },
    async pollScanOnce() {
      const res: any = await scanStatus()
      if (res.success && res.data) {
        this.scanning = Boolean(res.data.scan?.running)
        this.metaRunning = Boolean(res.data.meta?.running)
        return res.data
      }
      return null
    },
    setUserinfo(val: any) {
      this.userinfo = { ...this.userinfo, ...val }
    },
    setMaskDialog(val: { state: boolean; mode?: string }) {
      this.maskDialog = val.state
      if (val.mode) this.maskDialogMode = val.mode
    }
  }
})
