<template>
  <div class="settings">
    <div class="top-bar">
      <Icon icon="icon-park-outline:left" class="back" @click="back" />
      <span class="title">设置</span>
      <span class="placeholder"></span>
    </div>

    <div class="scroll">
      <div class="group">
        <div class="group-title">账号</div>
        <div class="row column">
          <div class="text">
            <b>昵称与签名</b>
            <span>@{{ account.username }} · 喜欢、历史、播放进度都跟随这个账号</span>
          </div>
          <div class="inline">
            <input v-model="profile.nickname" placeholder="昵称" maxlength="24" />
          </div>
          <div class="inline">
            <input v-model="profile.signature" placeholder="个性签名" maxlength="80" />
            <button class="mini" @click="saveProfile">保存</button>
          </div>
        </div>
        <div class="row column">
          <div class="text">
            <b>修改密码</b>
            <span>修改后当前账号在所有设备上的会话都会失效</span>
          </div>
          <div class="inline">
            <input v-model="password.old" type="password" placeholder="当前密码" autocomplete="current-password" />
          </div>
          <div class="inline">
            <input v-model="password.next" type="password" placeholder="新密码（至少 8 位）" autocomplete="new-password" />
            <button class="mini" @click="savePassword">修改</button>
          </div>
        </div>
        <div class="row danger" @click="signOut">
          <div class="text">
            <b>退出登录</b>
            <span>视频库仍保留在服务器上，重新登录即可继续</span>
          </div>
          <Icon icon="icon-park-outline:right" class="arrow" />
        </div>
      </div>

      <div class="group">
        <div class="group-title">播放</div>
        <div class="row">
          <div class="text">
            <b>自动静音</b>
            <span>受浏览器自动播放策略限制，开启可避免被拦截</span>
          </div>
          <label class="switch">
            <input type="checkbox" v-model="prefs.autoMute" @change="savePrefs" />
            <span class="slider"></span>
          </label>
        </div>
        <div class="row">
          <div class="text">
            <b>记忆播放进度</b>
            <span>下次打开同一视频时从上次位置继续</span>
          </div>
          <label class="switch">
            <input type="checkbox" v-model="prefs.rememberPosition" @change="savePrefs" />
            <span class="slider"></span>
          </label>
        </div>
        <div class="row column">
          <div class="text">
            <b>播放画质</b>
            <span>
              自动模式按当前网络选择；省流版本由服务器转码，首次播放会先回退原画并后台准备。
              当前网络：{{ hint }}
            </span>
          </div>
          <div class="chips">
            <span
              class="chip selectable"
              :class="{ active: prefs.quality === 'auto' }"
              @click="setQuality('auto')"
            >
              自动
            </span>
            <span
              class="chip selectable"
              :class="{ active: prefs.quality === 'original' }"
              @click="setQuality('original')"
            >
              原画
            </span>
            <span
              class="chip selectable"
              :class="{ active: prefs.quality === 'low', disabled: !store.ffmpeg }"
              @click="setQuality('low')"
            >
              省流
            </span>
          </div>
          <div class="text sub" v-if="!store.ffmpeg">
            <span>服务器未安装 ffmpeg，无法生成省流版本；安装后重启服务即可启用。</span>
          </div>
        </div>
        <div class="row">
          <div class="text">
            <b>预加载后续视频</b>
            <span>当前视频之后提前缓冲的条数；弱网下只读取元数据，避免抢占带宽</span>
          </div>
          <div class="chips">
            <span
              v-for="n in [0, 1, 2, 3]"
              :key="n"
              class="chip selectable"
              :class="{ active: Number(prefs.preloadAhead) === n }"
              @click="setPreloadAhead(n)"
            >
              {{ n }}
            </span>
          </div>
        </div>
        <div class="row" v-if="variant">
          <div class="text">
            <b>省流缓存</b>
            <span>
              {{ variant.files }} 个文件 · {{ _formatBytes(variant.bytes) }}
              <template v-if="variant.queued"> · 排队 {{ variant.queued }} 个</template>
            </span>
          </div>
          <button class="mini" @click="clearVariantCache">清理</button>
        </div>
      </div>

      <div class="group">
        <div class="group-title">服务器视频库（所有账号共享）</div>
        <div class="row" @click="goSources">
          <div class="text">
            <b>数据源管理</b>
            <span>
              {{ store.sources.length }} 个数据源 · 共 {{ store.stats.totalVideos }} 个视频
            </span>
          </div>
          <Icon icon="icon-park-outline:right" class="arrow" />
        </div>
        <div class="row" @click="goManage">
          <div class="text">
            <b>视频筛选</b>
            <span>
              已启用 {{ store.stats.videos }} · 已禁用 {{ store.stats.disabled }}，可逐条或按时长/大小批量开关
            </span>
          </div>
          <Icon icon="icon-park-outline:right" class="arrow" />
        </div>
        <div class="row column">
          <div class="text">
            <b>库统计</b>
            <span>
              可播放 {{ store.stats.playable }} · 已启用 {{ store.stats.videos }} · 已禁用
              {{ store.stats.disabled }} · 待刮削 {{ store.stats.pendingMeta }} · 刮削失败
              {{ store.stats.failedMeta }} · 失效 {{ store.stats.missing }}
            </span>
          </div>
          <div class="chips">
            <span class="chip">{{ _formatBytes(store.stats.totalBytes) }}</span>
            <span class="chip">{{ _duration(Math.round(store.stats.totalDurationMs / 1000)) }}</span>
          </div>
        </div>
        <div class="row" v-if="!store.ffmpeg">
          <div class="text">
            <b>服务器未安装 ffmpeg</b>
            <span>无法读取时长与抽帧封面，封面将使用文字兜底；安装 ffmpeg 后重新刮削即可</span>
          </div>
        </div>
        <div class="row" @click="reprocessAllVideos">
          <div class="text">
            <b>重新刮削全部</b>
            <span>清空已抓取的封面与时长，由服务器重新读取</span>
          </div>
          <Icon icon="icon-park-outline:right" class="arrow" />
        </div>
        <div class="row danger" @click="resetAll">
          <div class="text">
            <b>清空全服务器视频库</b>
            <span>删除数据源、索引与封面，所有账号可见的库都会清空，不可恢复</span>
          </div>
          <Icon icon="icon-park-outline:right" class="arrow" />
        </div>
      </div>

      <div class="group">
        <div class="group-title">关于</div>
        <div class="row" @click="nav('/onboarding')">
          <div class="text">
            <b>TokTik</b>
            <span>自托管视频库 · 服务端 v{{ store.version }}</span>
          </div>
          <Icon icon="icon-park-outline:right" class="arrow" />
        </div>
      </div>

      <p class="footnote">
        账号、喜欢、历史与播放进度保存在这台服务器上；视频文件由服务器直接读取你的 SMB / WebDAV / FTP /
        本地目录，浏览器只拿到同源的播放地址。
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { useBaseStore } from '@/store/pinia'
import { reprocessAll } from '@/api/videos'
import { resetLibrary } from '@/api/user'
import { clearVariants, variantStatus } from '@/api/media'
import { changePassword, updateProfile } from '@/api/auth'
import bus, { EVENT_KEY } from '@/utils/bus'
import { networkHint } from '@/utils/network'
import { _duration, _formatBytes, _notice, _showSimpleConfirmDialog } from '@/utils'
import type { PlayQuality, Prefs } from '@shared/types'
import type { VariantStatus } from '@/api/media'

