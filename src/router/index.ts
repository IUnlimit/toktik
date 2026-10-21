import { createRouter, createWebHistory } from 'vue-router'
import routes from './routes'
import { updatePageTransition } from '@/utils/transition'

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    return { top: 0 }
  }
})

/** 首次导航时探测会话；后续导航直接读 store（bootstrap 内部已做并发去重） */
let booting: Promise<boolean> | null = null

async function ensureSession(): Promise<boolean> {
  const { useBaseStore } = await import('@/store/pinia')
  const store = useBaseStore()
  if (store.authReady) return Boolean(store.user)

  booting ??= store
    .bootstrap()
    .then(() => Boolean(store.user))
    .finally(() => {
      booting = null
    })
  return booting
}

/** 只接受站内路径，且不允许把登录页本身当作回跳目标（历史 bug 会留下嵌套 redirect） */
function safeRedirect(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (!value.startsWith('/') || value.startsWith('//')) return null
  if (value === '/login' || value.startsWith('/login?') || value.startsWith('/login/')) return null
  return value
}

/**
 * 转场方向只依赖路由 meta.depth，页面统一由 App.vue 的 keep-alive 缓存。
 * 登录守卫放在转场更新之后，保证跳登录页时也有正常的转场。
 */
router.beforeEach(async (to, from) => {
  updatePageTransition(to, from)

  const authenticated = await ensureSession()
  if (!authenticated && to.path !== '/login') {
    return { path: '/login', query: { redirect: safeRedirect(to.fullPath) ?? '/home' } }
  }
  if (authenticated && to.path === '/login') {
    return { path: safeRedirect(to.query.redirect) ?? '/home' }
  }
})

export default router
