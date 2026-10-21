<template>
  <div
    class="video-wrapper"
    ref="videoWrapper"
    :class="[positionName, { 'is-fullscreen': state.isFullscreen }]"
  >
    <Loading v-if="state.loading" style="position: absolute" />
    <div
      class="video-holder"
      @pointerdown="onPointerDown"
      @pointermove.passive="onHoldPointerMove"
      @pointerup="onPointerUp"
      @contextmenu.prevent
    >
      <video
        v-if="playUrl"
        ref="videoEl"
        :src="playUrl"
        :poster="poster"
        :muted="state.isMuted"
        :crossorigin="crossOrigin"
        :preload="state.preload"
        loop
        playsinline
        webkit-playsinline
        x5-playsinline
        x5-video-player-type="h5-page"
        :autoplay="isPlay"
        @loadedmetadata="onLoadedMetadata"
        @timeupdate="onTimeUpdate"
        @waiting="onWaiting"
        @playing="onPlaying"
        @error="onError"
      ></video>
      <div class="no-play" v-else-if="state.error">
        <Icon icon="mdi:alert-circle-outline" class="icon" />
        <p>{{ state.error }}</p>
      </div>
    </div>

    <Icon icon="fluent:play-28-filled" class="pause-icon" v-if="!isPlaying && playUrl" />

    <div class="float">
      <div class="speed-tip" v-if="state.holdSpeed">
        <Icon icon="mdi:fast-forward" />
        <span>2× 倍速播放中</span>
      </div>
      <div class="exit-fullscreen" v-if="state.isFullscreen" @pointerdown.stop @click.stop="toggleFullscreen">
        <Icon icon="mdi:fullscreen-exit" />
        <span>退出全屏</span>
      </div>
      <div class="normal" :class="{ hidden: state.isMove }">
        <ItemToolbar :item="state.localItem" @update:item="onUpdateItem" />
        <ItemDesc />
      </div>
      <div
        class="progress"
        :class="progressClass"
        ref="progressEl"
        @click.stop
        @pointerdown.stop
        @touchstart="touchstart"
        @touchmove="touchmove"
        @touchend="touchend"
      >
        <div class="time" v-if="state.isMove">
          <span class="currentTime">{{ _duration(state.currentTime) }}</span>
          <span class="duration"> / {{ _duration(state.duration) }}</span>
        </div>
        <template v-if="state.duration > 15 || state.isMove || !isPlaying">
          <div class="bg"></div>
          <div class="progress-line" :style="durationStyle"></div>
          <div class="point" :style="pointStyle"></div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { _duration, _stopPropagation, cloneDeep, _notice } from '@/utils'
