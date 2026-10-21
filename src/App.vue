<template>
  <router-view v-slot="{ Component }">
    <transition :name="pageTransition">
      <keep-alive>
        <component :is="Component" />
      </keep-alive>
    </transition>
  </router-view>
</template>
<script setup lang="ts">
/*
* try {navigator.control.gesture(false);} catch (e) {} //UC浏览器关闭默认手势事件
* try {navigator.control.longpressMenu(false);} catch (e) {} //关闭长按弹出菜单
* */
import { useBaseStore } from '@/store/pinia'
import { onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { pageTransition } from '@/utils/transition'
import bus, { EVENT_KEY } from '@/utils/bus'

const store = useBaseStore()
const route = useRoute()

// 路由切换时收起全局遮罩
watch(
  () => route.path,
  () => {
    store.setMaskDialog({ state: false, mode: store.maskDialogMode })
  }
)

let rafId = 0

/**
 * 视口尺寸变化后只重算 --vh。
 * 这里原本是 location.href 整页跳转（开关 DevTools、拖动窗口都会触发），
 * 会把路由状态、播放进度、滚动位置全部丢掉；尺寸重排交给 slide 组件自己的 ResizeObserver。
 */
function syncViewport() {
  rafId = 0
  document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`)
}

function onViewportChange() {
  if (rafId) return
  rafId = requestAnimationFrame(syncViewport)
}

/**
 * 全屏元素被移除（例如正在全屏的条目被 slide 窗口卸载）时，
 * 组件自身可能已经来不及广播，这里兜底恢复页面外壳。
 */
function onFullscreenChange() {
  if (document.fullscreenElement) return
  bus.emit(EVENT_KEY.EXIT_FULLSCREEN)
}

onMounted(() => {
  // 与路由守卫共用同一份去重后的 bootstrap / init，不阻塞首屏挂载
  void store.init()
  syncViewport()
  window.addEventListener('resize', onViewportChange, { passive: true })
  window.addEventListener('orientationchange', onViewportChange, { passive: true })
  document.addEventListener('fullscreenchange', onFullscreenChange)
})

onUnmounted(() => {
  window.removeEventListener('resize', onViewportChange)
  window.removeEventListener('orientationchange', onViewportChange)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  if (rafId) cancelAnimationFrame(rafId)
})
</script>

<style lang="less">
@import './assets/less/index';

* {
  user-select: none;
}

#app {
  height: 100%;
  width: 100%;
  position: relative;
  font-size: 14rem;
}

@media screen and (min-width: 500px) {
  #app {
    width: 500px !important;
    position: relative;
    left: 50%;
    transform: translateX(-50%);
  }
}
</style>
