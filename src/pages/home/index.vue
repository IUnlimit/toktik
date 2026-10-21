<template>
  <div class="home" id="home-index">
    <div class="tabs" v-if="!state.hidden">
      <div class="tab" :class="{ active: state.tab === 'recommend' }" @click="switchTab('recommend')">
        推荐
      </div>
      <div class="tab" :class="{ active: state.tab === 'history' }" @click="switchTab('history')">
        历史
      </div>
      <Icon icon="mdi:magnify" class="search" @click="nav('/search')" />
    </div>

    <div class="body">
      <div class="feed" v-show="state.tab === 'recommend'">
        <VideoFeed
          ref="recommendRef"
          unique-id="recommend"
          :active="state.active && state.tab === 'recommend'"
          :fetcher="fetchRecommend"
          :empty-hint="emptyState.text"
          @refresh="shuffle"
        >
          <template #empty>
            <div class="empty">
              <Icon icon="mdi:movie-open-outline" class="empty-icon" />
              <p>{{ emptyState.text }}</p>
              <button class="primary" @click="nav(emptyState.action)">{{ emptyState.actionText }}</button>
            </div>
          </template>
        </VideoFeed>
      </div>

      <div class="feed" v-if="state.tab === 'history'">
        <VideoFeed
          unique-id="history"
          :active="state.active && state.tab === 'history'"
          :fetcher="fetchHistory"
          empty-hint="还没有观看记录，刷几个视频就有了"
        />
      </div>
    </div>

    <ItemInfoDialog />
    <BaseFooter v-show="!state.hidden" :init-tab="1" />
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, onDeactivated, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import VideoFeed from '@/components/VideoFeed.vue'
import BaseFooter from '@/components/BaseFooter.vue'
import ItemInfoDialog from '@/components/ItemInfoDialog.vue'
import bus, { EVENT_KEY } from '@/utils/bus'
import { useBaseStore } from '@/store/pinia'
import { recommendedVideo, historyVideo, refreshFeedSeed } from '@/api/videos'

defineOptions({ name: 'Home' })

const router = useRouter()
const store = useBaseStore()
const recommendRef = ref<any>(null)

const state = reactive({
  active: true,
  hidden: false,
  tab: 'recommend' as 'recommend' | 'history'
})

const emptyState = computed(() => {
  const stats = store.stats
  if (stats.totalVideos > 0 && stats.videos === 0) {
    return {
      text: '所有视频都被禁用了，去视频管理里启用一些',
      action: '/library/videos',
      actionText: '视频管理'
    }
  }
  if (stats.videos > 0 && stats.playable === 0) {
    return {
      text: '库里的视频格式浏览器暂不支持，需要先转码',
      action: '/sources',
      actionText: '管理数据源'
    }
  }
  return {
    text: '库中还没有可播放的视频，先添加一个数据源',
    action: '/sources',
    actionText: '管理数据源'
  }
})

function nav(path: string) {
  router.push(path)
}

async function fetchRecommend(start: number, pageSize: number) {
  const res: any = await recommendedVideo({ start, pageSize })
  return res.success ? res.data : { total: 0, list: [] }
}

async function fetchHistory(start: number, pageSize: number) {
  const res: any = await historyVideo({ pageNo: Math.floor(start / pageSize), pageSize })
  return res.success ? res.data : { total: 0, list: [] }
}

function switchTab(tab: typeof state.tab) {
  state.tab = tab
}

function onGoCollection(name: string) {
  if (!name) return
  router.push({ path: '/collections', query: { name } })
}

function onNav({ path, query }: { path: string; query?: Record<string, any> }) {
  if (!state.active || !path) return
  router.push({ path, query })
}

function onLibraryChanged() {
  void store.refreshAll()
  recommendRef.value?.refresh?.(true)
}

/** 下拉刷新：换一组推荐顺序后重新加载（单飞，避免空列表反复触发的刷新风暴） */
let shuffling: Promise<void> | null = null
function shuffle(): Promise<void> {
  if (shuffling) return shuffling
  shuffling = (async () => {
    await refreshFeedSeed()
    await recommendRef.value?.refresh?.(true)
  })().finally(() => {
    shuffling = null
  })
  return shuffling
}

function onFullscreen() {
  state.hidden = true
}

function onExitFullscreen() {
  state.hidden = false
}

onMounted(async () => {
  await store.init()
  bus.on(EVENT_KEY.NAV, onNav)
  bus.on(EVENT_KEY.GO_COLLECTION, onGoCollection)
  bus.on(EVENT_KEY.LIBRARY_CHANGED, onLibraryChanged)
  bus.on(EVENT_KEY.ENTER_FULLSCREEN, onFullscreen)
  bus.on(EVENT_KEY.EXIT_FULLSCREEN, onExitFullscreen)
})

onUnmounted(() => {
  bus.off(EVENT_KEY.NAV, onNav)
  bus.off(EVENT_KEY.GO_COLLECTION, onGoCollection)
  bus.off(EVENT_KEY.LIBRARY_CHANGED, onLibraryChanged)
  bus.off(EVENT_KEY.ENTER_FULLSCREEN, onFullscreen)
  bus.off(EVENT_KEY.EXIT_FULLSCREEN, onExitFullscreen)
})

onActivated(() => {
  state.active = true
  bus.emit(EVENT_KEY.TOGGLE_CURRENT_VIDEO)
  void store.refreshAll()
})

onDeactivated(() => {
  state.active = false
  bus.emit(EVENT_KEY.TOGGLE_CURRENT_VIDEO)
})
</script>

<style scoped lang="less">
.home {
  position: fixed;
  inset: 0;
  background: #000;
  color: #fff;
  overflow: hidden;

  .tabs {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 20rem;
    padding: 12rem 16rem;
    font-size: 15rem;

    .tab {
      color: rgba(255, 255, 255, 0.6);
      transition: color 0.2s;
      cursor: pointer;

      &.active {
        color: #fff;
        font-weight: 600;
      }
    }

    .search {
      margin-left: auto;
      font-size: 20rem;
      opacity: 0.85;
    }
  }

  .body {
    position: absolute;
    inset: 0 0 var(--footer-height, 56rem) 0;
    overflow: hidden;
  }

  .feed {
    width: 100%;
    height: 100%;
  }

  .empty {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12rem;
    color: rgba(255, 255, 255, 0.5);
    font-size: 13rem;

    .empty-icon {
      font-size: 46rem;
      opacity: 0.5;
    }

    .primary {
      height: 34rem;
      padding: 0 20rem;
      border-radius: 17rem;
      border: none;
      background: var(--primary-btn-color, #fc2f56);
      color: #fff;
      font-size: 13rem;
      cursor: pointer;
    }
  }
}
</style>
