<template>
  <div class="posters">
    <div
      class="poster-item"
      :key="i.id"
      v-for="(i, index) in list"
      :class="{ unplayable: i.playable === false }"
      @click="onClick(i, index)"
      @contextmenu.prevent="onLongPress(i)"
    >
      <img class="poster" :src="i.coverUrl || ''" alt="" loading="lazy" />
      <div class="top" v-if="i.badge">{{ i.badge }}</div>
      <div class="num">
        <span>{{ _duration((i.durationMs || 0) / 1000) }}</span>
      </div>
      <div class="progress" v-if="showProgress && (i.positionSec || 0) > 0">
        <div class="bar" :style="{ width: progressWidth(i) }"></div>
      </div>
      <div class="title">{{ i.title }}</div>
      <div class="unplayable-tip" v-if="i.playable === false">浏览器不支持该格式</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { _duration } from '@/utils'
import type { PosterItem } from '@shared/aweme'

const props = defineProps({
  list: {
    type: Array as () => PosterItem[],
    default: () => []
  },
  mode: {
    type: String,
    default: 'normal'
  },
  showProgress: {
    type: Boolean,
    default: false
  },
  /** 网格列数，默认 3 */
  columns: {
    type: Number,
    default: 3
  }
})

const emit = defineEmits(['open', 'longpress'])

function onClick(item: PosterItem, index: number) {
  if (item.playable === false) return
  emit('open', { item, index })
}

function onLongPress(item: PosterItem) {
  emit('longpress', item)
}

function progressWidth(item: PosterItem): string {
  const total = item.durationMs || 0
  const pos = (item.positionSec || 0) * 1000
  if (!total) return '0%'
  return Math.min(100, Math.round((pos / total) * 100)) + '%'
}

void props.mode
void props.columns
</script>

<style scoped lang="less">
.posters {
  display: grid;
  grid-template-columns: 33.33% 33.33% 33.33%;
}

.poster-item {
  height: 200rem;
  max-height: calc(33.33vw * 1.42);
  overflow: hidden;
  position: relative;
  background: #14161f;

  .poster {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
  }

  &.unplayable .poster {
    opacity: 0.45;
  }

  .top {
    position: absolute;
    font-size: 12rem;
    background: gold;
    color: black;
    padding: 2rem 3rem;
    border-radius: 2rem;
    top: 7rem;
    left: 7rem;
  }

  .num {
    color: white;
    position: absolute;
    bottom: 5rem;
    right: 6rem;
    display: flex;
    align-items: center;
    font-size: 12rem;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
  }

  .title {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    padding: 16rem 6rem 5rem;
    font-size: 11rem;
    color: rgba(255, 255, 255, 0.92);
    background: linear-gradient(to top, rgba(0, 0, 0, 0.75), transparent);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .progress {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 2rem;
    background: rgba(255, 255, 255, 0.22);

    .bar {
      height: 100%;
      background: var(--primary-btn-color, #fc2f56);
    }
  }

  .unplayable-tip {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 11rem;
    color: #fff;
    background: rgba(0, 0, 0, 0.6);
    padding: 4rem 6rem;
    border-radius: 4rem;
    white-space: nowrap;
  }
}
</style>
