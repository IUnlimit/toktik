<template>
  <div class="video-manager">
    <div class="top-bar">
      <Icon icon="icon-park-outline:left" class="back" @click="back" />
      <span class="title">视频管理</span>
      <Icon icon="mdi:refresh" class="action" :class="{ spin: state.loading }" @click="reload" />
    </div>

    <div class="scroll">
      <div class="card filter">
        <div class="field">
          <label>数据源</label>
          <div class="chips">
            <span
              class="chip"
              :class="{ active: !state.filter.sourceIds.length }"
              @click="clearSources"
            >
              全部
            </span>
            <span
              class="chip"
              v-for="s in store.sources"
              :key="s.id"
              :class="{ active: state.filter.sourceIds.includes(s.id) }"
              @click="toggleSource(s.id)"
            >
              {{ s.name }}
            </span>
          </div>
        </div>

        <div class="field">
          <label>状态</label>
          <div class="chips">
            <span
              class="chip"
              v-for="opt in STATE_OPTIONS"
              :key="opt.value"
              :class="{ active: state.filter.state === opt.value }"
              @click="state.filter.state = opt.value"
            >
              {{ opt.label }}
            </span>
          </div>
        </div>

        <div class="field">
          <label>关键词</label>
          <input v-model="state.filter.q" placeholder="标题或路径" />
        </div>

        <div class="field">
          <label>时长</label>
          <div class="range">
            <input v-model.number="state.filter.minMinutes" type="number" min="0" placeholder="最小" />
            <span>~</span>
            <input v-model.number="state.filter.maxMinutes" type="number" min="0" placeholder="最大" />
            <span>分钟</span>
          </div>
        </div>

        <div class="field">
          <label>大小</label>
          <div class="range">
            <input v-model.number="state.filter.minMb" type="number" min="0" placeholder="最小" />
            <span>~</span>
            <input v-model.number="state.filter.maxMb" type="number" min="0" placeholder="最大" />
            <span>MB</span>
          </div>
        </div>

        <div class="field">
          <label>刮削</label>
          <div class="chips">
            <span
              class="chip"
              v-for="opt in META_OPTIONS"
              :key="opt.value"
              :class="{ active: state.filter.meta === opt.value }"
              @click="state.filter.meta = opt.value"
            >
              {{ opt.label }}
            </span>
          </div>
        </div>

        <div class="field">
          <label>排序</label>
          <select v-model="state.filter.sortKey">
            <option v-for="opt in SORT_OPTIONS" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>

        <div class="filter-ops">
          <button class="mini" @click="resetFilter">重置筛选</button>
          <span class="hint">时长筛选只匹配已刮削的条目</span>
        </div>
      </div>

      <div class="card summary">
        <div class="summary-row">
          <span>匹配 <b>{{ state.data.total }}</b> 条</span>
          <span class="ok">启用 {{ state.data.enabled }}</span>
          <span class="off">禁用 {{ state.data.disabled }}</span>
          <span>{{ _formatBytes(state.data.bytes) }}</span>
        </div>
        <div class="summary-row sub">
          <span v-if="state.data.durationMs">{{ _duration(Math.round(state.data.durationMs / 1000)) }}</span>
          <span v-if="state.data.pendingMeta" class="warn">
            {{ state.data.pendingMeta }} 条时长待刮削，不计入时长筛选
          </span>
        </div>
        <div class="summary-ops">
          <button class="mini primary" :disabled="!state.data.total || state.loading" @click="bulk(true)">
            全部启用
          </button>
          <button class="mini danger" :disabled="!state.data.total || state.loading" @click="bulk(false)">
            全部禁用
          </button>
        </div>
      </div>

      <div class="card list" v-if="state.data.list.length">
        <div class="row" v-for="v in state.data.list" :key="v.id">
          <div class="main">
            <div class="line-title">
              <b class="ellipsis">{{ v.title }}</b>
              <span class="tag">{{ v.collection }}</span>
            </div>
            <div class="line-path ellipsis">{{ v.sourceName }} · {{ v.path }}</div>
            <div class="line-meta">
              <span>{{ v.durationMs ? _duration(Math.round(v.durationMs / 1000)) : '时长待刮削' }}</span>
              <span>{{ _formatBytes(v.size) }}</span>
              <span>{{ metaText(v.metaStatus) }}</span>
              <span v-if="!v.playable" class="warn">需转码</span>
              <span v-if="!v.enabled" class="off">已禁用</span>
            </div>
          </div>
          <label class="switch">
            <input
              type="checkbox"
              :checked="v.enabled"
              :disabled="pending.has(v.id)"
              @change="toggle(v)"
            />
            <span class="slider"></span>
          </label>
        </div>
      </div>

      <div class="empty" v-else-if="!state.loading">
        <Icon icon="mdi:video-off-outline" class="empty-icon" />
        <p>{{ hasFilter ? '没有匹配的视频，试试放宽筛选条件' : '还没有扫描到视频，先到数据源页扫描' }}</p>
      </div>

      <div class="pager" v-if="state.data.total > state.data.pageSize">
        <button class="mini" :disabled="state.data.pageNo <= 0 || state.loading" @click="goPage(-1)">
          上一页
        </button>
        <span>{{ state.data.pageNo + 1 }} / {{ totalPages }}</span>
        <button
          class="mini"
          :disabled="state.data.pageNo >= totalPages - 1 || state.loading"
          @click="goPage(1)"
        >
          下一页
        </button>
      </div>

      <p class="footnote">
        被禁用的视频不会出现在推荐、合集、搜索、喜欢和历史里，重新启用后恢复；扫描与重新刮削都不会覆盖这里的选择。
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, onMounted, onUnmounted, reactive, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { useBaseStore } from '@/store/pinia'
import { bulkManagedVideos, queryManagedVideos, toggleManagedVideo } from '@/api/library'
import type { ManagedQuery, ManagedVideo, VideoFilter } from '@/api/library'
import bus, { EVENT_KEY } from '@/utils/bus'
import { _duration, _formatBytes, _notice, _showSimpleConfirmDialog } from '@/utils'

