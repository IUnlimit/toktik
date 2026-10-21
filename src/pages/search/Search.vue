<template>
  <div class="search-page">
    <div class="bar">
      <Icon icon="icon-park-outline:left" class="back" @click="back" />
      <div class="input">
        <Icon icon="mdi:magnify" class="icon" />
        <input
          ref="inputEl"
          v-model="state.q"
          placeholder="搜索标题或合集名"
          @keyup.enter="doSearch"
        />
        <Icon icon="mdi:close" class="clear" v-if="state.q" @click="clear" />
      </div>
      <span class="action" @click="doSearch">搜索</span>
    </div>

    <div class="body">
      <div class="result" v-if="state.list.length">
        <div class="count">共 {{ state.total }} 个结果</div>
        <Posters :list="state.list" @open="open" />
      </div>
      <div class="empty" v-else-if="state.searched && !state.loading">
        <Icon icon="mdi:magnify-close" class="empty-icon" />
        <p>没有找到匹配的视频</p>
      </div>
      <div class="tips" v-else-if="!state.loading">
        <p>输入关键词搜索本地库中的视频标题或合集名</p>
      </div>
      <div class="loading" v-if="state.loading">搜索中…</div>
    </div>

    <ItemInfoDialog />
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import Posters from '@/components/Posters.vue'
import ItemInfoDialog from '@/components/ItemInfoDialog.vue'
import { searchLibrary } from '@/api/user'
import type { PosterItem } from '@shared/aweme'

defineOptions({ name: 'Search' })

const router = useRouter()
const inputEl = ref<HTMLInputElement>()

const state = reactive({
  q: '',
  loading: false,
  searched: false,
  total: 0,
  list: [] as PosterItem[]
})

async function doSearch() {
  const q = state.q.trim()
  if (!q) return
  state.loading = true
  try {
    const res: any = await searchLibrary(q)
    state.list = res.success ? (res.data?.list ?? []) : []
    state.total = res.data?.total ?? state.list.length
    state.searched = true
  } finally {
    state.loading = false
  }
}

function clear() {
  state.q = ''
  state.list = []
  state.searched = false
  inputEl.value?.focus()
}

function open({ item }: { item: PosterItem }) {
  router.push({ path: '/video-detail', query: { id: item.id } })
}

function back() {
  if (window.history.length > 1) router.back()
  else router.replace('/home')
}

onMounted(() => {
  void nextTick(() => inputEl.value?.focus())
})
</script>

<style scoped lang="less">
.search-page {
  position: fixed;
  inset: 0;
  background: var(--main-bg, #151723);
  color: #fff;
  display: flex;
  flex-direction: column;

  .bar {
    display: flex;
    align-items: center;
    gap: 10rem;
    padding: 12rem 14rem;

    .back {
      font-size: 20rem;
      opacity: 0.85;
      cursor: pointer;
    }

    .input {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 6rem;
      height: 34rem;
      padding: 0 10rem;
      border-radius: 17rem;
      background: rgba(255, 255, 255, 0.08);

      .icon,
      .clear {
        font-size: 17rem;
        opacity: 0.55;
      }

      input {
        flex: 1;
        min-width: 0;
        background: transparent;
        border: none;
        outline: none;
        color: #fff;
        font-size: 13rem;
      }
    }

    .action {
      font-size: 13rem;
      color: var(--primary-btn-color, #fc2f56);
      cursor: pointer;
    }
  }

  .body {
    flex: 1;
    overflow: auto;
    padding-bottom: 20rem;
  }

  .result .count {
    padding: 4rem 16rem 10rem;
    font-size: 11rem;
    color: rgba(255, 255, 255, 0.45);
  }

  .empty,
  .tips {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12rem;
    padding: 90rem 30rem;
    color: rgba(255, 255, 255, 0.45);
    font-size: 13rem;
    text-align: center;

    .empty-icon {
      font-size: 46rem;
      opacity: 0.5;
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
