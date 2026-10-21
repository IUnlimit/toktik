<template>
  <div class="footer">
    <div class="l-button" @click="tab(1)">
      <Icon icon="mdi:play-box-multiple-outline" :class="{ active: currentTab === 1 }" />
      <span :class="{ active: currentTab === 1 }">首页</span>
    </div>
    <div class="l-button" @click="tab(2)">
      <Icon icon="mdi:folder-multiple-outline" :class="{ active: currentTab === 2 }" />
      <span :class="{ active: currentTab === 2 }">合集</span>
    </div>
    <div class="l-button" @click="tab(3)">
      <div class="add-ctn">
        <Icon icon="mdi:plus" class="add" />
      </div>
    </div>
    <div class="l-button" @click="tab(4)">
      <Icon icon="mdi:heart-outline" :class="{ active: currentTab === 4 }" />
      <span :class="{ active: currentTab === 4 }">喜欢</span>
    </div>
    <div class="l-button" @click="tab(5)">
      <Icon icon="mdi:account-outline" :class="{ active: currentTab === 5 }" />
      <span :class="{ active: currentTab === 5 }">我的</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { useRouter } from 'vue-router'
import { onMounted, onUnmounted, ref } from 'vue'
import bus, { EVENT_KEY } from '@/utils/bus'

defineOptions({ name: 'BaseFooter' })

const props = defineProps({
  initTab: {
    type: Number,
    default: 1
  }
})

const router = useRouter()
const currentTab = ref(props.initTab)

const PATHS: Record<number, string> = {
  1: '/home',
  2: '/collections',
  3: '/sources',
  4: '/likes',
  5: '/me'
}

function tab(index: number) {
  currentTab.value = index
  const path = PATHS[index]
  if (path) void router.push(path)
}

function onFullscreen() {
  /* 全屏时由父组件隐藏，这里保留占位 */
}

onMounted(() => {
  bus.on(EVENT_KEY.ENTER_FULLSCREEN, onFullscreen)
})

onUnmounted(() => {
  bus.off(EVENT_KEY.ENTER_FULLSCREEN, onFullscreen)
})
</script>

<style scoped lang="less">
.footer {
  font-size: 12rem;
  position: fixed;
  width: 100%;
  height: var(--footer-height, 56rem);
  z-index: 3;
  bottom: 0;
  background: #000;
  color: white;
  display: flex;

  .l-button {
    width: 20%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 2rem;
    position: relative;
    cursor: pointer;

    .add-ctn {
      @height: 26rem;
      @width: 38rem;
      height: @height;
      width: @width;
      border-radius: 6rem;
      box-sizing: border-box;
      border: 2rem solid white;
      background: #000;
      display: flex;
      align-items: center;
      justify-content: center;

      .add {
        font-size: 20rem;
        color: #fff;
      }
    }

    :deep(svg) {
      font-size: 21rem;
      opacity: 0.6;
      transition: opacity 0.2s;
    }

    span {
      opacity: 0.6;
      transition: opacity 0.2s;

      &.active {
        opacity: 1;
        font-weight: 600;
      }
    }

    :deep(svg.active) {
      opacity: 1;
      color: var(--primary-btn-color, #fc2f56);
    }
  }
}
</style>
