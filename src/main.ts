import { createApp } from 'vue'
import App from './App.vue'
import './assets/less/index.less'
// 转场样式单独引入：index.less 会被部分组件的 scoped style 内联，
// 放进去会让整套转场规则被复制进每个组件的作用域
import './assets/less/transition.less'
import router from './router'
import routes from './router/routes'
import mixin from './utils/mixin'
import VueLazyload from '@jambonn/vue-lazyload'
import { createPinia } from 'pinia'
import { useClick } from '@/utils/hooks/useClick'
import bus, { EVENT_KEY } from '@/utils/bus'

window.isMoved = false
window.isMuted = true
window.showMutedNotice = true

HTMLElement.prototype.addEventListener = new Proxy(HTMLElement.prototype.addEventListener, {
  apply(target, ctx, args) {
    const eventName = args[0]
    const listener = args[1]
    if (listener instanceof Function && eventName === 'click') {
      args[1] = new Proxy(listener, {
        apply(target1, ctx1, args1) {
          // 滑动过程中产生的 click 不应触发业务
          if (window.isMoved) return
          try {
            return target1.apply(ctx1, args1)
          } catch (e) {
            console.error(`[proxyPlayerEvent][${eventName}]`, listener, e)
          }
        }
      })
    }
    return target.apply(ctx, args)
  }
})

const vClick = useClick()
const pinia = createPinia()
const app = createApp(App)
app.mixin(mixin)
app.use(VueLazyload, {
  preLoad: 1.3,
  attempt: 1
})
app.use(pinia)
app.use(router)
app.mount('#app')
app.directive('click', vClick)

/**
 * 页面都是懒加载的。首屏空闲后把路由 chunk 预取一遍，
 * 避免第一次点进详情/设置时出现"转场先播、内容后到"的白屏。
 */
function prefetchRoutes() {
  for (const record of routes) {
    const component = 'component' in record ? record.component : undefined
    if (typeof component === 'function') void (component as () => unknown)()
  }
}

const scheduleIdle = (cb: () => void) => {
  const idle = (window as any).requestIdleCallback
  if (typeof idle === 'function') {
    idle(cb, { timeout: 2000 })
  } else {
    window.setTimeout(cb, 1000)
  }
}

void router.isReady().then(() => scheduleIdle(prefetchRoutes))

setTimeout(() => {
  bus.emit(EVENT_KEY.HIDE_MUTED_NOTICE)
  window.showMutedNotice = false
}, 2000)
bus.on(EVENT_KEY.REMOVE_MUTED, () => {
  window.isMuted = false
})
