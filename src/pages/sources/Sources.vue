<template>
  <div class="sources">
    <div class="top-bar">
      <span class="title">数据源</span>
      <Icon icon="mdi:plus" class="action" @click="edit(null)" />
    </div>

    <div class="scroll">
      <div class="card tip-card" v-if="!store.ffmpeg">
        <div class="row">
          <Icon icon="mdi:alert-circle-outline" class="icon warn" />
          <div class="text">
            <b>服务器未安装 ffmpeg</b>
            <span>仍可扫描与播放，但读不到时长、分辨率，封面使用文字兜底</span>
          </div>
        </div>
      </div>

      <div class="card" v-for="s in state.list" :key="s.id">
        <div class="head">
          <span class="badge">{{ s.kindLabel }}</span>
          <span class="name">{{ s.name }}</span>
          <span class="count">
            {{ s.videoCount }} 个视频<template v-if="s.disabledCount"> · {{ s.disabledCount }} 已禁用</template>
          </span>
        </div>
        <div class="addr">{{ s.address }}</div>
        <div class="meta">
          <span>上次扫描：{{ s.lastScanAt ? _time(s.lastScanAt) : '从未' }}</span>
          <span v-if="!s.enabled" class="warn">已停用</span>
        </div>
        <div class="ops">
          <button class="mini" @click="scanOne(s)" :disabled="state.scanning">扫描</button>
          <button class="mini" @click="manage(s)">视频</button>
          <button class="mini" @click="toggle(s)">{{ s.enabled ? '停用' : '启用' }}</button>
          <button class="mini" @click="edit(s)">编辑</button>
          <button class="mini danger" @click="remove(s)">删除</button>
        </div>
      </div>

      <div class="empty" v-if="!state.list.length && !state.loading">
        <Icon icon="mdi:database-plus" class="empty-icon" />
        <p>还没有数据源</p>
        <button class="primary" @click="edit(null)">添加数据源</button>
      </div>

      <div
        class="card status"
        :class="{ failed: state.scan.phase === 'error' }"
        v-if="
          state.scanning ||
          state.metaRunning ||
          state.scan.phase === 'error' ||
          (state.scan.phase === 'done' && state.scan.failedDirs)
        "
      >
        <div class="progress-row">
          <Icon
            :icon="state.scan.phase === 'error' ? 'mdi:alert-circle-outline' : 'mdi:progress-clock'"
            class="icon"
            :class="{ spin: state.scanning || state.metaRunning }"
          />
          <div class="text">
            <b>{{ scanPhaseText }}</b>
            <span>{{ state.scan.current || (state.scan.phase === 'error' ? '请检查数据源配置后重试' : '准备中…') }}</span>
          </div>
        </div>
        <div class="progress" v-if="state.scan.phase !== 'error'">
          <div class="bar" :style="{ width: scanPercent }"></div>
        </div>
        <div class="meta">
          <span>已扫描 {{ state.scan.dirs }} 个目录 · 发现 {{ state.scan.found }} 个视频</span>
          <span v-if="state.scan.failedDirs" class="warn" :title="(state.scan.errors || []).join('\n')">
            · {{ state.scan.failedDirs }} 个目录读取失败
          </span>
          <span v-if="state.meta.total">刮削 {{ state.meta.done }}/{{ state.meta.total }}</span>
        </div>
        <div class="ops">
          <button class="mini danger" @click="cancelScan">取消</button>
        </div>
      </div>

      <div class="card tools">
        <div class="tool" @click="scanAll">
          <Icon icon="mdi:refresh" />
          <span>扫描全部</span>
        </div>
        <div class="tool" @click="manageAll">
          <Icon icon="mdi:video-check-outline" />
          <span>视频管理</span>
        </div>
        <div class="tool" @click="purge">
          <Icon icon="mdi:broom" />
          <span>清理失效</span>
        </div>
        <div class="tool" @click="refreshFeeds">
          <Icon icon="mdi:shuffle-variant" />
          <span>刷新推荐</span>
        </div>
      </div>

      <div class="stats" v-if="store.stats.totalVideos">
        库中共 {{ store.stats.totalVideos }} 个视频 · 启用 {{ store.stats.videos }} · 已禁用
        {{ store.stats.disabled }} · {{ store.stats.collections }} 个合集 ·
        {{ _formatBytes(store.stats.totalBytes) }}
        <span v-if="store.stats.missing"> · {{ store.stats.missing }} 个已失效</span>
      </div>
    </div>

    <BaseFooter :init-tab="3" />
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, onMounted, onUnmounted, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import BaseFooter from '@/components/BaseFooter.vue'
import { useBaseStore } from '@/store/pinia'
import {
  cancelScan as apiCancelScan,
  deleteSource,
  purgeMissing,
  scanStatus as apiScanStatus,
  startScan,
  toggleSource
} from '@/api/source'
import { refreshFeedSeed } from '@/api/videos'
import bus, { EVENT_KEY } from '@/utils/bus'
import {
  _formatBytes,
  _showSimpleConfirmDialog,
  _time,
  _notice,
  _showNoticeDialog
} from '@/utils'
import type { SourceRow } from '@/api/source'