import Loading from '../Loading.vue'
import ItemToolbar from './ItemToolbar.vue'
import ItemDesc from './ItemDesc.vue'
import bus, { EVENT_KEY } from '@/utils/bus'
import { SlideItemPlayStatus } from '@/utils/const_var'
import { computed, nextTick, onMounted, onUnmounted, provide, reactive, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { _css } from '@/utils/dom'
import { reportHistory, toggleLike } from '@/api/videos'
import { useBaseStore } from '@/store/pinia'
import { pickQuality, watchNetwork } from '@/utils/network'

defineOptions({
  name: 'BaseVideo'
})

const props = defineProps({
  item: {
    type: Object,
    default: () => ({})
  },
  position: {
    type: Object,
    default: () => ({})
  },
  isPlay: {
    type: Boolean,
    default: true
  },
  isMy: {
    type: Boolean,
    default: false
  },
  isLive: {
    type: Boolean,
    default: false
  },
  /** 创建该条目时的当前播放下标（仅用于初始化预加载策略） */
  currentIndex: {
    type: Number,
    default: 0
  }
})

const videoEl = $ref<HTMLVideoElement>()
const progressEl = $ref<HTMLDivElement>()
const videoWrapper = $ref<HTMLDivElement>()

const state = reactive({
  loading: false,
  isMuted: window.isMuted,
  status: props.isPlay ? SlideItemPlayStatus.Play : SlideItemPlayStatus.Pause,
  duration: 0,
  step: 0,
  currentTime: -1,
  playX: 0,
  start: { x: 0 },
  last: { x: 0, time: 0 },
  isMove: false,
  ignoreWaiting: false,
  localItem: props.item as any,
  error: '' as string,
  reported: false,
  rememberPosition: true,
  lastSavedAt: 0,
  /** 预加载策略：随与当前播放条目的距离变化 */
  preload: 'metadata' as 'auto' | 'metadata' | 'none',
  /** 自动模式下因卡顿临时降到省流（只影响本条目，不改账号偏好） */
  degraded: false,
  waitingCount: 0,
  /** 当前播放比例 0..1，进度线与圆点都用它定位 */
  progress: 0,
  /** 长按 2 倍速中 */
  holdSpeed: false,
  /** 是否处于全屏播放 */
  isFullscreen: false,
  /** 视频宽高比（>1 为横屏），用于全屏时锁定屏幕方向 */
  videoRatio: 0
})

const store = useBaseStore()

provide(
  'isPlaying',
  computed(() => isPlaying.value)
)
provide(
  'isMuted',
  computed(() => state.isMuted)
)
provide(
  'position',
  computed(() => props.position)
)
provide(
  'item',
  computed(() => state.localItem)
)

const playUrl = computed<string>(() => {
  const item = state.localItem as any
  const list = item?.video?.play_addr?.url_list
  const fallback = Array.isArray(list) && list.length ? list[0] : ''
  const qualities = item?.toktik?.playQualities
  if (!qualities?.original && !qualities?.low) return fallback
  const quality = state.degraded ? 'low' : pickQuality(store.prefs?.quality)
  if (quality === 'low') return qualities?.low || qualities?.original || fallback
  return qualities?.original || fallback
})

const crossOrigin = computed(() => ((state.localItem as any)?.toktik?.crossOrigin ? 'anonymous' : undefined))

const poster = computed<string>(() => {
  const item = state.localItem as any
  return item?.video?.poster ?? item?.video?.cover?.url_list?.[0] ?? ''
})

const durationStyle = computed(() => ({ width: state.progress * 100 + '%' }))
const pointStyle = computed(() => ({ left: state.progress * 100 + '%' }))
const isPlaying = computed(() => state.status === SlideItemPlayStatus.Play)
const positionName = computed(() => 'item-' + Object.values(props.position).join('-'))
const progressClass = computed(() => {
  if (state.isMove) return 'move'
  return isPlaying.value ? '' : 'stop'
})

/** 全屏 API 的 webkit 前缀兼容类型 */
type FsElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void
}
type FsDocument = Document & {
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void> | void
}

const HOLD_DELAY_MS = 450
const HOLD_RATE = 2
const HOLD_MOVE_TOLERANCE = 12

let holdTimer: number | null = null
let holdActive = false
let holdWasPlaying = false

watch(
  () => props.item,
  (val) => {
    if (val !== state.localItem) state.localItem = val
  }
)

watch(
  () => props.isPlay,
  (val) => {
    if (val) play()
    else pause()
  }
)

watch(playUrl, () => {
  state.error = ''
  state.duration = 0
  state.currentTime = -1
  state.progress = 0
  state.playX = 0
  state.videoRatio = 0
  state.reported = false
  resetHold()
  // 切换画质会替换 <video> 的 src，需要在新源上恢复播放
  if (isPlaying.value) {
    void nextTick().then(() => tryPlay())
  }
})

/** 按与当前播放条目的距离决定预加载强度：当前与后 1 条抢先加载，更远的只取元数据 */
function applyPreload(currentIndex: number) {
  const distance = Number(props.position.index) - Number(currentIndex)
  const ahead = Math.max(0, Math.min(3, Number(store.prefs?.preloadAhead ?? 2) || 0))
  const limit = store.prefs?.quality === 'low' ? Math.min(1, ahead) : ahead
  if (distance <= 0) state.preload = 'auto'
  else if (distance === 1 && limit >= 1) state.preload = 'auto'
  else if (distance <= limit + 1) state.preload = 'metadata'
  else state.preload = 'none'
}

