<template>
  <div id="video-detail">
    <div class="top">
      <Icon icon="icon-park-outline:left" class="back" @click="back" />
      <div class="title">
        <span class="name">{{ title }}</span>
        <span class="sub" v-if="subtitle">{{ subtitle }}</span>
      </div>
      <Icon icon="mdi:information-outline" class="info" @click="showInfo" />
    </div>

    <div class="content">
      <VideoFeed
        v-if="state.ready"
        :key="state.detail?.aweme_id"
        unique-id="detail"
        :active="true"
        :fetcher="fetcher"
        :initial-list="state.initialList"
        empty-hint="视频不存在或已被移除"
      />
      <div class="loading" v-else>
        <Icon icon="mdi:loading" class="spin" />
        <span>加载中…</span>
      </div>
    </div>

    <ItemInfoDialog />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import VideoFeed from '@/components/VideoFeed.vue'
import ItemInfoDialog from '@/components/ItemInfoDialog.vue'
import { recommendedVideo, videoDetail } from '@/api/videos'
import bus, { EVENT_KEY } from '@/utils/bus'
import { _duration, _notice } from '@/utils'
import type { Aweme } from '@shared/aweme'

defineOptions({ name: 'VideoDetail' })

const route = useRoute()
const router = useRouter()

const state = reactive({
  ready: false,
  extra: 0,
  detail: null as Aweme | null,
  initialList: [] as Aweme[]
})

const title = computed(() => state.detail?.toktik?.collection || '视频详情')
const subtitle = computed(() => {
  const item = state.detail
  if (!item) return ''
  const ep = item.toktik?.episode
  const parts: string[] = []
  if (ep !== null && ep !== undefined) parts.push(`第 ${ep} 集`)
  if (item.toktik?.durationMs) parts.push(_duration(item.toktik.durationMs / 1000))
  return parts.join(' · ')
})

async function fetcher(start: number, pageSize: number) {
  // 首屏只有被点开的这一条；后续翻页从推荐流里补充，跳过重复项
  if (start === 0) {
    state.extra = 0
    const list = state.detail ? [state.detail] : []
    return { total: list.length, list }
  }
  const res: any = await recommendedVideo({ start: state.extra, pageSize })
  const batch: Aweme[] = res.success ? (res.data?.list ?? []) : []
  state.extra += batch.length
  const list = batch.filter((v) => v.aweme_id !== state.detail?.aweme_id)
  const total = res.success ? Number(res.data?.total ?? 0) + 1 : list.length
  return { total, list }
}

function back() {
  if (window.history.length > 1) router.back()
  else router.replace('/home')
}

function showInfo() {
  if (state.detail) bus.emit(EVENT_KEY.SHOW_INFO, state.detail)
}

async function load() {
  const id = String(route.query.id ?? '')
  if (!id) {
    _notice('缺少视频 id')
    state.ready = true
    return
  }
  const res: any = await videoDetail(id)
  if (res.success && res.data) {
    state.detail = res.data
    state.initialList = [res.data]
  } else {
    _notice('视频不存在或已被移除')
  }
  state.ready = true
}

onMounted(load)
</script>

<style scoped lang="less">
#video-detail {
  position: fixed;
  inset: 0;
  background: #000;
  color: #fff;
  overflow: hidden;

  .top {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 6;
    display: flex;
    align-items: center;
    gap: 10rem;
    padding: 12rem 14rem;

    .back,
    .info {
      font-size: 20rem;
      opacity: 0.85;
      cursor: pointer;
    }

    .title {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;

      .name {
        font-size: 14rem;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .sub {
        font-size: 11rem;
        color: rgba(255, 255, 255, 0.5);
      }
    }
  }

  .content {
    width: 100%;
    height: 100%;
  }

  .loading {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10rem;
    font-size: 13rem;
    color: rgba(255, 255, 255, 0.55);

    .spin {
      font-size: 28rem;
      animation: spin 1s linear infinite;
    }
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
