<template>
  <div class="video-feed" v-if="state.list.length || state.loading || !emptyHint">
    <SlideVerticalInfinite
      ref="listRef"
      :id="props.uniqueId"
      :uniqueId="props.uniqueId"
      name="infinite"
      :active="props.active"
      :loading="loading"
      v-model:index="state.index"
      :render="render"
      :list="state.list"
      :preload-ahead="preloadAhead"
      @loadMore="loadMore"
      @refresh="onPullRefresh"
    />
  </div>
  <div class="empty" v-else>
    <slot name="empty">
      <Icon icon="mdi:movie-open-outline" class="empty-icon" />
      <p>{{ emptyHint }}</p>
    </slot>
  </div>
</template>

<script setup lang="tsx">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import SlideVerticalInfinite from '@/components/slide/SlideVerticalInfinite.vue'
import bus, { EVENT_KEY } from '@/utils/bus'
import { slideItemRender } from '@/utils'
import { Icon } from '@iconify/vue'
import { useBaseStore } from '@/store/pinia'

const props = defineProps({
  /** 取数据的函数，(start, pageSize) => { total, list } */
  fetcher: {
    type: Function as unknown as () => (
      start: number,
      pageSize: number
    ) => Promise<{ total: number; list: any[] }>,
    required: true
  },
  active: {
    type: Boolean,
    default: true
  },
  uniqueId: {
    type: String,
    default: 'feed'
  },
  index: {
    type: Number,
    default: 0
  },
  pageSize: {
    type: Number,
    default: 8
  },
  emptyHint: {
    type: String,
    default: ''
  },
  /** 外部注入的初始列表（如从合集/喜欢直接进入） */
  initialList: {
    type: Array as () => any[],
    default: () => []
  },
  initialIndex: {
    type: Number,
    default: 0
  }
})

const emit = defineEmits(['update:index', 'loaded', 'refresh'])

const store = useBaseStore()
const render = slideItemRender({})
const listRef = ref<any>(null)
const state = reactive({
  index: props.initialIndex ?? props.index,
  list: [...props.initialList] as any[],
  total: 0,
  /** 已经请求过的条目数（用请求量而不是去重后的列表长度计算分页，避免漏条） */
  offset: props.initialList.length,
  loading: false,
  exhausted: false
})

const loading = computed(() => state.loading)
const preloadAhead = computed(() => {
  const value = Number(store.prefs?.preloadAhead ?? 2)
  return Number.isFinite(value) ? Math.max(0, Math.min(3, Math.round(value))) : 2
})

watch(
  () => state.index,
  (val) => emit('update:index', val)
)

async function refresh(reset = false) {
  if (state.loading) return
  state.loading = true
  try {
    const start = reset ? 0 : state.offset
    const data = await props.fetcher(start, props.pageSize)
    const incoming = data.list ?? []
    state.total = data.total ?? 0
    if (reset) {
      state.index = 0
      state.list = [...incoming]
      state.offset = incoming.length
      state.exhausted = !incoming.length || state.list.length >= state.total
    } else {
      state.offset = start + incoming.length
      const existing = new Set(state.list.map((v) => v.aweme_id))
      const merged = incoming.filter((v) => !existing.has(v.aweme_id))
      // 只有真的拿到新条目才替换数组：空结果不应触发列表重建 / 视频重新缓冲
      if (merged.length) state.list = state.list.concat(merged)
      if (!incoming.length || state.list.length >= state.total) state.exhausted = true
    }
    emit('loaded', { total: state.total, length: state.list.length })
  } finally {
    state.loading = false
  }
}

function loadMore() {
  if (state.exhausted || state.loading) return
  void refresh(false)
}

/**
 * 第一页继续下拉：把刷新交给页面处理。
 * 页面可以先做准备工作（例如换推荐 seed）再调用 refresh(true)，顺序可控。
 */
function onPullRefresh() {
  emit('refresh')
}

function updateItem({ position, item }: any) {
  if (position?.uniqueId !== props.uniqueId) return
  if (state.list[position.index]) state.list[position.index] = item
}

function togglePlay() {
  if (!props.active) return
  bus.emit(EVENT_KEY.SINGLE_CLICK_BROADCAST, {
    uniqueId: props.uniqueId,
    index: state.index,
    type: EVENT_KEY.ITEM_TOGGLE
  })
}

onMounted(() => {
  if (!state.list.length) void refresh(true)
  bus.on(EVENT_KEY.UPDATE_ITEM, updateItem)
  bus.on(EVENT_KEY.TOGGLE_CURRENT_VIDEO, togglePlay)
})

onUnmounted(() => {
  bus.off(EVENT_KEY.UPDATE_ITEM, updateItem)
  bus.off(EVENT_KEY.TOGGLE_CURRENT_VIDEO, togglePlay)
})

watch(
  () => props.active,
  (val) => {
    if (val && !state.list.length) void refresh(true)
  }
)

defineExpose({ refresh, state, listRef })
</script>

<style scoped lang="less">
.video-feed {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.empty {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.45);
  gap: 10rem;
  font-size: 13rem;

  .empty-icon {
    font-size: 46rem;
    opacity: 0.5;
  }
}
</style>