function onPlaybackIndex(payload: { uniqueId?: string; index?: number }) {
  if (payload?.uniqueId !== props.position.uniqueId) return
  if (typeof payload.index !== 'number') return
  applyPreload(payload.index)
}

function onPrefsChanged() {
  state.degraded = false
  state.waitingCount = 0
}

let stopNetworkWatch: (() => void) | null = null

onMounted(() => {
  const item = state.localItem as any
  if (item?.toktik?.playable === false) {
    state.error = '浏览器不支持该视频格式（' + (item?.toktik?.ext || '未知') + '）'
  }
  if (!playUrl.value && !state.error) {
    state.error = '无法获取播放地址，请检查数据源是否可访问'
  }
  // 新创建的条目还没收到广播，先用创建时的当前下标初始化一次
  applyPreload(props.currentIndex)

  bus.on(EVENT_KEY.SINGLE_CLICK_BROADCAST, click)
  bus.on(EVENT_KEY.REMOVE_MUTED, removeMuted)
  bus.on(EVENT_KEY.SEEK_REQUEST, onSeekRequest)
  bus.on(EVENT_KEY.PLAYBACK_INDEX, onPlaybackIndex)
  bus.on(EVENT_KEY.PREFS_CHANGED, onPrefsChanged)
  bus.on(EVENT_KEY.TOGGLE_FULLSCREEN, onToggleFullscreen)
  document.addEventListener('fullscreenchange', onFullscreenChange)
  document.addEventListener('webkitfullscreenchange', onFullscreenChange)
  window.addEventListener('pointerup', onHoldPointerUp)
  window.addEventListener('pointercancel', onHoldCancel)
  window.addEventListener('pointermove', onHoldPointerMove, { passive: true })
  window.addEventListener('blur', onHoldCancel)
  document.addEventListener('visibilitychange', onHoldCancel)
  stopNetworkWatch = watchNetwork(onPrefsChanged)
})

onUnmounted(() => {
  bus.off(EVENT_KEY.SINGLE_CLICK_BROADCAST, click)
  bus.off(EVENT_KEY.REMOVE_MUTED, removeMuted)
  bus.off(EVENT_KEY.SEEK_REQUEST, onSeekRequest)
  bus.off(EVENT_KEY.PLAYBACK_INDEX, onPlaybackIndex)
  bus.off(EVENT_KEY.PREFS_CHANGED, onPrefsChanged)
  bus.off(EVENT_KEY.TOGGLE_FULLSCREEN, onToggleFullscreen)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  document.removeEventListener('webkitfullscreenchange', onFullscreenChange)
  window.removeEventListener('pointerup', onHoldPointerUp)
  window.removeEventListener('pointercancel', onHoldCancel)
  window.removeEventListener('pointermove', onHoldPointerMove)
  window.removeEventListener('blur', onHoldCancel)
  document.removeEventListener('visibilitychange', onHoldCancel)
  stopNetworkWatch?.()
  stopNetworkWatch = null
  resetHold()
  if (state.isFullscreen) setFullscreenState(false)
  if (currentFullscreenElement()) exitFullscreen()
  saveProgress(true)
})

function removeMuted() {
  state.isMuted = false
  if (videoEl) videoEl.muted = false
}

function onLoadedMetadata() {
  if (!videoEl) return
  state.duration = videoEl.duration || 0
  state.videoRatio =
    videoEl.videoWidth && videoEl.videoHeight ? videoEl.videoWidth / videoEl.videoHeight : 0
  state.step = (progressEl?.clientWidth ?? 0) / Math.max(1, state.duration)
  // 续播：上次看到 5s 之后、且距结尾还有 10s 以上（受「记忆播放进度」设置控制）
  const remember = store.prefs?.rememberPosition !== false
  const resume = remember ? Number((state.localItem as any)?.toktik?.lastPositionSec || 0) : 0
  if (resume > 5 && state.duration - resume > 10) {
    videoEl.currentTime = resume
  }
  syncProgress()
  if (isPlaying.value) void tryPlay()
}

