<template>
  <div class="history">
    <div class="top-bar">
      <span class="title">观看历史</span>
      <div class="right">
        <span class="mode" @click="toggleMode">
          <Icon :icon="state.mode === 'feed' ? 'mdi:view-grid-outline' : 'mdi:play-box-outline'" />
          {{ state.mode === 'feed' ? '网格' : '播放' }}
        </span>
        <Icon icon="mdi:delete-sweep-outline" class="action" @click="clearAll" />
      </div>
    </div>

    <div class="body">
      <transition name="fade-slide">
        <div class="view" v-if="state.mode === 'feed'" key="feed">
          <VideoFeed
            unique-id="history"
            :active="true"
            :fetcher="fetchHistory"
            empty-hint="还没有观看记录，刷几个视频就有了"
          />
        </div>

        <div class="view" v-else key="grid">
          <div class="scroll">
            <Posters
              :list="state.posters"
              :show-progress="true"
              @open="openPoster"
              @longpress="removeOne"
            />
            <div class="empty" v-if="!state.posters.length && !state.loading">
              <Icon icon="mdi:history" class="empty-icon" />
              <p>还没有观看记录</p>
              <button class="primary" @click="nav('/home')">去刷视频</button>
            </div>
            <div class="loading" v-if="state.loading">加载中…</div>
          </div>
        </div>
      </transition>
    </div>

    <ItemInfoDialog />
    <BaseFooter :init-tab="5" />
  </div>
</template>

<script setup lang="ts">
import { onActivated, onMounted, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import VideoFeed from '@/components/VideoFeed.vue'
import Posters from '@/components/Posters.vue'
import BaseFooter from '@/components/BaseFooter.vue'
import ItemInfoDialog from '@/components/ItemInfoDialog.vue'
import { clearHistory, historyPosters, historyVideo } from '@/api/videos'
import { _showSimpleConfirmDialog } from '@/utils'
import type { PosterItem } from '@shared/aweme'

defineOptions({ name: 'History' })

const router = useRouter()

const state = reactive({
  mode: 'feed' as 'feed' | 'grid',
  loading: false,
  posters: [] as PosterItem[]
})

async function fetchHistory(start: number, pageSize: number) {
  const res: any = await historyVideo({ pageNo: Math.floor(start / pageSize), pageSize })
  return res.success ? res.data : { total: 0, list: [] }
}

async function loadPosters() {
  state.loading = true
  try {
    const res: any = await historyPosters()
    state.posters = res.success ? (res.data?.list ?? []) : []
  } finally {
    state.loading = false
  }
}

function toggleMode() {
  state.mode = state.mode === 'feed' ? 'grid' : 'feed'
  if (state.mode === 'grid') void loadPosters()
}

function openPoster({ item }: { item: PosterItem }) {
  router.push({ path: '/video-detail', query: { id: item.id } })
}

function removeOne(item: PosterItem) {
  _showSimpleConfirmDialog('从历史记录中移除？', async () => {
    await clearHistory(item.id)
    await loadPosters()
  })
}

function clearAll() {
  _showSimpleConfirmDialog('清空全部观看历史？', async () => {
    await clearHistory()
    await loadPosters()
  })
}

function nav(path: string) {
  router.push(path)
}

onMounted(() => {
  void loadPosters()
})

onActivated(() => {
  void loadPosters()
})
</script>

<style scoped lang="less">
.history {
  position: fixed;
  inset: 0;
  background: var(--main-bg, #151723);
  color: #fff;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  .top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14rem 16rem;

    .title {
      font-size: 16rem;
      font-weight: 600;
    }

    .right {
      display: flex;
      align-items: center;
      gap: 14rem;

      .mode {
        display: flex;
        align-items: center;
        gap: 4rem;
        font-size: 12rem;
        color: rgba(255, 255, 255, 0.7);
        cursor: pointer;
      }

      .action {
        font-size: 20rem;
        opacity: 0.7;
        cursor: pointer;
      }
    }
  }

  .body {
    flex: 1;
    overflow: hidden;
    padding-bottom: var(--footer-height, 56rem);
    box-sizing: border-box;
    position: relative;

    .view {
      height: 100%;
    }
  }

  .scroll {
    height: 100%;
    overflow: auto;
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12rem;
    padding: 70rem 20rem;
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
    }
  }

  .loading {
    text-align: center;
    padding: 20rem;
    font-size: 12rem;
    color: rgba(255, 255, 255, 0.4);
  }
}
</style>
