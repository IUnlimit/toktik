<template>
  <div class="info-dialog" v-if="state.visible" @click.self="close">
    <div class="panel">
      <div class="head">
        <span>视频信息</span>
        <Icon icon="mdi:close" class="close" @click="close" />
      </div>

      <div class="body" v-if="state.item">
        <div class="row">
          <span class="k">标题</span>
          <span class="v">{{ state.item.toktik?.collection || '未分类' }} · {{ episodeText }}</span>
        </div>
        <div class="row">
          <span class="k">文件</span>
          <span class="v ellipsis">{{ state.item.toktik?.path || '-' }}</span>
        </div>
        <div class="row">
          <span class="k">格式</span>
          <span class="v">{{ (state.item.toktik?.ext || '未知').toUpperCase() }}</span>
        </div>
        <div class="row">
          <span class="k">时长</span>
          <span class="v">{{ _duration((state.item.toktik?.durationMs || 0) / 1000) }}</span>
        </div>
        <div class="row">
          <span class="k">分辨率</span>
          <span class="v">{{ state.item.video?.width || 0 }} × {{ state.item.video?.height || 0 }}</span>
        </div>
        <div class="row">
          <span class="k">描述</span>
          <span class="v">{{ state.item.desc }}</span>
        </div>

        <div class="actions">
          <button class="ghost" @click="copyPath">复制路径</button>
          <button class="ghost" @click="reprocess">重新刮削</button>
          <button class="primary" @click="close">知道了</button>
        </div>
      </div>
      <div class="body empty" v-else>没有选中视频</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive } from 'vue'
import { Icon } from '@iconify/vue'
import bus, { EVENT_KEY } from '@/utils/bus'
import { _copy, _duration, _notice } from '@/utils'
import { reprocessVideo } from '@/api/videos'

defineOptions({ name: 'ItemInfoDialog' })

const state = reactive({
  visible: false,
  item: null as any
})

const episodeText = computed(() => {
  const ep = state.item?.toktik?.episode
  return ep === null || ep === undefined ? '单集' : `第 ${ep} 集`
})

function close() {
  state.visible = false
}

function onShowInfo(item: any) {
  state.item = item
  state.visible = true
}

function copyPath() {
  const path = state.item?.toktik?.path
  if (!path) return
  _copy(path)
}

async function reprocess() {
  const id = state.item?.aweme_id
  if (!id) return
  _notice('已加入重新刮削队列')
  await reprocessVideo(id)
  close()
}

onMounted(() => bus.on(EVENT_KEY.SHOW_INFO, onShowInfo))
onUnmounted(() => bus.off(EVENT_KEY.SHOW_INFO, onShowInfo))
</script>

<style scoped lang="less">
.info-dialog {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: flex-end;

  .panel {
    width: 100%;
    max-height: 76%;
    background: #1b1d27;
    border-radius: 14rem 14rem 0 0;
    color: #fff;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: rise 0.22s ease-out;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14rem 16rem 10rem;
    font-size: 14rem;
    font-weight: 600;

    .close {
      font-size: 20rem;
      opacity: 0.6;
    }
  }

  .body {
    padding: 0 16rem 18rem;
    overflow: auto;
    font-size: 12rem;

    .row {
      display: flex;
      gap: 10rem;
      padding: 8rem 0;
      border-top: 1px solid rgba(255, 255, 255, 0.06);

      .k {
        flex: 0 0 56rem;
        color: rgba(255, 255, 255, 0.45);
      }

      .v {
        flex: 1;
        min-width: 0;
        line-height: 1.6;
        word-break: break-all;
      }

      .ellipsis {
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }
    }

    .actions {
      display: flex;
      gap: 10rem;
      margin-top: 16rem;

      button {
        flex: 1;
        height: 38rem;
        border-radius: 19rem;
        border: none;
        font-size: 13rem;
        cursor: pointer;
      }

      .ghost {
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
      }

      .primary {
        background: var(--primary-btn-color, #fc2f56);
        color: #fff;
      }
    }

    &.empty {
      padding: 30rem;
      text-align: center;
      color: rgba(255, 255, 255, 0.5);
    }
  }
}

@keyframes rise {
  from {
    transform: translateY(40px);
    opacity: 0;
  }

  to {
    transform: translateY(0);
    opacity: 1;
  }
}
</style>
