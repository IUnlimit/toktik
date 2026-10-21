<template>
  <div class="login">
    <div class="hero">
      <div class="logo">TokTik</div>
      <p class="sub">你的视频库，登录后在任意设备续看</p>
    </div>

    <div class="panel">
      <div class="tabs" v-if="canLogin && canRegister">
        <button :class="{ active: mode === 'login' }" @click="switchMode('login')">登录</button>
        <button :class="{ active: mode === 'register' }" @click="switchMode('register')">注册</button>
      </div>
      <p class="first-run" v-else-if="!hasUsers">首次部署，先创建管理员账号</p>

      <form @submit.prevent="submit">
        <label>
          <span>账号</span>
          <input
            v-model.trim="form.username"
            type="text"
            autocomplete="username"
            placeholder="用户名，用于登录"
            maxlength="32"
          />
        </label>

        <label v-if="mode === 'register'">
          <span>昵称</span>
          <input v-model.trim="form.nickname" type="text" placeholder="展示在「我的」页面（可留空）" maxlength="24" />
        </label>

        <label>
          <span>密码</span>
          <input
            v-model="form.password"
            type="password"
            :autocomplete="mode === 'register' ? 'new-password' : 'current-password'"
            placeholder="至少 8 位"
            maxlength="64"
          />
        </label>

        <label v-if="mode === 'register'">
          <span>确认密码</span>
          <input v-model="form.confirm" type="password" autocomplete="new-password" placeholder="再输入一次" maxlength="64" />
        </label>

        <p class="error" v-if="error">{{ error }}</p>

        <button class="primary" type="submit" :disabled="loading">
          {{ loading ? '请稍候…' : mode === 'login' ? '登录' : '创建账号并登录' }}
        </button>
      </form>

      <p class="tip" v-if="!canRegister && hasUsers">服务器已关闭注册，请联系管理员开通账号。</p>
      <p class="tip" v-if="offline">无法连接后端服务，请确认 <code>pnpm dev:server</code> 已启动。</p>
    </div>

    <p class="hint">
      账号、喜欢、历史与播放进度都保存在这台服务器上；视频文件仍留在你自己的存储里。
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useBaseStore } from '@/store/pinia'

defineOptions({ name: 'Login' })

const store = useBaseStore()
const route = useRoute()
const router = useRouter()

const mode = ref<'login' | 'register'>('login')
const loading = ref(false)
const error = ref('')
const offline = ref(false)

const form = reactive({ username: '', password: '', confirm: '', nickname: '' })

const hasUsers = computed(() => Boolean(store.authStatus?.hasUsers))
const canRegister = computed(() => Boolean(store.authStatus?.allowRegister) || !hasUsers.value)
const canLogin = computed(() => hasUsers.value)

function switchMode(next: 'login' | 'register') {
  mode.value = next
  error.value = ''
}

function redirectAfterAuth() {
  const raw = typeof route.query.redirect === 'string' ? route.query.redirect : '/home'
  const target = raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/login') ? raw : '/home'
  router.replace(target)
}

async function submit() {
  if (loading.value) return
  error.value = ''

  if (!form.username) return (error.value = '请填写账号')
  if (form.username.length < 3) return (error.value = '账号至少 3 个字符')
  if (form.password.length < 8) return (error.value = '密码至少 8 位')

  if (!hasUsers.value && mode.value === 'login') mode.value = 'register'
  if (mode.value === 'register' && form.password !== form.confirm) {
    return (error.value = '两次输入的密码不一致')
  }

  loading.value = true
  try {
    const res =
      mode.value === 'login'
        ? await store.signIn(form.username, form.password)
        : await store.signUp(form.username, form.password, form.nickname || undefined)

    if (res.success) {
      redirectAfterAuth()
      return
    }
    offline.value = res.code === 0
    error.value = res.msg || '登录失败，请检查账号与密码'
  } finally {
    loading.value = false
  }
}

// 会话探测与服务器状态由 onMounted 统一完成：
// 不能在 setup 阶段就断言「连不上后端」，否则首屏会闪一条错误的离线提示。
onMounted(async () => {
  if (!store.authReady) {
    try {
      await store.bootstrap()
    } catch {
      /* 网络错误由 offline 提示体现 */
    }
  }
  offline.value = !store.authStatus
  if (!hasUsers.value) mode.value = 'register'
})
</script>

<style scoped lang="less">
.login {
  position: fixed;
  inset: 0;
  padding: 56rem 24rem 28rem;
  box-sizing: border-box;
  background: radial-gradient(circle at 30% 8%, #2a1630, #0b0c12 62%);
  color: #fff;
  display: flex;
  flex-direction: column;
  overflow: auto;

  .hero {
    margin-bottom: 26rem;

    .logo {
      font-size: 34rem;
      font-weight: 800;
      letter-spacing: 1rem;
      background: linear-gradient(90deg, #ff4d6d, #ffb057);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }

    .sub {
      margin-top: 8rem;
      font-size: 13rem;
      color: rgba(255, 255, 255, 0.7);
    }
  }

  .panel {
    background: rgba(255, 255, 255, 0.06);
    border-radius: 16rem;
    padding: 16rem;

    .tabs {
      display: flex;
      gap: 8rem;
      margin-bottom: 14rem;

      button {
        flex: 1;
        height: 34rem;
        border: none;
        border-radius: 17rem;
        background: rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.7);
        font-size: 13rem;
        cursor: pointer;

        &.active {
          background: var(--primary-btn-color, #fc2f56);
          color: #fff;
        }
      }
    }

    .first-run {
      margin: 0 0 14rem;
      font-size: 13rem;
      color: rgba(255, 255, 255, 0.78);
    }

    form {
      display: flex;
      flex-direction: column;
      gap: 12rem;

      label {
        display: flex;
        flex-direction: column;
        gap: 6rem;

        span {
          font-size: 12rem;
          color: rgba(255, 255, 255, 0.6);
        }

        input {
          height: 42rem;
          padding: 0 12rem;
          border-radius: 10rem;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(0, 0, 0, 0.25);
          color: #fff;
          font-size: 14rem;
          outline: none;

          &:focus {
            border-color: var(--primary-btn-color, #fc2f56);
          }
        }
      }

      .error {
        margin: 0;
        font-size: 12rem;
        color: #ff6b81;
        line-height: 1.5;
      }

      .primary {
        height: 44rem;
        border: none;
        border-radius: 22rem;
        background: var(--primary-btn-color, #fc2f56);
        color: #fff;
        font-size: 15rem;
        cursor: pointer;

        &:disabled {
          opacity: 0.6;
        }
      }
    }

    .tip {
      margin: 12rem 0 0;
      font-size: 11rem;
      color: rgba(255, 255, 255, 0.5);
      line-height: 1.6;

      code {
        font-family: ui-monospace, monospace;
      }
    }
  }

  .hint {
    margin-top: auto;
    padding-top: 24rem;
    font-size: 11rem;
    color: rgba(255, 255, 255, 0.4);
    line-height: 1.6;
  }
}
</style>
