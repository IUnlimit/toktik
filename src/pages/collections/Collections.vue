<template>
  <div class="collections">
    <transition name="fade-slide">
      <div class="view" v-if="state.name" key="feed">
        <div class="feed-head">
          <Icon icon="icon-park-outline:left" class="back" @click="backToList" />
          <div class="title">
            <span class="name">{{ state.name }}</span>
            <span class="sub">{{ state.total }} 个视频</span>
          </div>
        </div>
        <div class="feed">
          <VideoFeed
            :key="state.name"
            unique-id="collection"
            :active="true"
            :fetcher="fetchCollection"
            :initial-index="state.index"
            empty-hint="这个合集里没有可播放的视频"
          />
        </div>
      </div>

      <div class="view" v-else key="list">
        <div class="top-bar">
          <span class="title">合集</span>
          <Icon icon="mdi:refresh" class="action" @click="load" />
        </div>

        <div class="scroll">
          <div class="grid">
            <div class="card" :key="c.id" v-for="(c, i) in state.list" @click="open(c, i)">
              <div class="cover">
                <img :src="c.coverUrl || ''" alt="" loading="lazy" />
                <div class="badge">{{ _duration((c.durationMs || 0) / 1000) }}</div>
              </div>
              <div class="name">{{ c.title }}</div>
            </div>
          </div>

          <div class="empty" v-if="!state.list.length && !state.loading">
            <Icon icon="mdi:folder-multiple-outline" class="empty-icon" />
            <p>还没有合集，先添加数据源并扫描</p>
            <button class="primary" @click="nav('/sources')">管理数据源</button>
          </div>
          <div class="loading" v-if="state.loading">加载中…</div>
        </div>

        <BaseFooter :init-tab="2" />
      </div>
    </transition>

    <ItemInfoDialog />
  </div>
</template>

<script setup lang="ts">
import { onActivated, onMounted, onUnmounted, reactive, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import VideoFeed from '@/components/VideoFeed.vue'
import BaseFooter from '@/components/BaseFooter.vue'
import ItemInfoDialog from '@/components/ItemInfoDialog.vue'
import bus, { EVENT_KEY } from '@/utils/bus'
import { collectionList, collectionVideos } from '@/api/user'
import { _duration } from '@/utils'
import type { PosterItem } from '@shared/aweme'

defineOptions({ name: 'Collections' })

const route = useRoute()
const router = useRouter()

const state = reactive({
  loading: false,
  name: '' as string,
  index: 0,
  total: 0,
  list: [] as PosterItem[]
})

async function load() {
  state.loading = true
  try {
    const res: any = await collectionList()
    state.list = res.success ? (res.data?.list ?? []) : []
  } finally {
    state.loading = false
  }
}

async function fetchCollection(start: number, pageSize: number) {
  const res: any = await collectionVideos(state.name)
  if (!res.success) return { total: 0, list: [] }
  const all: any[] = res.data?.list ?? []
  state.total = all.length
  return { total: all.length, list: all.slice(start, start + pageSize) }
}

function open(item: PosterItem, index: number) {
  router.push({ path: '/collections', query: { name: item.collection, index: String(index) } })
}

function backToList() {
  router.push('/collections')
}

function nav(path: string) {
  router.push(path)
}

function syncQuery() {
  const name = (route.query.name as string) || ''
  const index = Number(route.query.index ?? 0)
  state.name = name
  state.index = Number.isFinite(index) ? index : 0
}

function onGoCollection(name: string) {
  if (!name) return
  router.push({ path: '/collections', query: { name } })
}

onMounted(async () => {
  syncQuery()
  if (!state.name) await load()
  bus.on(EVENT_KEY.GO_COLLECTION, onGoCollection)
})

watch(
  () => route.query,
  () => {
    const prev = state.name
    syncQuery()
    if (!state.name && prev) void load()
  }
)

onUnmounted(() => {
  bus.off(EVENT_KEY.GO_COLLECTION, onGoCollection)
})

onActivated(() => {
  syncQuery()
  if (!state.name) void load()
})
</script>

<style scoped lang="less">
.collections {
  position: fixed;
  inset: 0;
  background: var(--main-bg, #151723);
  color: #fff;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  // 列表与播放两个视图各自铺满，转场时互不挤压
  .view {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
  }

  .top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14rem 16rem;

    .title {
      font-size: 16rem;
      font-weight: 600;
    }

    .action {
      font-size: 20rem;
      opacity: 0.7;
    }
  }

  .scroll {
    flex: 1;
    overflow: auto;
    padding: 0 12rem calc(var(--footer-height, 56rem) + 12rem);
  }

  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10rem;
  }

  .card {
    border-radius: 10rem;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.05);
    cursor: pointer;

    .cover {
      position: relative;
      width: 100%;
      aspect-ratio: 3 / 4;
      background: #14161f;

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }

      .badge {
        position: absolute;
        right: 6rem;
        bottom: 6rem;
        font-size: 10rem;
        padding: 2rem 5rem;
        border-radius: 3rem;
        background: rgba(0, 0, 0, 0.6);
      }
    }

    .name {
      padding: 7rem 8rem;
      font-size: 12rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }

  .feed-head {
    display: flex;
    align-items: center;
    gap: 10rem;
    padding: 12rem 14rem 8rem;
    position: relative;
    z-index: 5;

    .back {
      font-size: 20rem;
      opacity: 0.85;
      cursor: pointer;
    }

    .title {
      display: flex;
      flex-direction: column;

      .name {
        font-size: 15rem;
        font-weight: 600;
      }

      .sub {
        font-size: 11rem;
        color: rgba(255, 255, 255, 0.45);
      }
    }
  }

  .feed {
    flex: 1;
    overflow: hidden;
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12rem;
    padding: 80rem 20rem;
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