/** 把 video 的当前时间同步成 0..1 的播放比例，进度线与圆点都用它定位 */
function syncProgress() {
  if (!videoEl) return
  const duration = state.duration || 0
  const time = Math.max(0, videoEl.currentTime || 0)
  state.currentTime = Math.ceil(time)
  state.progress = duration > 0 ? Math.min(1, time / duration) : 0
  state.playX = state.progress * (progressEl?.clientWidth ?? 0)
}

function onTimeUpdate() {
  if (!videoEl) return
  syncProgress()

  if (!state.reported) {
    state.reported = true
    void reportHistory((state.localItem as any).aweme_id, Math.floor(videoEl.currentTime), true)
    state.lastSavedAt = Date.now()
  } else if (Date.now() - state.lastSavedAt > 5000) {
    state.lastSavedAt = Date.now()
    void reportHistory((state.localItem as any).aweme_id, Math.floor(videoEl.currentTime))
  }
}

function saveProgress(force = false) {
  if (!videoEl) return
  const id = (state.localItem as any)?.aweme_id
  if (!id) return
  if (!force && !state.reported) return
  void reportHistory(id, Math.floor(videoEl.currentTime))
}

function onWaiting() {
  if (isPlaying.value && !state.ignoreWaiting) state.loading = true
  if (!isPlaying.value || state.degraded) return
  // 自动画质：连续卡顿 3 次后，本条目临时降级为省流版本（不改账号偏好）
  if ((store.prefs?.quality ?? 'auto') !== 'auto') return
  if (!(state.localItem as any)?.toktik?.playQualities?.low) return
  state.waitingCount++
  if (state.waitingCount >= 3) {
    state.degraded = true
    state.waitingCount = 0
    _notice('网络较慢，已切换为省流画质')
  }
}

function onPlaying() {
  state.loading = false
  state.waitingCount = 0
}

function onError() {
  if (state.error) return
  state.error = '视频加载失败：可能是格式不受支持，或数据源需要重新授权'
  state.loading = false
}

function onUpdateItem(next: any) {
  state.localItem = next
}

/* ---------------------------------------------------------------- 手势 */

let downAt = 0
let downPoint = { x: 0, y: 0 }
let lastTapAt = 0
let singleTapTimer: number | null = null

function onPointerDown(e: PointerEvent) {
  // 全屏时不要触发 slide 列表的上下翻页
  if (state.isFullscreen) _stopPropagation(e)
  downAt = Date.now()
  downPoint = { x: e.clientX, y: e.clientY }
  armHold()
}

function onPointerUp(e: PointerEvent) {
  const held = holdActive
  if (held) endHold()
  const moved =
    Math.abs(e.clientX - downPoint.x) > 10 || Math.abs(e.clientY - downPoint.y) > 10
  if (held || moved || Date.now() - downAt > 800) return
  if (window.isMoved) return

  const now = Date.now()
  if (now - lastTapAt < 260) {
    if (singleTapTimer) {
      clearTimeout(singleTapTimer)
      singleTapTimer = null
    }
    lastTapAt = 0
    void doubleTapLike(e)
    return
  }
  lastTapAt = now
  singleTapTimer = window.setTimeout(() => {
    singleTapTimer = null
    togglePlay()
  }, 260)
}

/* ---------------------------------------------------------------- 长按 2 倍速 */

function armHold() {
  clearHold()
  if (!playUrl.value || !videoEl || state.error) return
  holdTimer = window.setTimeout(startHold, HOLD_DELAY_MS)
}

function clearHold() {
  if (holdTimer === null) return
  clearTimeout(holdTimer)
  holdTimer = null
}

function startHold() {
  holdTimer = null
  if (!videoEl || !playUrl.value || state.error) return
  if (window.isMoved) return
  holdActive = true
  holdWasPlaying = isPlaying.value
  state.holdSpeed = true
  // 长按命中后不要再被判定成单击 / 双击
  lastTapAt = 0
  if (singleTapTimer) {
    clearTimeout(singleTapTimer)
    singleTapTimer = null
  }
  if (!holdWasPlaying) startPlayback()
  videoEl.playbackRate = HOLD_RATE
  try {
    navigator.vibrate?.(15)
  } catch {
    /* 部分浏览器不支持振动 */
  }
}