defineOptions({ name: 'Settings' })

const router = useRouter()
const store = useBaseStore()

const prefs = reactive({
  autoMute: true,
  rememberPosition: true,
  quality: 'auto' as PlayQuality,
  preloadAhead: 2
})
const profile = reactive({ nickname: '', signature: '' })
const password = reactive({ old: '', next: '' })
const variant = ref<VariantStatus | null>(null)
const hint = ref(networkHint())

const account = reactive({ username: store.user?.username ?? '' })

function syncPrefs() {
  prefs.autoMute = store.prefs.autoMute !== false
  prefs.rememberPosition = store.prefs.rememberPosition !== false
  prefs.quality = store.prefs.quality ?? 'auto'
  prefs.preloadAhead = Number(store.prefs.preloadAhead ?? 2)
}

async function loadVariant() {
  const res: any = await variantStatus()
  if (res.success && res.data) variant.value = res.data
}

async function load() {
  await store.loadPrefs()
  syncPrefs()
  await loadVariant()
  hint.value = networkHint()
  applyMute()
  profile.nickname = store.user?.nickname ?? ''
  profile.signature = store.user?.signature ?? ''
  account.username = store.user?.username ?? ''
}

async function savePrefs() {
  const patch: Partial<Prefs> = {
    autoMute: prefs.autoMute,
    rememberPosition: prefs.rememberPosition,
    quality: prefs.quality,
    preloadAhead: prefs.preloadAhead
  }
  await store.savePrefs(patch)
  syncPrefs()
  applyMute()
  bus.emit(EVENT_KEY.PREFS_CHANGED)
  _notice('已保存')
}

async function setQuality(quality: PlayQuality) {
  if (quality === 'low' && !store.ffmpeg) {
    _notice('服务器未安装 ffmpeg，无法使用省流画质')
    return
  }
  prefs.quality = quality
  await savePrefs()
}

async function setPreloadAhead(value: number) {
  prefs.preloadAhead = value
  await savePrefs()
}

function clearVariantCache() {
  _showSimpleConfirmDialog('清理全部省流缓存？下次选择省流画质时会重新生成。', async () => {
    const res: any = await clearVariants()
    if (res.success) {
      _notice(`已清理 ${res.data?.files ?? 0} 个文件`)
      await loadVariant()
    }
  })
}

