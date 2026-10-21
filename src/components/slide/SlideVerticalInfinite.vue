<script setup lang="tsx">
import { createApp, onMounted, onUnmounted, reactive, ref, render as vueRender, watch } from 'vue'
import {
  getSlideOffset,
  slideInit,
  slideReset,
  slideTouchEnd,
  slideTouchMove,
  slideTouchStart
} from '@/utils/slide'
import { SlideType } from '@/utils/const_var'
import SlideItem from '@/components/slide/SlideItem.vue'
import bus, { EVENT_KEY } from '../../utils/bus'
import Loading from '@/components/Loading.vue'
import { useBaseStore } from '@/store/pinia'
import { _css } from '@/utils/dom'

const props = defineProps({
  index: {
    type: Number,
    default: () => {
      return -1
    }
  },
  render: {
    type: Function,
    default: () => {
      return null
    }
  },
  list: {
    type: Array,
    default: () => {
      return []
    }
  },
  //页面中同时存在多少个SlideItem
  virtualTotal: {
    type: Number,
    default: () => 5
  },
  name: {
    type: String,
    default: () => ''
  },
  uniqueId: {
    type: String,
    default: () => ''
  },
  loading: {
    type: Boolean,
    default: () => false
  },
  active: {
    type: Boolean,
    default: () => false
  },
  /** 预加载后续条数，用于提前请求下一页 */
  preloadAhead: {
    type: Number,
    default: () => 2
  }
})
const emit = defineEmits(['update:index', 'loadMore', 'refresh'])

const appInsMap = new Map<number, { unmount?: () => void }>()
const itemClassName = 'slide-item'
const slideListEl = ref<HTMLDivElement>(null)
let resizeObserver: ResizeObserver | null = null
let resizeRaf = 0
const state = reactive({
  judgeValue: 20,
  type: SlideType.VERTICAL_INFINITE,
  name: props.name,
  localIndex: Math.max(0, Number(props.index) || 0),
  needCheck: true,
  next: false,
  isDown: false,
  start: { x: 0, y: 0, time: 0 },
  move: { x: 0, y: 0 },
  wrapper: { width: 0, height: 0, childrenLength: 0 }
})
const baseStore = useBaseStore()

/**
 * 列表引用变化（首次数据、刷新、加载更多）都要重新对齐 DOM 窗口。
 * 关键点：不能按「长度变长」直接跳过 —— 加载更多之后窗口必须继续跟随，否则
 * transform 已经移动、DOM 里却还是旧条目，用户就会看到「弹回」或空白。
 */
watch(
  () => props.list,
  (newVal) => {
    const total = newVal.length
    if (typeof props.index === 'number' && props.index >= 0 && props.index !== state.localIndex) {
      state.localIndex = Math.min(props.index, Math.max(0, total - 1))
    }
    if (!total) {
      clearDom()
      return
    }
    if (state.localIndex >= total) state.localIndex = total - 1
    syncWindow()
  }
)

watch(
  () => props.index,
  (newVal) => {
    if (typeof newVal !== 'number' || newVal < 0) return
    const total = props.list.length
    if (!total) return
    const target = Math.min(newVal, total - 1)
    if (target === state.localIndex) return
    // 父组件强行改变指定可见节点，比如合集中跳转到指定集等
    state.localIndex = target
    syncWindow()
  }
)

/**
 * 滑动
 */
watch(
  () => state.localIndex,
  (newVal, oldVal) => {
    bus.emit(EVENT_KEY.PLAYBACK_INDEX, { uniqueId: props.uniqueId, index: newVal })
    bus.emit(EVENT_KEY.CURRENT_ITEM, props.list[newVal])
    bus.emit(EVENT_KEY.SINGLE_CLICK_BROADCAST, {
      uniqueId: props.uniqueId,
      index: newVal,
      type: EVENT_KEY.ITEM_PLAY
    })
    setTimeout(() => {
      bus.emit(EVENT_KEY.SINGLE_CLICK_BROADCAST, {
        uniqueId: props.uniqueId,
        index: oldVal,
        type: EVENT_KEY.ITEM_STOP
      })
    }, 200)
  }
)

