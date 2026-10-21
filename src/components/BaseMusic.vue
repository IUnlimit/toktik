<template>
  <div class="music-wrapper" @click="unmute">
    <div class="music">
      <div class="disc">
        <Icon :icon="muted ? 'mdi:volume-off' : 'mdi:volume-high'" class="icon" />
      </div>
    </div>
    <span class="label">{{ muted ? '取消静音' : '有声' }}</span>
  </div>
</template>

<script setup lang="ts">
import { inject, onMounted, onUnmounted, ref, watch, type ComputedRef } from 'vue'
import { Icon } from '@iconify/vue'
import bus, { EVENT_KEY } from '@/utils/bus'

defineOptions({ name: 'BaseMusic' })

/** 由 BaseVideo 提供的静音状态（默认静音，符合浏览器自动播放策略） */
const isMuted = inject<ComputedRef<boolean>>('isMuted', ref(true) as any)
const muted = ref(Boolean(isMuted?.value ?? true))

watch(isMuted, (val) => (muted.value = Boolean(val)), { immediate: true })

function unmute() {
  if (!muted.value) return
  muted.value = false
  // 真实解除静音由 BaseVideo 监听该事件完成
  bus.emit(EVENT_KEY.REMOVE_MUTED)
}

onMounted(() => {
  bus.on(EVENT_KEY.REMOVE_MUTED, onUnmuted)
})

onUnmounted(() => {
  bus.off(EVENT_KEY.REMOVE_MUTED, onUnmuted)
})

function onUnmuted() {
  muted.value = false
}
</script>

<style scoped lang="less">
.music-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4rem;
  cursor: pointer;

  .music {
    @w: 38rem;
    width: @w;
    height: @w;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.14);
    display: flex;
    align-items: center;
    justify-content: center;

    .disc {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .icon {
      font-size: 20rem;
      color: #fff;
    }
  }

  .label {
    font-size: 11rem;
    color: rgba(255, 255, 255, 0.85);
    white-space: nowrap;
  }
}
</style>
