<template>
  <div class="toolbar mb1r">
    <div class="avatar-ctn mb2r" v-click="() => bus.emit(EVENT_KEY.GO_COLLECTION, item.toktik?.collection)">
      <img class="avatar" :src="item.author?.avatar_168x168?.url_list?.[0] || ''" alt="" />
      <div class="episode" v-if="item.toktik?.episode !== null && item.toktik?.episode !== undefined">
        {{ item.toktik.episode }}
      </div>
    </div>
    <div class="love mb2r" v-click="loved">
      <div>
        <img src="@/assets/img/icon/love.svg" class="love-image" v-if="!item.isLoved" />
        <img src="@/assets/img/icon/loved.svg" class="love-image" v-else />
      </div>
      <span>{{ item.isLoved ? '已喜欢' : '喜欢' }}</span>
    </div>
    <div class="message mb2r" v-click="goCollection">
      <Icon icon="ic:round-video-library" class="icon" style="color: white" />
      <span>{{ item.author?.aweme_count ?? 1 }} 个</span>
    </div>
    <div class="message mb2r" v-click="reprocess">
      <Icon icon="mdi:image-refresh-outline" class="icon" style="color: white" />
      <span>重刮</span>
    </div>
    <div class="share mb2r" v-click="showInfo">
      <img src="@/assets/img/icon/menu-white.png" alt="" class="share-image" />
      <span>信息</span>
    </div>
    <div class="message mb2r" v-click="toggleFullscreen">
      <Icon icon="mdi:fullscreen" class="icon" style="color: white" />
      <span>全屏</span>
    </div>
    <BaseMusic />
  </div>
</template>

<script setup lang="ts">
import BaseMusic from '../BaseMusic.vue'
import bus, { EVENT_KEY } from '@/utils/bus'
import { Icon } from '@iconify/vue'
import { useClick } from '@/utils/hooks/useClick'
import { inject } from 'vue'
import { toggleLike, reprocessVideo } from '@/api/videos'
import { _notice } from '@/utils'
import { cloneDeep } from '@/utils'

const props = defineProps({
  isMy: {
    type: Boolean,
    default: () => false
  },
  item: {
    type: Object,
    default: () => ({})
  }
})

const position = inject<any>('position')
const emit = defineEmits(['update:item'])

function updateItem(patch: Record<string, any>) {
  const next = cloneDeep(props.item)
  Object.assign(next, patch)
  emit('update:item', next)
  bus.emit(EVENT_KEY.UPDATE_ITEM, { position: position?.value, item: next })
}

async function loved() {
  const item = props.item as any
  const nextLoved = !item.isLoved
  // 乐观更新
  updateItem({ isLoved: nextLoved })
  const res: any = await toggleLike(item.aweme_id)
  if (!res.success) {
    updateItem({ isLoved: !nextLoved })
    _notice('操作失败，请重试')
  }
}

function goCollection() {
  const name = props.item?.toktik?.collection
  if (name) bus.emit(EVENT_KEY.GO_COLLECTION, name)
}

async function reprocess() {
  const id = props.item?.aweme_id
  if (!id) return
  _notice('已加入重新刮削队列')
  await reprocessVideo(id)
}

function showInfo() {
  bus.emit(EVENT_KEY.SHOW_INFO, props.item)
}

function toggleFullscreen() {
  bus.emit(EVENT_KEY.TOGGLE_FULLSCREEN, {
    uniqueId: position?.value?.uniqueId,
    index: position?.value?.index
  })
}

const vClick = useClick()
</script>

<style scoped lang="less">
.toolbar {
  position: absolute;
  bottom: 0;
  right: 10rem;
  color: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;

  .avatar-ctn {
    position: relative;

    @w: 45rem;

    .avatar {
      width: @w;
      height: @w;
      border: 3rem solid white;
      border-radius: 50%;
      object-fit: cover;
      background: #2b2f3d;
    }

    .episode {
      position: absolute;
      left: 0;
      right: 0;
      bottom: -6rem;
      margin: auto;
      width: 22rem;
      height: 16rem;
      border-radius: 8rem;
      background: var(--primary-btn-color, #fc2f56);
      color: #fff;
      font-size: 10rem;
      display: flex;
      align-items: center;
      justify-content: center;
    }
  }

  .love,
  .message,
  .share {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;

    @width: 33rem;

    img,
    .icon {
      width: @width;
      height: @width;
    }

    span {
      font-size: 11rem;
      opacity: 0.85;
      white-space: nowrap;
    }
  }

  .icon {
    font-size: 32rem;
  }
}
</style>