defineOptions({ name: 'Sources' })

const router = useRouter()
const store = useBaseStore()

const state = reactive({
  loading: false,
  list: [] as SourceRow[],
  scanning: false,
  metaRunning: false,
  scan: {
    running: false,
    phase: 'idle',
    found: 0,
    scanned: 0,
    dirs: 0,
    current: '',
    error: ''
  } as any,
  meta: { running: false, done: 0, total: 0, current: '' }
})

let timer: number | null = null

const scanPhaseText = computed(() => {
  if (state.meta.running && !state.scan.running) return '正在刮削封面与时长'
  switch (state.scan.phase) {
    case 'listing':
      return '正在扫描目录'
    case 'saving':
      return '正在写入索引'
    case 'done':
      return state.scan.failedDirs ? '扫描完成（部分目录读取失败）' : '扫描完成'
    case 'error':
      return '扫描失败：' + (state.scan.error || '')
    default:
      return '空闲'
  }
})

const scanPercent = computed(() => {
  if (state.scan.phase === 'saving') return '100%'
  const g = Math.min(100, Math.round((state.scan.scanned || 0) / 300))
  return Math.max(6, g) + '%'
})

async function load() {
  state.loading = true
  try {
    await store.loadSources()
    state.list = store.sources
  } finally {
    state.loading = false
  }
}

let lastScanError = ''
async function poll() {
  const res: any = await apiScanStatus()
  if (!res.success) return
  state.scan = res.data.scan
  state.meta = res.data.meta
  state.scanning = Boolean(res.data.scan?.running)
  state.metaRunning = Boolean(res.data.meta?.running)
  if (!state.scanning && !state.metaRunning) {
    await store.refreshAll()
    state.list = store.sources
    bus.emit(EVENT_KEY.LIBRARY_CHANGED)
  }
  // 扫描失败后状态卡片会被收起，这里补一次可见提示
  const error = res.data.scan?.phase === 'error' ? String(res.data.scan.error || '未知错误') : ''
  if (error && error !== lastScanError) {
    lastScanError = error
    _notice('扫描失败：' + error)
  } else if (!error) {
    lastScanError = ''
  }
}

function startPolling() {
  if (timer) return
  timer = window.setInterval(poll, 1200)
}

function stopPolling() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

async function scanOne(s: SourceRow) {
  await startScan(s.id)
  startPolling()
  void poll()
}

async function scanAll() {
  await startScan()
  startPolling()
  void poll()
}

async function cancelScan() {
  await apiCancelScan()
  void poll()
}

async function toggle(s: SourceRow) {
  await toggleSource(s.id, !s.enabled)
  await load()
}

function edit(s: SourceRow | null) {
  router.push({ path: '/sources/edit', query: s ? { id: s.id } : {} })
}

function manage(s: SourceRow) {
  router.push({ path: '/library/videos', query: { sourceId: s.id } })
}

function manageAll() {
  router.push('/library/videos')
}

function remove(s: SourceRow) {
  _showSimpleConfirmDialog('删除数据源及其索引？', async () => {
    await deleteSource(s.id)
    await load()
    await store.refreshAll()
    _notice('已删除')
  })
}

function purge() {
  _showSimpleConfirmDialog('清理失效且未被喜欢/历史引用的条目？', async () => {
    const res: any = await purgeMissing()
    _notice(res.success ? `已清理 ${res.data.removed} 条` : '清理失败')
    await store.refreshAll()
    await load()
  })
}