watch(
  () => props.active,
  (newVal) => {
    if (!newVal) {
      setTimeout(() => {
        bus.emit(EVENT_KEY.SINGLE_CLICK_BROADCAST, {
          uniqueId: props.uniqueId,
          index: state.localIndex,
          type: EVENT_KEY.ITEM_STOP
        })
      }, 200)
      return
    }
    // keep-alive 重新激活后尺寸才恢复，重新对齐一次窗口
    requestAnimationFrame(() => syncWindow())
    bus.emit(EVENT_KEY.PLAYBACK_INDEX, { uniqueId: props.uniqueId, index: state.localIndex })
    bus.emit(EVENT_KEY.CURRENT_ITEM, props.list[state.localIndex])
    setTimeout(() => {
      bus.emit(EVENT_KEY.SINGLE_CLICK_BROADCAST, {
        uniqueId: props.uniqueId,
        index: state.localIndex,
        type: EVENT_KEY.ITEM_PLAY
      })
    }, 0)
  },
  { immediate: true }
)

onMounted(() => {
  if (!slideListEl.value) return
  slideInit(slideListEl.value, state)
  // 初始就带了数据（如从详情页/合集跳转进来）时不会触发 list 的 watch，需要主动渲染一次
  if (props.list.length) syncWindow()

  // 视口尺寸变化（开关 DevTools、拖动窗口、旋转屏幕）后自行重排，
  // App.vue 里不再用整页刷新兜底
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(onSlideResize)
    resizeObserver.observe(slideListEl.value)
  } else {
    window.addEventListener('resize', onSlideResize)
  }
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  window.removeEventListener('resize', onSlideResize)
  if (resizeRaf) cancelAnimationFrame(resizeRaf)
})

function clearDom() {
  const entries = Array.from(appInsMap.values())
  appInsMap.clear()
  for (const entry of entries) {
    try {
      entry?.unmount?.()
    } catch {
      /* 忽略卸载失败 */
    }
  }
  if (slideListEl.value) slideListEl.value.innerHTML = ''
}

/** 卸载并移除指定 index 的条目；索引可能已经被其它路径移除，这里必须容错 */
function unmountAt(index: number) {
  const entry = appInsMap.get(index)
  appInsMap.delete(index)
  try {
    entry?.unmount?.()
  } catch (err) {
    console.warn('[slide] 卸载条目失败', index, err)
  }
  const el = slideListEl.value?.querySelector(`.${itemClassName}[data-index="${index}"]`)
  el?.remove()
}

/** 按 data-index 顺序插入，保证 DOM 顺序与列表顺序一致（flex 布局依赖这一点） */
function insertSorted(parent: HTMLElement, node: HTMLElement, index: number) {
  const next = Array.from(parent.children).find((child) => {
    const value = Number((child as HTMLElement).dataset.index)
    return Number.isFinite(value) && value > index
  })
  if (next) parent.insertBefore(node, next)
  else parent.appendChild(node)
}

function measure() {
  if (!slideListEl.value) return false
  const width = _css(slideListEl.value, 'width')
  const height = _css(slideListEl.value, 'height')
  // keep-alive 缓存中的页面尺寸为 0，此时不能重排：
  // 否则会把正确的偏移量清成 0，页面重新激活时会先闪一下第一条
  if (!width || !height) return false
  state.wrapper.width = width
  state.wrapper.height = height
  state.wrapper.childrenLength = slideListEl.value.children.length
  return true
}

/**
 * 把 DOM 窗口对齐到 [start, start + size)：
 * - 移除窗口外的条目（unmount，不重建全部）
 * - 补齐窗口内缺失的条目（按 index 顺序插入）
 * - 统一 top 基准与整体 transform
 *
 * 原先的实现只在特定滑动条件下增删条目，列表追加后窗口没有继续跟随，
 * 导致 data-index 与 transform/top 错位 —— 这是「翻页弹回」的根因。
 */