/** 只复位倍速相关的状态，不改变当前播放/暂停意图 */
function resetHold() {
  clearHold()
  holdActive = false
  state.holdSpeed = false
  if (videoEl) videoEl.playbackRate = 1
}

function endHold() {
  const wasPlaying = holdWasPlaying
  resetHold()
  if (!wasPlaying && isPlaying.value) pause()
}

function onHoldPointerUp() {
  if (holdActive) endHold()
  else clearHold()
}

function onHoldPointerMove(e: PointerEvent) {
  if (!holdActive && holdTimer === null) return
  const dx = Math.abs(e.clientX - downPoint.x)
  const dy = Math.abs(e.clientY - downPoint.y)
  if (dx <= HOLD_MOVE_TOLERANCE && dy <= HOLD_MOVE_TOLERANCE) return
  if (holdActive) endHold()
  else clearHold()
}

function onHoldCancel() {
  if (holdActive) endHold()
  else clearHold()
}

async function doubleTapLike(e: PointerEvent) {
  spawnHeart(e)
  const item = state.localItem as any
  if (item?.isLoved) return
  state.localItem = { ...item, isLoved: true }
  bus.emit(EVENT_KEY.UPDATE_ITEM, { position: props.position, item: state.localItem })
  await toggleLike(item.aweme_id)
}

function spawnHeart(e: PointerEvent) {
  const host = videoWrapper
  if (!host) return
  const img = document.createElement('img')
  img.src = new URL('../../assets/img/icon/loved.svg', import.meta.url).href
  img.className = 'love-burst ' + (Math.random() > 0.5 ? 'left' : 'right')
  img.style.top = e.clientY - 70 + 'px'
  img.style.left = e.clientX - 30 + 'px'
  host.appendChild(img)
  setTimeout(() => img.remove(), 1000)
}

/* ---------------------------------------------------------------- 播放控制 */

function togglePlay() {
  if (isPlaying.value) pause()
  else play()
}

/** 只切到播放态并开始播放，不显示 loading 遮罩（长按加速 / 进入全屏时使用） */
function startPlayback() {
  state.status = SlideItemPlayStatus.Play
  void tryPlay()
}

function play() {
  state.status = SlideItemPlayStatus.Play
  state.loading = true
  void tryPlay()
}

async function tryPlay() {
  if (!videoEl) return
  videoEl.muted = state.isMuted
  videoEl.volume = 1
  try {
    await videoEl.play()
    state.loading = false
  } catch (err) {
    // 自动播放被拦截时静音重试一次
    if (state.isMuted === false) {
      state.isMuted = true
      videoEl.muted = true
      try {
        await videoEl.play()
        state.loading = false
        return
      } catch {
        /* ignore */
      }
    }
    state.loading = false
    console.warn('[video] 播放被阻止', err)
  }
}

function pause() {
  state.status = SlideItemPlayStatus.Pause
  state.loading = false
  if (holdActive || state.holdSpeed) resetHold()
  videoEl?.pause()
  saveProgress(true)
}

function onSeekRequest(payload: { uniqueId?: string; index?: number; positionSec?: number }) {
  if (payload?.uniqueId !== props.position.uniqueId) return
  if (payload?.index !== props.position.index) return
  if (!videoEl) return
  videoEl.currentTime = Math.max(0, payload.positionSec ?? 0)
  syncProgress()
}

function click({ uniqueId, index, type }) {
  if (props.position.uniqueId !== uniqueId || props.position.index !== index) return
  if (type === EVENT_KEY.ITEM_TOGGLE) {
    togglePlay()
  }
  if (type === EVENT_KEY.ITEM_STOP) {
    if (videoEl) videoEl.currentTime = 0
    state.ignoreWaiting = true
    pause()
    setTimeout(() => (state.ignoreWaiting = false), 300)
  }
  if (type === EVENT_KEY.ITEM_PLAY) {
    if (videoEl) videoEl.currentTime = 0
    state.ignoreWaiting = true
    play()
    setTimeout(() => (state.ignoreWaiting = false), 300)
  }
}

