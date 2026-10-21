<template>
  <div class="me">
    <div class="top-bar">
      <span class="title">我的</span>
      <Icon icon="ic:round-settings" class="gear" @click="nav('/settings')" />
    </div>

    <div class="profile">
      <div class="avatar">{{ initial }}</div>
      <div class="info">
        <div class="nickname">{{ store.userinfo.nickname }}</div>
        <div class="uid">@{{ store.userinfo.unique_id }}</div>
        <div class="signature">{{ store.userinfo.signature }}</div>
      </div>
    </div>

    <div class="numbers">
      <div class="cell">
        <b>{{ _formatNumber(store.stats.videos) }}</b>
        <span>视频</span>
      </div>
      <div class="cell">
        <b>{{ _formatNumber(store.stats.likes) }}</b>
        <span>喜欢</span>
      </div>
      <div class="cell">
        <b>{{ _formatNumber(store.stats.history) }}</b>
        <span>历史</span>
      </div>
      <div class="cell">
        <b>{{ _formatNumber(store.stats.collections) }}</b>
        <span>合集</span>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <span>资料库</span>
        <span class="sub">{{ _formatBytes(store.stats.totalBytes) }} · {{ durationText }}</span>
      </div>
      <div class="rows">
        <div class="row" @click="nav('/likes')">
          <Icon icon="mdi:heart-outline" class="row-icon" />
          <span class="row-label">喜欢</span>
          <span class="row-value">{{ store.stats.likes }}</span>
          <Icon icon="icon-park-outline:right" class="arrow" />
        </div>
        <div class="row" @click="nav('/history')">
          <Icon icon="mdi:history" class="row-icon" />
          <span class="row-label">观看历史</span>
          <span class="row-value">{{ store.stats.history }}</span>
          <Icon icon="icon-park-outline:right" class="arrow" />
        </div>
        <div class="row" @click="nav('/collections')">
          <Icon icon="mdi:folder-multiple-outline" class="row-icon" />
          <span class="row-label">合集</span>
          <span class="row-value">{{ store.stats.collections }}</span>
          <Icon icon="icon-park-outline:right" class="arrow" />
        </div>
        <div class="row" @click="nav('/search')">
          <Icon icon="mdi:magnify" class="row-icon" />
          <span class="row-label">搜索本地库</span>
          <Icon icon="icon-park-outline:right" class="arrow" />
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <span>数据源</span>
        <span class="sub" @click="nav('/sources')">管理</span>
      </div>
      <div class="rows">
        <div class="row" v-for="s in store.sources" :key="s.id" @click="nav('/sources')">
          <span class="badge">{{ s.kindLabel }}</span>
          <span class="row-label ellipsis">{{ s.name }}</span>
          <span class="row-value">{{ s.videoCount }}</span>
          <Icon icon="icon-park-outline:right" class="arrow" />
        </div>
        <div class="row empty" v-if="!store.sources.length" @click="nav('/sources/edit')">
          <Icon icon="mdi:plus-circle-outline" class="row-icon" />
          <span class="row-label">添加第一个数据源</span>
          <Icon icon="icon-park-outline:right" class="arrow" />
        </div>
      </div>
    </div>

    <div class="card">
      <div class="rows">
        <div class="row" @click="nav('/settings')">
          <Icon icon="mdi:cog-outline" class="row-icon" />
          <span class="row-label">设置与账号</span>
          <Icon icon="icon-park-outline:right" class="arrow" />
        </div>
        <div class="row" @click="nav('/onboarding')">
          <Icon icon="mdi:information-outline" class="row-icon" />
          <span class="row-label">关于 TokTik</span>
          <Icon icon="icon-park-outline:right" class="arrow" />
        </div>
        <div class="row danger" @click="signOut">
          <Icon icon="mdi:logout" class="row-icon" />
          <span class="row-label">退出登录</span>
          <Icon icon="icon-park-outline:right" class="arrow" />
        </div>
      </div>
    </div>

    <div class="bottom-space"></div>
    <BaseFooter :init-tab="5" />
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, onMounted } from 'vue'
import { Icon } from '@iconify/vue'
import { useRouter } from 'vue-router'
import { useBaseStore } from '@/store/pinia'
import { _duration, _formatBytes, _formatNumber } from '@/utils'

