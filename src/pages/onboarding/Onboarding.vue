<template>
  <div class="onboarding">
    <div class="hero">
      <div class="logo">TokTik</div>
      <p class="sub">把你硬盘里的视频，变成一个抖音</p>
    </div>

    <ul class="points">
      <li>
        <span class="dot">1</span>
        <div>
          <b>添加服务器端信源</b>
          <p>服务器本地目录、WebDAV、FTP、SMB 都由后端直接连接，浏览器不接触任何凭据。</p>
        </div>
      </li>
      <li>
        <span class="dot">2</span>
        <div>
          <b>服务端刮削</b>
          <p>扫描后由服务器的 ffmpeg 读取时长、分辨率并抽帧做封面，视频流支持拖动。</p>
        </div>
      </li>
      <li>
        <span class="dot">3</span>
        <div>
          <b>账号同步</b>
          <p>喜欢、历史、播放进度跟着账号走，换设备登录同一账号即可接着看。</p>
        </div>
      </li>
    </ul>

    <div class="actions">
      <button class="primary" @click="goSources">添加数据源</button>
      <button class="ghost" @click="skip">先看看界面</button>
    </div>

    <p class="hint">
      视频库由服务器统一管理，所有账号共享同一份索引与封面；只有喜欢、历史与播放进度按账号隔离。
    </p>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'

defineOptions({ name: 'Onboarding' })
const router = useRouter()

function goSources() {
  router.push('/sources/edit')
}

function skip() {
  router.replace('/home')
}
</script>

<style scoped lang="less">
.onboarding {
  position: fixed;
  inset: 0;
  padding: 48rem 24rem 32rem;
  box-sizing: border-box;
  background: radial-gradient(circle at 30% 10%, #2a1630, #0b0c12 60%);
  color: #fff;
  display: flex;
  flex-direction: column;
  overflow: auto;

  .hero {
    margin-bottom: 28rem;

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
      font-size: 14rem;
      color: rgba(255, 255, 255, 0.7);
    }
  }

  .points {
    list-style: none;
    padding: 0;
    margin: 0 0 28rem;

    li {
      display: flex;
      gap: 12rem;
      padding: 14rem;
      margin-bottom: 12rem;
      border-radius: 12rem;
      background: rgba(255, 255, 255, 0.06);

      .dot {
        flex: 0 0 22rem;
        height: 22rem;
        border-radius: 50%;
        background: var(--primary-btn-color, #fc2f56);
        font-size: 12rem;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      b {
        font-size: 14rem;
      }

      p {
        margin: 4rem 0 0;
        font-size: 12rem;
        line-height: 1.5;
        color: rgba(255, 255, 255, 0.62);
      }
    }
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 12rem;

    button {
      height: 44rem;
      border-radius: 22rem;
      border: none;
      font-size: 15rem;
      cursor: pointer;
    }

    .primary {
      background: var(--primary-btn-color, #fc2f56);
      color: #fff;
    }

    .ghost {
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
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