function syncWindow() {
  const el = slideListEl.value
  if (!el) return

  const total = props.list.length
  if (!total) {
    clearDom()
    return
  }

  const wasEmpty = el.children.length === 0
  const measurable = measure()

  const size = Math.min(Math.max(1, props.virtualTotal), total)
  const half = Math.floor(size / 2)
  const maxStart = Math.max(0, total - size)
  const start = Math.max(0, Math.min(state.localIndex - half, maxStart))
  const end = Math.min(total, start + size)

  for (const child of Array.from(el.children) as HTMLElement[]) {
    const index = Number(child.dataset.index)
    if (!Number.isFinite(index) || index < start || index >= end) unmountAt(index)
  }

  let renderedCurrent = false
  for (let index = start; index < end; index++) {
    if (el.querySelector(`.${itemClassName}[data-index="${index}"]`)) continue
    const node = getInsEl(props.list[index], index, index === state.localIndex) as HTMLElement
    insertSorted(el, node, index)
    if (index === state.localIndex) renderedCurrent = true
  }

  if (measurable) {
    // 窗口只渲染 [start, end)：先按 start 把 DOM 流恢复成「绝对 index」基准，
    // 再用 localIndex 计算位移，两者必须成对出现，否则窗口一移动就会错位。
    const top = start > 0 ? start * state.wrapper.height : 0
    el.querySelectorAll(`.${itemClassName}`).forEach((item) => _css(item, 'top', top))
    _css(el, 'transform', `translate3d(0px,${getSlideOffset(state, el)}px, 0px)`)
  }
  state.wrapper.childrenLength = el.children.length

  // 首屏数据异步到达、或当前条目刚被创建时补一次播放广播
  if (props.active && (wasEmpty || renderedCurrent)) {
    bus.emit(EVENT_KEY.PLAYBACK_INDEX, { uniqueId: props.uniqueId, index: state.localIndex })
    bus.emit(EVENT_KEY.SINGLE_CLICK_BROADCAST, {
      uniqueId: props.uniqueId,
      index: state.localIndex,
      type: EVENT_KEY.ITEM_PLAY
    })
  }
}

/**
 * 视口尺寸变化后重排：只重算像素偏移，不重建 DOM，视频不会重新加载。
 * 这是原先 App.vue 里 location.href 整页刷新的替代方案。
 */
function relayout() {
  syncWindow()
}

function onSlideResize() {
  if (resizeRaf) return
  resizeRaf = requestAnimationFrame(() => {
    resizeRaf = 0
    relayout()
  })
}

/** 距离列表末尾还有 preloadAhead 条时就提前请求下一页 */
function maybeLoadMore() {
  const ahead = Math.max(1, Number(props.preloadAhead) || 1)
  if (props.list.length <= ahead + 1) return
  if (state.localIndex >= props.list.length - ahead - 1) emit('loadMore')
}

function dislike() {
  // 保留给历史调用方：暂不实现
}

defineExpose({ dislike, syncWindow })

/**
 * 获取Vue组件渲染之后的dom元素
 * @param item
 * @param index
 * @param play
 */
function getInsEl(item, index, play = false) {
  const slideVNode = props.render(item, index, play, props.uniqueId, state.localIndex)
  const parent = document.createElement('div')
  //TODO 打包到线上时用这个，这个在开发时任何修改都会刷新页面
  if (import.meta.env.PROD) {
    parent.classList.add('slide-item')
    parent.setAttribute('data-index', index)
    //将Vue组件渲染到一个div上
    vueRender(slideVNode, parent)
    appInsMap.set(index, {
      unmount: () => {
        vueRender(null, parent)
        parent.remove()
      }
    })
    return parent
  } else {
    //创建一个新的Vue实例，并挂载到一个div上
    const app = createApp({
      render() {
        return <SlideItem data-index={index}>{slideVNode}</SlideItem>
      }
    })
    const ins = app.mount(parent)
    appInsMap.set(index, { unmount: () => app.unmount() })
    return ins.$el
  }
}

function touchStart(e) {
  slideTouchStart(e, slideListEl.value, state)
}

function touchMove(e) {
  slideTouchMove(e, slideListEl.value, state, canNext)
}

function touchEnd(e) {
  const isNext = state.move.y < 0
  if (
    state.localIndex === 0 &&
    !isNext &&
    state.move.y > baseStore.homeRefresh + baseStore.judgeValue
  ) {
    emit('refresh')
  }
  slideTouchEnd(e, state, canNext, () => {
    syncWindow()
    maybeLoadMore()
  })
  slideReset(e, slideListEl.value, state, emit)
}

function canNext(state, isNext: boolean) {
  return !(
    (state.localIndex === 0 && !isNext) ||
    (state.localIndex === props.list.length - 1 && isNext)
  )
}
</script>

<template>
  <div class="slide slide-infinite">
    <Loading v-if="props.loading && props.list.length === 0" />
    <div
      class="slide-list flex-direction-column"
      ref="slideListEl"
      @pointerdown.prevent="touchStart"
      @pointermove.prevent="touchMove"
      @pointerup.prevent="touchEnd"
    >
      <slot></slot>
    </div>
  </div>
</template>
