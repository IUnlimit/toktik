<template>
  <div class="item-desc ml1r mb1r">
    <div class="content">
      <div class="episode" v-if="episodeLabel">{{ episodeLabel }}</div>
      <div class="name mb1r f18 fb" @click.stop="goCollection">
        @{{ item?.author?.nickname || '未分类' }}
      </div>
      <div class="description" @click.stop="toggleExpand" :class="{ expanded: expanded }">
        {{ item.desc }}
      </div>
      <div class="paths">
        <span>{{ durationLabel }}</span>
        <span class="dot">·</span>
        <span>{{ sourceLabel }}</span>
        <span class="dot" v-if="!playable">·</span>
        <span class="warn" v-if="!playable">浏览器不支持该格式</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import bus, { EVENT_KEY } from '@/utils/bus'
import { _duration } from '@/utils'

const props = defineProps({
  isMy: {
    type: Boolean,
    default: () => false
  },
  isLive: {
    type: Boolean,
    default: () => false
  }
})

const item = inject<any>('item')
const expanded = ref(false)

const episodeLabel = computed(() => {
  const ep = item.value?.toktik?.episode
  if (ep === null || ep === undefined) return ''
  return `第 ${ep} 集`
})

const durationLabel = computed(() => {
  const ms = item.value?.toktik?.durationMs || 0
  return ms ? _duration(ms / 1000) : '时长未知'
})

const sourceLabel = computed(() => {
  const path = item.value?.toktik?.path || ''
  const name = path.slice(path.lastIndexOf('/') + 1)
  return name || '本地文件'
})

const playable = computed(() => item.value?.toktik?.playable !== false)

function toggleExpand() {
  expanded.value = !expanded.value
}

function goCollection() {
  const name = item.value?.toktik?.collection
  if (name) bus.emit(EVENT_KEY.GO_COLLECTION, name)
}

void props
</script>

<style scoped lang="less">
.item-desc {
  position: absolute;
  bottom: 0;
  width: 70%;

  .content {
    color: #fff;
    text-align: left;

    .episode {
      display: inline-flex;
      margin-bottom: 8rem;
      padding: 3rem 8rem;
      border-radius: 4rem;
      font-size: 11rem;
      background: var(--primary-btn-color, #fc2f56);
    }

    .name {
      font-size: 16rem;
      font-weight: 600;
      margin-bottom: 6rem;
    }

    .description {
      font-size: 14rem;
      line-height: 1.45;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;

      &.expanded {
        -webkit-line-clamp: unset;
      }
    }

    .paths {
      margin-top: 8rem;
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 4rem;
      font-size: 11rem;
      color: rgba(255, 255, 255, 0.62);

      .dot {
        opacity: 0.5;
      }

      .warn {
        color: #ffb057;
      }
    }
  }
}
</style>
