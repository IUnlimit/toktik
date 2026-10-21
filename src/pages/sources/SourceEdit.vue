<template>
  <div class="source-edit">
    <div class="top-bar">
      <Icon icon="icon-park-outline:left" class="back" @click="back" />
      <span class="title">{{ isEdit ? '编辑数据源' : '添加数据源' }}</span>
      <span class="save" @click="save">{{ saving ? '保存中…' : '保存' }}</span>
    </div>

    <div class="scroll">
      <div class="kinds">
        <div
          class="kind"
          :class="{ active: form.kind === k.value }"
          v-for="k in KINDS"
          :key="k.value"
          @click="pickKind(k.value)"
        >
          <Icon :icon="k.icon" class="kind-icon" />
          <span class="kind-name">{{ k.label }}</span>
          <span class="kind-tip">{{ k.tip }}</span>
        </div>
      </div>

      <div class="field">
        <label>名称</label>
        <input v-model="form.name" placeholder="给数据源起个名字" />
      </div>

      <template v-if="form.kind === 'local'">
        <div class="field">
          <label>服务器目录</label>
          <input v-model="form.path" placeholder="/mnt/media 或 D:\\Videos" />
        </div>
        <p class="hint">
          填写后端所在机器上的绝对路径；播放与刮削都由服务器直接读文件，浏览器不需要授权。
        </p>
      </template>

      <template v-if="form.kind === 'webdav'">
        <div class="field">
          <label>服务器地址</label>
          <input v-model="form.baseUrl" placeholder="https://example.com/dav" />
        </div>
        <div class="field">
          <label>用户名</label>
          <input v-model="form.username" placeholder="可留空" autocomplete="off" />
        </div>
        <div class="field">
          <label>密码</label>
          <input v-model="form.password" type="password" placeholder="可留空" autocomplete="new-password" />
        </div>
        <p class="hint">
          由服务器连接 WebDAV，不受浏览器 CORS 限制；密码只会保存在服务器的数据目录里。
        </p>
      </template>

      <template v-if="form.kind === 'ftp' || form.kind === 'smb'">
        <div class="field">
          <label>主机</label>
          <input v-model="form.host" :placeholder="form.kind === 'ftp' ? '192.168.1.10' : '192.168.1.20'" />
        </div>
        <div class="field">
          <label>端口</label>
          <input v-model.number="form.port" type="number" :placeholder="form.kind === 'ftp' ? '21' : '445'" />
        </div>
        <div class="field" v-if="form.kind === 'smb'">
          <label>共享名</label>
          <input v-model="form.share" placeholder="media" />
        </div>
        <div class="field">
          <label>用户名</label>
          <input v-model="form.user" placeholder="guest" autocomplete="off" />
        </div>
        <div class="field">
          <label>密码</label>
          <input v-model="form.password" type="password" autocomplete="new-password" />
        </div>
        <div class="field" v-if="form.kind === 'ftp'">
          <label>启用 FTPS</label>
          <label class="switch">
            <input type="checkbox" v-model="form.secure" />
            <span class="slider"></span>
          </label>
        </div>
        <div class="field" v-if="form.kind === 'smb'">
          <label>域</label>
          <input v-model="form.domain" placeholder="WORKGROUP" />
        </div>
        <p class="hint">
          {{ form.kind === 'ftp' ? 'FTP' : 'SMB' }} 由后端直接连接，需要这台服务器能访问到目标主机。
        </p>
      </template>

      <div class="test-row">
        <button class="pick" @click="testConnection" :disabled="testing">
          <Icon icon="mdi:lan-connect" />
          {{ testing ? '测试中…' : '测试连接' }}
        </button>
      </div>
      <p class="hint" :class="{ ok: testOk, fail: testOk === false }" v-if="testMessage">
        {{ testMessage }}
      </p>

      <div class="field">
        <label>根路径</label>
        <input v-model="form.rootPath" placeholder="/" />
      </div>
      <p class="hint">
        根路径是相对上面那个地址的子目录；填 <code>/</code> 表示扫描整个目录 / 共享 / 站点。
      </p>

      <div class="actions">
        <button class="primary" @click="save" :disabled="saving">保存</button>
        <button class="ghost" @click="back">取消</button>
        <button class="danger" v-if="isEdit" @click="remove">删除</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { deleteSource, saveSource, sourceList, testSource } from '@/api/source'
import { _notice, _showSimpleConfirmDialog } from '@/utils'
import bus, { EVENT_KEY } from '@/utils/bus'
import type { SourceKind } from '@shared/types'

defineOptions({ name: 'SourceEdit' })

const route = useRoute()
const router = useRouter()

