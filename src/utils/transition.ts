import { ref } from 'vue'
import type { RouteLocationNormalized } from 'vue-router'

export type PageTransitionName = 'page-forward' | 'page-back' | 'page-fade'

/** 当前路由转场名，由 router 守卫在每次导航确认前更新 */
export const pageTransition = ref<PageTransitionName>('page-fade')

/**
 * 根据路由 meta.depth 决定转场方向：
 * - 更深：前进（新页从右滑入，旧页轻微左移压暗）
 * - 更浅：后退（新页从左侧滑入，旧页右移退出）
 * - 同层：轻淡入（底部 tab 互切）
 *
 * 用真实层级而不是 routes 数组下标，避免 /settings -> /sources 这类跳转被误判成后退。
 */
export function updatePageTransition(
  to: RouteLocationNormalized,
  from: RouteLocationNormalized
): void {
  // 首次导航（from 为 START_LOCATION）没有方向可言
  if (!from.matched.length) {
    pageTransition.value = 'page-fade'
    return
  }
  const toDepth = Number(to.meta.depth ?? 1)
  const fromDepth = Number(from.meta.depth ?? 1)
  if (toDepth > fromDepth) {
    pageTransition.value = 'page-forward'
  } else if (toDepth < fromDepth) {
    pageTransition.value = 'page-back'
  } else {
    pageTransition.value = 'page-fade'
  }
}