defineOptions({ name: 'VideoManager' })

const route = useRoute()
const router = useRouter()
const store = useBaseStore()

const STATE_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'enabled', label: '已启用' },
  { value: 'disabled', label: '已禁用' }
] as const

const META_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'done', label: '已刮削' },
  { value: 'pending', label: '待刮削' },
  { value: 'failed', label: '失败' }
] as const

const SORT_OPTIONS = [
  { value: 'mtime', label: '最近扫描' },
  { value: 'name', label: '名称' },
  { value: 'size', label: '大小（大→小）' },
  { value: 'duration', label: '时长（长→短）' }
] as const

const state = reactive({
  loading: false,
  filter: {
    sourceIds: [] as string[],
    state: 'all' as 'all' | 'enabled' | 'disabled',
    q: '',
    minMinutes: '' as number | string,
    maxMinutes: '' as number | string,
    minMb: '' as number | string,
    maxMb: '' as number | string,
    meta: 'all' as 'all' | 'done' | 'pending' | 'failed',
    sortKey: 'mtime' as 'mtime' | 'name' | 'size' | 'duration'
  },
  data: {
    total: 0,
    enabled: 0,
    disabled: 0,
    bytes: 0,
    durationMs: 0,
    pendingMeta: 0,
    pageNo: 0,
    pageSize: 50,
    list: [] as ManagedVideo[]
  } as ManagedQuery
})

/** 正在请求单条切换的 id，避免重复点击 */
const pending = reactive(new Set<string>())
/** 最近一次实际查询使用的条件：批量操作必须与摘要显示的结果集一致 */
let appliedFilter: VideoFilter = {}
let loadSeq = 0
let debounceTimer: number | null = null
let lastQuerySource = ''

const totalPages = computed(() => {
  return Math.max(1, Math.ceil(state.data.total / Math.max(1, state.data.pageSize)))
})

const hasFilter = computed(() => {
  const f = state.filter
  const positive = (value: number | string) => value !== '' && Number(value) > 0
  return Boolean(
    f.sourceIds.length ||
      f.q.trim() ||
      f.state !== 'all' ||
      f.meta !== 'all' ||
      positive(f.minMinutes) ||
      positive(f.maxMinutes) ||
      positive(f.minMb) ||
      positive(f.maxMb)
  )
})

function metaText(status: ManagedVideo['metaStatus']) {
  if (status === 'done') return '已刮削'
  if (status === 'failed') return '刮削失败'
  return '待刮削'
}

function positiveOrUndefined(value: number | string) {
  if (value === '' || value === null || value === undefined) return undefined
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? num : undefined
}

function buildFilter(): VideoFilter {
  const f = state.filter
  const minMinutes = positiveOrUndefined(f.minMinutes)
  const maxMinutes = positiveOrUndefined(f.maxMinutes)
  const minMb = positiveOrUndefined(f.minMb)
  const maxMb = positiveOrUndefined(f.maxMb)
  const sortMap: Record<string, { sort: VideoFilter['sort']; order: VideoFilter['order'] }> = {
    mtime: { sort: 'mtime', order: 'desc' },
    name: { sort: 'name', order: 'asc' },
    size: { sort: 'size', order: 'desc' },
    duration: { sort: 'duration', order: 'desc' }
  }
  const order = sortMap[f.sortKey] ?? sortMap.mtime
  return {
    sourceIds: [...f.sourceIds],
    q: f.q.trim() || undefined,
    state: f.state,
    meta: f.meta,
    minDurationMs: minMinutes === undefined ? undefined : Math.round(minMinutes * 60_000),
    maxDurationMs: maxMinutes === undefined ? undefined : Math.round(maxMinutes * 60_000),
    minSize: minMb === undefined ? undefined : Math.round(minMb * 1024 * 1024),
    maxSize: maxMb === undefined ? undefined : Math.round(maxMb * 1024 * 1024),
    sort: order.sort,
    order: order.order
  }
}