const KINDS: { value: SourceKind; label: string; tip: string; icon: string }[] = [
  { value: 'local', label: '服务器目录', tip: '后端直接读文件', icon: 'mdi:harddisk' },
  { value: 'webdav', label: 'WebDAV', tip: '后端访问站点', icon: 'mdi:cloud-outline' },
  { value: 'ftp', label: 'FTP', tip: '后端连接', icon: 'mdi:server-network' },
  { value: 'smb', label: 'SMB', tip: '后端连接 NAS', icon: 'mdi:nas' }
]

const isEdit = computed(() => Boolean(route.query.id))
const saving = ref(false)
const testing = ref(false)
const testMessage = ref('')
const testOk = ref<boolean | null>(null)

const form = reactive({
  id: '' as string,
  kind: 'local' as SourceKind,
  name: '',
  rootPath: '/',
  // local
  path: '',
  // webdav
  baseUrl: '',
  username: '',
  password: '',
  // ftp / smb
  host: '',
  port: 21 as number | string,
  share: '',
  user: '',
  domain: '',
  secure: false
})

function pickKind(kind: SourceKind) {
  form.kind = kind
  testMessage.value = ''
  testOk.value = null
  if (!form.name || KINDS.some((k) => k.label === form.name)) {
    form.name = KINDS.find((k) => k.value === kind)!.label
  }
  if (kind === 'ftp' && !form.port) form.port = 21
  if (kind === 'smb' && !form.port) form.port = 445
}

function buildConfig() {
  if (form.kind === 'local') {
    return { path: form.path.trim() }
  }
  if (form.kind === 'webdav') {
    return {
      baseUrl: form.baseUrl.trim(),
      username: form.username.trim(),
      password: form.password
    }
  }
  if (form.kind === 'ftp') {
    return {
      host: form.host.trim(),
      port: Number(form.port) || 21,
      user: form.user,
      password: form.password,
      secure: form.secure
    }
  }
  if (form.kind === 'smb') {
    return {
      host: form.host.trim(),
      port: Number(form.port) || 445,
      share: form.share.trim(),
      domain: form.domain,
      user: form.user,
      password: form.password
    }
  }
  return {}
}

function validate(): string {
  if (!form.name.trim()) return '请填写数据源名称'
  if (form.kind === 'local' && !form.path.trim()) return '请填写服务器上的目录绝对路径'
  if (form.kind === 'webdav' && !form.baseUrl.trim()) return '请填写 WebDAV 服务器地址'
  if ((form.kind === 'ftp' || form.kind === 'smb') && !form.host.trim()) return '请填写主机地址'
  if (form.kind === 'smb' && !form.share.trim()) return '请填写共享名'
  return ''
}

function validateConnectionInput(): string {
  if (form.kind === 'local' && !form.path.trim()) return '请填写服务器上的目录绝对路径'
  if (form.kind === 'webdav' && !form.baseUrl.trim()) return '请填写 WebDAV 服务器地址'
  if ((form.kind === 'ftp' || form.kind === 'smb') && !form.host.trim()) return '请填写主机地址'
  if (form.kind === 'smb' && !form.share.trim()) return '请填写共享名'
  return ''
}

async function testConnection() {
  const inputError = validateConnectionInput()
  if (inputError) {
    _notice(inputError)
    return
  }
  testing.value = true
  testMessage.value = ''
  testOk.value = null
  try {
    const res: any = await testSource({
      id: form.id || undefined,
      kind: form.kind,
      config: buildConfig(),
      rootPath: form.rootPath || '/'
    })
    const data: any = res.data
    if (data?.ok) {
      testOk.value = true
      const names = (data.names ?? []).join('、')
      testMessage.value = `连接成功：${data.total ?? 0} 个条目（${data.dirs ?? 0} 个目录 / ${data.files ?? 0} 个文件）${names ? '，例如：' + names : ''}`
    } else {
      testOk.value = false
      testMessage.value = '连接失败：' + (data?.error || res.msg || '未知错误')
    }
  } finally {
    testing.value = false
  }
}

async function save() {
  const error = validate()
  if (error) {
    _notice(error)
    return
  }
  saving.value = true
  try {
    const res: any = await saveSource({
      id: form.id || undefined,
      kind: form.kind,
      name: form.name.trim(),
      rootPath: form.rootPath || '/',
      config: buildConfig() as any
    })
    if (!res.success) {
      _notice(res.msg || '保存失败')
      return
    }
    bus.emit(EVENT_KEY.LIBRARY_CHANGED)
    _notice('已保存，可回到列表开始扫描')
    router.replace('/sources')
  } finally {
    saving.value = false
  }
}

function remove() {
  _showSimpleConfirmDialog('删除这个数据源及其索引？', async () => {
    await deleteSource(form.id)
    bus.emit(EVENT_KEY.LIBRARY_CHANGED)
    router.replace('/sources')
  })
}