/* ---------------------------------------------------------------- 全屏 */

function currentFullscreenElement(): Element | null {
  const doc = document as FsDocument
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null
}

function exitFullscreen() {
  const doc = document as FsDocument
  try {
    const result = doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.()
    void Promise.resolve(result).catch(() => {})
  } catch {
    /* 退出失败时交给浏览器默认行为 */
  }
}

function isLandscapeVideo() {
  if (state.videoRatio > 0) return state.videoRatio > 1
  const video = (state.localItem as any)?.video
  const width = Number(video?.width) || 0
  const height = Number(video?.height) || 0
  return width > 0 && height > 0 ? width > height : false
}

/** 横屏视频进全屏时尝试锁定横屏；桌面浏览器 / iOS 不支持时静默失败 */
function lockOrientation() {
  if (!isLandscapeVideo()) return
  const orientation = (screen as any)?.orientation
  if (!orientation?.lock) return
  try {
    const result = orientation.lock('landscape')
    if (result && typeof result.catch === 'function') result.catch(() => {})
  } catch {
    /* ignore */
  }
}

function unlockOrientation() {
  const orientation = (screen as any)?.orientation
  try {
    orientation?.unlock?.()
  } catch {
    /* ignore */
  }
}

async function toggleFullscreen() {
  if (!videoWrapper) return
  if (currentFullscreenElement()) {
    exitFullscreen()
    return
  }
  const el = videoWrapper as FsElement
  if (!el.requestFullscreen && !el.webkitRequestFullscreen) {
    // iOS Safari 不支持元素全屏，退回系统播放器全屏
    const native = videoEl as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | undefined
    if (native?.webkitEnterFullscreen) {
      if (!isPlaying.value) startPlayback()
      native.webkitEnterFullscreen()
      return
    }
    _notice('当前浏览器不支持全屏播放')
    return
  }
  try {
    if (!isPlaying.value) startPlayback()
    await (el.requestFullscreen
      ? el.requestFullscreen({ navigationUI: 'hide' })
      : el.webkitRequestFullscreen?.())
  } catch (err) {
    console.warn('[video] 全屏失败', err)
    _notice('无法进入全屏')
  }
}

function setFullscreenState(active: boolean) {
  if (state.isFullscreen === active) return
  state.isFullscreen = active
  if (active) {
    bus.emit(EVENT_KEY.ENTER_FULLSCREEN)
    lockOrientation()
    if (isPlaying.value) void tryPlay()
    return
  }
  bus.emit(EVENT_KEY.EXIT_FULLSCREEN)
  unlockOrientation()
  resetHold()
}

function onFullscreenChange() {
  setFullscreenState(currentFullscreenElement() === videoWrapper)
}

function onToggleFullscreen(payload?: { uniqueId?: string; index?: number }) {
  if (payload?.uniqueId !== props.position.uniqueId) return
  if (payload?.index !== props.position.index) return
  void toggleFullscreen()
}

/* ---------------------------------------------------------------- 进度条拖动 */

function touchstart(e) {
  _stopPropagation(e)
  const width = progressEl?.clientWidth ?? 0
  // 旋转 / 全屏后容器宽度会变，拖动换算必须用最新宽度
  state.step = width / Math.max(1, state.duration)
  state.start.x = e.touches[0].pageX
  state.last.x = state.progress * width
  // 用精确时间而不是取整后的 currentTime，避免拖动时的秒级跳变
  state.last.time = Math.max(0, videoEl?.currentTime ?? state.currentTime)
}

function touchmove(e) {
  _stopPropagation(e)
  state.isMove = true
  pause()
  const width = progressEl?.clientWidth ?? 0
  const dx = e.touches[0].pageX - state.start.x
  state.playX = Math.min(Math.max(state.last.x + dx, 0), width)
  state.progress = width > 0 ? state.playX / width : 0
  const target = state.last.time + dx / Math.max(state.step, 0.001)
  state.currentTime = Math.min(Math.max(target, 0), state.duration)
}

function touchend(e) {
  _stopPropagation(e)
  if (videoEl) videoEl.currentTime = state.currentTime
  setTimeout(() => (state.isMove = false), 800)
  if (!isPlaying.value) play()
}