async function load(pageNo = 0) {
  const seq = ++loadSeq
  const filter = buildFilter()
  state.loading = true
  try {
    const res: any = await queryManagedVideos(filter, pageNo)
    if (seq !== loadSeq) return
    if (res.success && res.data) {
      state.data = res.data
      appliedFilter = filter
    }
  } finally {
    if (seq === loadSeq) state.loading = false
  }
}

function reload() {
  void load(0)
}

/** 条件变化后延迟查询，避免关键词输入时每敲一个字都查一次 */
function scheduleLoad() {
  if (debounceTimer) window.clearTimeout(debounceTimer)
  debounceTimer = window.setTimeout(() => {
    debounceTimer = null
    void load(0)
  }, 250)
}

function toggleSource(id: string) {
  const index = state.filter.sourceIds.indexOf(id)
  if (index >= 0) state.filter.sourceIds.splice(index, 1)
  else state.filter.sourceIds.push(id)
}

function clearSources() {
  state.filter.sourceIds = []
}

function resetFilter() {
  state.filter.sourceIds = []
  state.filter.state = 'all'
  state.filter.meta = 'all'
  state.filter.q = ''
  state.filter.minMinutes = ''
  state.filter.maxMinutes = ''
  state.filter.minMb = ''
  state.filter.maxMb = ''
  state.filter.sortKey = 'mtime'
}

function goPage(delta: number) {
  const target = state.data.pageNo + delta
  if (target < 0 || target >= totalPages.value) return
  void load(target)
}

async function afterChange() {
  await load(state.data.pageNo)
  if (!state.data.list.length && state.data.pageNo > 0) {
    await load(state.data.pageNo - 1)
  }
  await store.refreshAll()
  bus.emit(EVENT_KEY.LIBRARY_CHANGED)
}

async function toggle(video: ManagedVideo) {
  if (pending.has(video.id)) return
  const next = !video.enabled
  video.enabled = next
  pending.add(video.id)
  try {
    const res: any = await toggleManagedVideo(video.id, next)
    if (!res.success) {
      video.enabled = !next
      _notice('操作失败，请重试')
      return
    }
    await afterChange()
  } finally {
    pending.delete(video.id)
  }
}

function bulk(enabled: boolean) {
  const label = enabled ? '启用' : '禁用'
  _showSimpleConfirmDialog(`对当前筛选结果（${state.data.total} 条）全部${label}？`, async () => {
    const res: any = await bulkManagedVideos(appliedFilter, enabled)
    if (!res.success) {
      _notice('操作失败，请重试')
      return
    }
    _notice(`已${label} ${res.data?.updated ?? 0} 条`)
    await load(0)
    await store.refreshAll()
    bus.emit(EVENT_KEY.LIBRARY_CHANGED)
  })
}

function routeSourceId() {
  return String(route.query.sourceId ?? '')
}

function applyRouteSource() {
  const id = routeSourceId()
  if (id === lastQuerySource) return false
  lastQuerySource = id
  state.filter.sourceIds = id ? [id] : []
  return true
}

function back() {
  if (window.history.length > 1) router.back()
  else router.replace('/sources')
}

onMounted(async () => {
  await store.init()
  applyRouteSource()
  await load(0)
})

onActivated(async () => {
  await store.loadSources()
  if (applyRouteSource()) await load(0)
  else await load(state.data.pageNo)
})

onUnmounted(() => {
  if (debounceTimer) window.clearTimeout(debounceTimer)
})

// 筛选条件变化后统一延迟查询：关键词防抖，连续点击 chips 也只查一次
watch(() => state.filter, () => scheduleLoad(), { deep: true })

// 从数据源卡片带着 sourceId 再次进入同一页面时，同步预筛选条件
watch(
  () => route.query.sourceId,
  () => {
    if (applyRouteSource()) void load(0)
  }
)
</script>