function back() {
  router.replace('/sources')
}

async function loadExisting() {
  const id = String(route.query.id ?? '')
  if (!id) {
    pickKind('local')
    return
  }
  const res: any = await sourceList()
  const row = res.success ? (res.data?.list ?? []).find((s: any) => s.id === id) : null
  if (!row) {
    _notice('数据源不存在')
    router.replace('/sources')
    return
  }
  form.id = row.id
  form.kind = row.kind
  form.name = row.name
  form.rootPath = row.rootPath || '/'
  const cfg: any = row.config ?? {}
  if (row.kind === 'local') {
    form.path = cfg.path ?? ''
  } else if (row.kind === 'webdav') {
    form.baseUrl = cfg.baseUrl ?? ''
    form.username = cfg.username ?? ''
    form.password = cfg.password ?? ''
  } else if (row.kind === 'ftp') {
    form.host = cfg.host ?? ''
    form.port = cfg.port ?? 21
    form.user = cfg.user ?? ''
    form.password = cfg.password ?? ''
    form.secure = Boolean(cfg.secure)
  } else if (row.kind === 'smb') {
    form.host = cfg.host ?? ''
    form.port = cfg.port ?? 445
    form.share = cfg.share ?? ''
    form.domain = cfg.domain ?? ''
    form.user = cfg.user ?? ''
    form.password = cfg.password ?? ''
  }
}

onMounted(async () => {
  await loadExisting()
})
</script>

<style scoped lang="less">
.source-edit {
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
    gap: 10rem;
    padding: 14rem 16rem;

    .back {
      font-size: 20rem;
      opacity: 0.85;
      cursor: pointer;
    }

    .title {
      flex: 1;
      font-size: 15rem;
      font-weight: 600;
    }

    .save {
      font-size: 13rem;
      color: var(--primary-btn-color, #fc2f56);
      cursor: pointer;
    }
  }

  .scroll {
    flex: 1;
    overflow: auto;
    padding: 0 14rem 30rem;
  }

  .kinds {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8rem;
    margin-bottom: 16rem;

    .kind {
      display: flex;
      flex-direction: column;
      gap: 3rem;
      padding: 12rem;
      border-radius: 10rem;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid transparent;
      cursor: pointer;

      &.active {
        border-color: var(--primary-btn-color, #fc2f56);
        background: rgba(252, 47, 86, 0.1);
      }

      .kind-icon {
        font-size: 20rem;
        opacity: 0.8;
      }

      .kind-name {
        font-size: 13rem;
        font-weight: 600;
      }

      .kind-tip {
        font-size: 10rem;
        color: rgba(255, 255, 255, 0.45);
      }
    }
  }

  .field {
    display: flex;
    align-items: center;
    gap: 10rem;
    padding: 10rem 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);

    label {
      flex: 0 0 76rem;
      font-size: 12rem;
      color: rgba(255, 255, 255, 0.55);
    }

    .field-note {
      flex: 1;
      font-size: 12rem;
      color: rgba(255, 255, 255, 0.6);
    }

    input {
      flex: 1;
      min-width: 0;
      height: 32rem;
      padding: 0 10rem;
      border-radius: 8rem;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.06);
      color: #fff;
      font-size: 12rem;
      outline: none;

      &:focus {
        border-color: rgba(252, 47, 86, 0.6);
      }
    }

    .switch {
      flex: none;
      position: relative;
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
  }

  .test-row {
    display: flex;
    margin-top: 12rem;

    .pick {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5rem;
      height: 34rem;
      border-radius: 8rem;
      border: 1px dashed rgba(255, 255, 255, 0.22);
      background: transparent;
      color: #fff;
      font-size: 12rem;
      cursor: pointer;

      &:disabled {
        opacity: 0.5;
      }
    }
  }

  .hint {
    margin: 10rem 0 0;
    font-size: 11rem;
    line-height: 1.6;
    color: rgba(255, 255, 255, 0.4);

    &.ok {
      color: #6ee7a8;
    }

    &.fail {
      color: #ff7b93;
    }
  }

  .actions {
    display: flex;
    gap: 10rem;
    margin-top: 24rem;

    button {
      flex: 1;
      height: 40rem;
      border-radius: 20rem;
      border: none;
      font-size: 13rem;
      cursor: pointer;

      &:disabled {
        opacity: 0.5;
      }
    }

    .primary {
      background: var(--primary-btn-color, #fc2f56);
      color: #fff;
    }

    .ghost {
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
    }

    .danger {
      flex: 0 0 76rem;
      background: rgba(252, 47, 86, 0.16);
      color: #ff7b93;
    }
  }
}
</style>