defineOptions({ name: 'Me' })

const store = useBaseStore()
const router = useRouter()

const initial = computed(() => (store.userinfo.nickname || '本').trim().slice(0, 1))
const durationText = computed(() => {
  const minutes = Math.round(store.stats.totalDurationMs / 60000)
  if (minutes < 60) return minutes + ' 分钟'
  return _duration(minutes * 60)
})

function nav(path: string) {
  router.push(path)
}

async function signOut() {
  await store.signOut()
}

async function refresh() {
  await store.refreshAll()
}

onMounted(refresh)
onActivated(refresh)
</script>

<style scoped lang="less">
.me {
  position: fixed;
  inset: 0;
  overflow: auto;
  background: var(--main-bg, #151723);
  color: #fff;
  font-size: 14rem;

  .top-bar {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14rem 16rem;
    background: rgba(21, 23, 35, 0.92);
    backdrop-filter: blur(8px);

    .title {
      font-size: 16rem;
      font-weight: 600;
    }

    .gear {
      font-size: 22rem;
      opacity: 0.8;
    }
  }

  .profile {
    display: flex;
    gap: 14rem;
    padding: 8rem 16rem 18rem;

    .avatar {
      width: 62rem;
      height: 62rem;
      border-radius: 50%;
      background: linear-gradient(135deg, #ff4d6d, #ffb057);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24rem;
      font-weight: 700;
      flex-shrink: 0;
    }

    .info {
      min-width: 0;

      .nickname {
        font-size: 18rem;
        font-weight: 600;
      }

      .uid {
        margin-top: 3rem;
        font-size: 12rem;
        color: rgba(255, 255, 255, 0.45);
      }

      .signature {
        margin-top: 6rem;
        font-size: 12rem;
        color: rgba(255, 255, 255, 0.6);
        line-height: 1.5;
      }
    }
  }

  .numbers {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    padding: 0 8rem 16rem;

    .cell {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3rem;

      b {
        font-size: 17rem;
      }

      span {
        font-size: 11rem;
        color: rgba(255, 255, 255, 0.5);
      }
    }
  }

  .card {
    margin: 0 12rem 12rem;
    border-radius: 12rem;
    background: rgba(255, 255, 255, 0.05);
    overflow: hidden;

    .card-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12rem 14rem 8rem;
      font-size: 13rem;
      font-weight: 600;

      .sub {
        font-size: 11rem;
        font-weight: 400;
        color: rgba(255, 255, 255, 0.45);
      }
    }

    .rows .row {
      display: flex;
      align-items: center;
      gap: 10rem;
      padding: 12rem 14rem;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      cursor: pointer;

      &:active {
        background: rgba(255, 255, 255, 0.05);
      }

      .row-icon {
        font-size: 19rem;
        opacity: 0.75;
      }

      .row-label {
        flex: 1;
        font-size: 13rem;
      }

      .ellipsis {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .row-value {
        font-size: 12rem;
        color: rgba(255, 255, 255, 0.45);
      }

      .arrow {
        font-size: 15rem;
        opacity: 0.35;
      }

      .badge {
        font-size: 10rem;
        padding: 2rem 5rem;
        border-radius: 3rem;
        background: rgba(255, 255, 255, 0.12);
        color: rgba(255, 255, 255, 0.75);
        flex-shrink: 0;
      }

      &.danger .row-label,
      &.danger .row-icon {
        color: #ff7b93;
      }
    }
  }

  .bottom-space {
    height: calc(var(--footer-height, 56rem) + 16rem);
  }
}
</style>