async function refreshFeeds() {
  await refreshFeedSeed()
  _notice('推荐顺序已重新洗牌')
  bus.emit(EVENT_KEY.LIBRARY_CHANGED)
}

onMounted(async () => {
  await store.init()
  await load()
  await poll()
  if (state.scanning || state.metaRunning) startPolling()
  const err = new URLSearchParams(location.search).get('err')
  if (err) {
    _showNoticeDialog('操作失败', err, '#ff6b6b', () => undefined, '知道了')
  }
})

onUnmounted(() => {
  stopPolling()
})

onActivated(() => {
  void load()
  void poll()
})
</script>

<style scoped lang="less">
.sources {
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

    .action {
      font-size: 22rem;
      cursor: pointer;
      opacity: 0.85;
    }
  }

  .scroll {
    flex: 1;
    overflow: auto;
    padding: 0 12rem calc(var(--footer-height, 56rem) + 16rem);
  }

  .card {
    border-radius: 12rem;
    background: rgba(255, 255, 255, 0.05);
    padding: 12rem 14rem;
    margin-bottom: 10rem;
    font-size: 12rem;

    .head {
      display: flex;
      align-items: center;
      gap: 8rem;

      .badge {
        font-size: 10rem;
        padding: 2rem 6rem;
        border-radius: 3rem;
        background: rgba(252, 47, 86, 0.18);
        color: #ff7b93;
        flex-shrink: 0;
      }

      .name {
        flex: 1;
        min-width: 0;
        font-size: 14rem;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .count {
        font-size: 11rem;
        color: rgba(255, 255, 255, 0.45);
      }
    }

    .addr {
      margin-top: 6rem;
      font-size: 11rem;
      color: rgba(255, 255, 255, 0.5);
      word-break: break-all;
    }

    .meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 6rem;
      font-size: 11rem;
      color: rgba(255, 255, 255, 0.4);

      .warn {
        color: #ffb057;
      }
    }

    .ops {
      display: flex;
      gap: 8rem;
      margin-top: 10rem;
      flex-wrap: wrap;
    }
  }

  .card.tip-card {
    background: rgba(255, 176, 87, 0.1);

    .row {
      display: flex;
      align-items: center;
      gap: 10rem;

      .icon {
        font-size: 22rem;
        opacity: 0.9;

        &.warn {
          color: #ffb057;
        }
      }

      .text {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 3rem;

        b {
          font-size: 13rem;
        }

        span {
          font-size: 11rem;
          color: rgba(255, 255, 255, 0.5);
          line-height: 1.5;
        }
      }
    }
  }

  .card.status {
    &.failed {
      .progress-row .icon {
        color: #ff7b93;
      }

      .progress-row .text b {
        color: #ff9db0;
      }
    }

    .progress-row {
      display: flex;
      align-items: center;
      gap: 10rem;

      .icon {
        font-size: 20rem;
        color: #ffb057;

        &.spin {
          animation: spin 1.2s linear infinite;
        }
      }

      .text {
        display: flex;
        flex-direction: column;
        gap: 3rem;

        b {
          font-size: 13rem;
        }

        span {
          font-size: 11rem;
          color: rgba(255, 255, 255, 0.45);
          word-break: break-all;
        }
      }
    }

    .progress {
      height: 3rem;
      border-radius: 2rem;
      background: rgba(255, 255, 255, 0.12);
      margin: 10rem 0 8rem;
      overflow: hidden;

      .bar {
        height: 100%;
        border-radius: 2rem;
        background: var(--primary-btn-color, #fc2f56);
        transition: width 0.3s;
      }
    }
  }

  .card.tools {
    display: flex;
    padding: 0;

    .tool {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 5rem;
      padding: 12rem 0;
      font-size: 11rem;
      color: rgba(255, 255, 255, 0.7);
      cursor: pointer;
      border-right: 1px solid rgba(255, 255, 255, 0.06);

      &:last-child {
        border-right: none;
      }

      svg {
        font-size: 19rem;
        opacity: 0.7;
      }
    }
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
    }

    &.danger {
      background: rgba(252, 47, 86, 0.18);
      color: #ff7b93;
    }
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

  .stats {
    padding: 6rem 4rem 20rem;
    font-size: 11rem;
    color: rgba(255, 255, 255, 0.35);
    line-height: 1.7;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