defineExpose({ play, pause, state })
void cloneDeep
void _css
</script>

<style scoped lang="less">
.video-wrapper {
  position: relative;
  font-size: 14rem;
  width: 100%;
  height: 100%;
  text-align: center;
  overflow: hidden;
  background: #000;
  -webkit-touch-callout: none;

  &:-webkit-full-screen,
  &:fullscreen,
  &.is-fullscreen {
    width: 100%;
    height: 100%;
    background: #000;

    .video-holder {
      width: 100%;
      height: 100%;
    }

    video {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    // 全屏只保留进度条与退出按钮，隐藏工具栏 / 描述
    .float .normal {
      opacity: 0;
      pointer-events: none;
    }
  }

  .video-holder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  video {
    max-width: 100%;
    height: 100%;
    object-fit: contain;
    transition: height 0.3s;
  }

  .no-play {
    color: rgba(255, 255, 255, 0.8);
    font-size: 13rem;
    padding: 0 30rem;
    line-height: 1.6;

    .icon {
      font-size: 44rem;
      margin-bottom: 10rem;
      opacity: 0.7;
    }
  }

  .pause-icon {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    font-size: 68rem;
    color: rgba(255, 255, 255, 0.55);
    pointer-events: none;
  }

  .float {
    position: absolute;
    left: 0;
    top: 0;
    height: 100%;
    width: 100%;
    pointer-events: none;

    .normal,
    .progress {
      pointer-events: auto;
    }

    .normal {
      position: absolute;
      bottom: 0;
      width: 100%;
      transition: all 0.3s;

      &.hidden {
        opacity: 0;
      }
    }
  }

  .speed-tip,
  .exit-fullscreen {
    position: absolute;
    display: flex;
    align-items: center;
    gap: 6rem;
    padding: 6rem 12rem;
    border-radius: 16rem;
    background: rgba(0, 0, 0, 0.5);
    color: #fff;
    font-size: 12rem;
    white-space: nowrap;
    z-index: 4;

    .icon {
      font-size: 18rem;
    }
  }

  .speed-tip {
    top: 12%;
    left: 50%;
    transform: translateX(-50%);
    pointer-events: none;
  }

  .exit-fullscreen {
    top: 14rem;
    right: 14rem;
    pointer-events: auto;
    cursor: pointer;
  }

  .progress {
    position: absolute;
    bottom: 8rem;
    left: 0;
    width: 100%;
    height: 20rem;
    display: flex;
    align-items: center;

    .bg {
      position: absolute;
      width: 100%;
      height: 2rem;
      background: rgba(255, 255, 255, 0.28);
      border-radius: 2rem;
    }

    .progress-line {
      position: absolute;
      height: 2rem;
      background: #fff;
      border-radius: 2rem;
      max-width: 100%;
    }

    .point {
      position: absolute;
      top: 50%;
      transform: translate(-50%, -50%);
      width: 8rem;
      height: 8rem;
      border-radius: 50%;
      background: #fff;
      box-shadow: 0 0 4rem rgba(0, 0, 0, 0.35);
      pointer-events: none;
    }

    .time {
      position: absolute;
      bottom: 22rem;
      left: 50%;
      transform: translateX(-50%);
      font-size: 12rem;
      color: #fff;
      background: rgba(0, 0, 0, 0.45);
      padding: 2rem 8rem;
      border-radius: 10rem;
      white-space: nowrap;

      .duration {
        opacity: 0.6;
      }
    }
  }
}

:deep(.love-burst) {
  position: fixed;
  width: 60rem;
  height: 60rem;
  z-index: 20;
  pointer-events: none;
  animation: love-burst 0.9s ease-out forwards;
}

@keyframes love-burst {
  0% {
    transform: scale(0.3) rotate(-12deg);
    opacity: 0;
  }
  30% {
    transform: scale(1.15) rotate(6deg);
    opacity: 1;
  }
  100% {
    transform: scale(1.5) translateY(-70px) rotate(0deg);
    opacity: 0;
  }
}
</style>
