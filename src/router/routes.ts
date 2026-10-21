import type { RouteRecordRaw } from 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    /** 页面层级：只用于决定转场方向（深层右进、浅层右出、同层淡入），不参与业务 */
    depth?: number
  }
}

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/home' },
  { path: '/login', component: () => import('@/pages/login/Login.vue'), meta: { depth: 0 } },
  { path: '/onboarding', component: () => import('@/pages/onboarding/Onboarding.vue'), meta: { depth: 0 } },

  { path: '/home', component: () => import('@/pages/home/index.vue'), meta: { depth: 1 } },
  { path: '/collections', component: () => import('@/pages/collections/Collections.vue'), meta: { depth: 1 } },
  { path: '/likes', component: () => import('@/pages/likes/Likes.vue'), meta: { depth: 1 } },
  { path: '/history', component: () => import('@/pages/history/History.vue'), meta: { depth: 2 } },
  { path: '/me', component: () => import('@/pages/me/Me.vue'), meta: { depth: 1 } },

  { path: '/sources', component: () => import('@/pages/sources/Sources.vue'), meta: { depth: 3 } },
  { path: '/sources/edit', component: () => import('@/pages/sources/SourceEdit.vue'), meta: { depth: 4 } },
  {
    path: '/library/videos',
    component: () => import('@/pages/library/VideoManager.vue'),
    meta: { depth: 4 }
  },
  { path: '/settings', component: () => import('@/pages/settings/Settings.vue'), meta: { depth: 2 } },
  { path: '/search', component: () => import('@/pages/search/Search.vue'), meta: { depth: 2 } },

  {
    path: '/video-detail',
    name: 'video-detail',
    component: () => import('@/pages/other/VideoDetail.vue'),
    meta: { depth: 3 }
  },
  { path: '/:pathMatch(.*)*', redirect: '/home' }
]

export default routes