/** 自动静音关闭时解除静音（并广播给正在播放的视频） */
function applyMute() {
  window.isMuted = prefs.autoMute
  if (!prefs.autoMute) bus.emit(EVENT_KEY.REMOVE_MUTED)
}

async function saveProfile() {
  const res: any = await updateProfile({
    nickname: profile.nickname || undefined,
    signature: profile.signature || undefined
  })
  if (res.success && res.data) {
    store.user = { ...store.user!, ...res.data }
    await store.loadUser()
    _notice('资料已更新')
  }
}

async function savePassword() {
  if (password.next.length < 8) {
    _notice('新密码至少 8 位')
    return
  }
  const res: any = await changePassword(password.old, password.next)
  if (res.success) {
    _notice('密码已修改，请重新登录')
    store.clearSession()
    window.location.replace('/login')
  }
}

async function signOut() {
  await store.signOut()
}

function nav(path: string) {
  router.push(path)
}

function goSources() {
  router.push('/sources')
}

function goManage() {
  router.push('/library/videos')
}

function back() {
  if (window.history.length > 1) router.back()
  else router.replace('/me')
}

function reprocessAllVideos() {
  _showSimpleConfirmDialog('让服务器把全部视频重新刮削一遍？', async () => {
    const res: any = await reprocessAll()
    if (res.success) _notice(`已加入刮削队列（${res.data?.updated ?? 0} 个）`)
    await store.refreshAll()
  })
}

function resetAll() {
  _showSimpleConfirmDialog('清空全服务器视频库？所有账号都会失去这些视频，不可恢复。', async () => {
    const res: any = await resetLibrary()
    if (res.success) _notice('已清空')
    await store.refreshAll()
    bus.emit(EVENT_KEY.LIBRARY_CHANGED)
  })
}

onMounted(async () => {
  await store.init()
  await load()
})
</script>

<style scoped lang="less">
.settings {
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

    .back {
      font-size: 20rem;
      opacity: 0.85;
      cursor: pointer;
    }

    .title {
      font-size: 15rem;
      font-weight: 600;
    }

    .placeholder {
      width: 20rem;
    }
  }

  .scroll {
    flex: 1;
    overflow: auto;
    padding: 0 12rem 30rem;
  }

  .group {
    margin-bottom: 14rem;

    .group-title {
      padding: 6rem 4rem;
      font-size: 11rem;
      color: rgba(255, 255, 255, 0.4);
    }
  }

  .row {
    display: flex;
    align-items: center;
    gap: 12rem;
    padding: 12rem 14rem;
    background: rgba(255, 255, 255, 0.05);
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    cursor: default;

    &:first-of-type {
      border-radius: 12rem 12rem 0 0;
    }

    &:last-of-type {
      border-radius: 0 0 12rem 12rem;
      border-bottom: none;
    }

    &:only-of-type {
      border-radius: 12rem;
    }

    &.column {
      flex-direction: column;
      align-items: stretch;
      gap: 8rem;
    }

    &[class~='danger'] .text b {
      color: #ff7b93;
    }

    .text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3rem;

      b {
        font-size: 13rem;
      }

      span {
        font-size: 11rem;
        line-height: 1.5;
        color: rgba(255, 255, 255, 0.45);
      }
    }

    .arrow {
      font-size: 15rem;
      opacity: 0.35;
    }

    .inline {
      display: flex;
      gap: 8rem;

      input {
        flex: 1;
        min-width: 0;
        height: 32rem;
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
    }

    .chips {
      display: flex;
      gap: 8rem;

      .chip {
        font-size: 11rem;
        padding: 3rem 8rem;
        border-radius: 10rem;
        background: rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.65);

        &.selectable {
          cursor: pointer;
          transition:
            background 0.2s,
            color 0.2s;
        }

        &.active {
          background: var(--primary-btn-color, #fc2f56);
          color: #fff;
        }

        &.disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
      }
    }
  }

  .switch {
    position: relative;
    flex: none;
    width: 42rem;
    height: 24rem;
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
        width: 18rem;
        height: 18rem;
        border-radius: 50%;
        background: #fff;
        transition: transform 0.2s;
      }
    }

    input:checked + .slider {
      background: var(--primary-btn-color, #fc2f56);

      &::before {
        transform: translateX(18px);
      }
    }
  }

  .mini {
    flex: none;
    height: 32rem;
    padding: 0 14rem;
    border-radius: 16rem;
    border: none;
    background: rgba(255, 255, 255, 0.12);
    color: #fff;
    font-size: 11rem;
    cursor: pointer;
  }

  .footnote {
    margin: 4rem 4rem 0;
    font-size: 11rem;
    line-height: 1.7;
    color: rgba(255, 255, 255, 0.32);
  }
}
</style>