<style scoped lang="less">
.video-manager {
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

    .back,
    .action {
      font-size: 20rem;
      opacity: 0.85;
      cursor: pointer;
    }

    .title {
      font-size: 15rem;
      font-weight: 600;
    }

    .spin {
      animation: spin 1.2s linear infinite;
    }
  }

  .scroll {
    flex: 1;
    overflow: auto;
    padding: 0 12rem 24rem;
  }

  .card {
    border-radius: 12rem;
    background: rgba(255, 255, 255, 0.05);
    padding: 12rem 14rem;
    margin-bottom: 10rem;
    font-size: 12rem;
  }

  .filter {
    .field {
      display: flex;
      align-items: center;
      gap: 10rem;
      padding: 6rem 0;

      > label {
        flex: none;
        width: 48rem;
        color: rgba(255, 255, 255, 0.45);
        font-size: 11rem;
      }

      input,
      select {
        flex: 1;
        min-width: 0;
        height: 30rem;
        padding: 0 10rem;
        border-radius: 8rem;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.08);
        color: #fff;
        font-size: 12rem;
        outline: none;

        &:focus {
          border-color: rgba(252, 47, 86, 0.6);
        }
      }

      select {
        appearance: none;
        padding-right: 24rem;
      }
    }

    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6rem;
      flex: 1;
      min-width: 0;

      .chip {
        padding: 4rem 10rem;
        border-radius: 12rem;
        background: rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.6);
        font-size: 11rem;
        cursor: pointer;

        &.active {
          background: rgba(252, 47, 86, 0.2);
          color: #ff8fa4;
        }
      }
    }

    .range {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 6rem;

      input {
        flex: 1;
        min-width: 0;
      }

      span {
        flex: none;
        color: rgba(255, 255, 255, 0.4);
        font-size: 11rem;
      }
    }

    .filter-ops {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 8rem;

      .hint {
        color: rgba(255, 255, 255, 0.32);
        font-size: 10rem;
      }
    }
  }

  .summary {
    .summary-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12rem;
      font-size: 12rem;
      color: rgba(255, 255, 255, 0.7);

      b {
        color: #fff;
      }

      &.sub {
        margin-top: 6rem;
        font-size: 11rem;
        color: rgba(255, 255, 255, 0.4);
      }

      .ok {
        color: #46d17f;
      }

      .off {
        color: #ff7b93;
      }

      .warn {
        color: #ffb057;
      }
    }

    .summary-ops {
      display: flex;
      gap: 8rem;
      margin-top: 10rem;
    }
  }

  .list {
    padding: 0;

    .row {
      display: flex;
      align-items: center;
      gap: 10rem;
      padding: 10rem 14rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);

      &:last-child {
        border-bottom: none;
      }

      .main {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 3rem;
      }

      .line-title {
        display: flex;
        align-items: center;
        gap: 6rem;
        min-width: 0;

        b {
          font-size: 13rem;
          font-weight: 600;
        }

        .tag {
          flex: none;
          padding: 1rem 6rem;
          border-radius: 3rem;
          background: rgba(255, 255, 255, 0.08);
          color: rgba(255, 255, 255, 0.5);
          font-size: 10rem;
        }
      }

      .line-path {
        font-size: 10rem;
        color: rgba(255, 255, 255, 0.35);
      }

      .line-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8rem;
        font-size: 10rem;
        color: rgba(255, 255, 255, 0.42);

        .warn {
          color: #ffb057;
        }

        .off {
          color: #ff7b93;
        }
      }
    }
  }

  .ellipsis {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12rem;
    padding: 60rem 20rem;
    color: rgba(255, 255, 255, 0.5);
    font-size: 13rem;

    .empty-icon {
      font-size: 44rem;
      opacity: 0.45;
    }
  }

  .pager {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14rem;
    padding: 6rem 0 12rem;
    font-size: 11rem;
    color: rgba(255, 255, 255, 0.45);
  }

  .mini {
    height: 28rem;
    padding: 0 12rem;
    border-radius: 14rem;
    border: none;
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    font-size: 11rem;
    cursor: pointer;

    &:disabled {
      opacity: 0.4;
      cursor: default;
    }

    &.primary {
      background: rgba(70, 209, 127, 0.18);
      color: #6ee0a2;
    }

    &.danger {
      background: rgba(252, 47, 86, 0.18);
      color: #ff7b93;
    }
  }

  .switch {
    position: relative;
    flex: none;
    width: 40rem;
    height: 23rem;
    cursor: pointer;

    input {
      display: none;
    }

    .slider {
      position: absolute;
      inset: 0;
      border-radius: 12rem;
      background: rgba(255, 255, 255, 0.15);
      transition: background 0.2s;

      &::before {
        content: '';
        position: absolute;
        top: 3rem;
        left: 3rem;
        width: 17rem;
        height: 17rem;
        border-radius: 50%;
        background: #fff;
        transition: transform 0.2s;
      }
    }

    input:checked + .slider {
      background: var(--primary-btn-color, #fc2f56);

      &::before {
        transform: translateX(17px);
      }
    }
  }

  .footnote {
    margin: 4rem 4rem 0;
    font-size: 10rem;
    line-height: 1.7;
    color: rgba(255, 255, 255, 0.3);
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
