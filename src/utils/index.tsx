import * as Vue from 'vue'
import SelectDialog from '../components/dialog/SelectDialog.vue'
import SimpleConfirmDialog from '../components/dialog/SimpleConfirmDialog.vue'
import ConfirmDialog from '../components/dialog/ConfirmDialog.vue'
import Loading from '../components/Loading.vue'
import NoticeDialog from '../components/dialog/NoticeDialog.vue'
import BaseVideo from '@/components/slide/BaseVideo.vue'

export function _storageSet(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value))
}

export function _storageGet<T = any>(key: string, defaultValue: T): T {
  const res = localStorage.getItem(key)
  if (res) {
    try {
      return JSON.parse(res) as T
    } catch {
      return defaultValue
    }
  }
  return defaultValue
}

export function _stopPropagation(e: Event) {
  e.stopImmediatePropagation()
  e.stopPropagation()
  e.preventDefault()
}

export function _stop(e: Event) {
  e.stopPropagation()
}

export function _copy(val: string) {
  const textarea = document.createElement('textarea')
  document.body.appendChild(textarea)
  textarea.style.position = 'absolute'
  textarea.style.clip = 'rect(0 0 0 0)'
  textarea.value = val
  textarea.select()
  if (document.execCommand) {
    document.execCommand('copy', true)
    _notice('已复制')
  }
  document.body.removeChild(textarea)
}

export function _formatNumber(num: number) {
  if (!num) return 0
  if (num > 100000000) return (num / 100000000).toFixed(1) + '亿'
  if (num > 10000) return (num / 10000).toFixed(1) + '万'
  return num
}

export function _formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return value.toFixed(value >= 100 || i === 0 ? 0 : 1) + ' ' + units[i]
}

export function _dateFormat(val: any, type?: string): string {
  if (!val) return ''
  if (String(val).length === 10) val = val * 1000
  const d = new Date(Number(val))
  const year = d.getFullYear()
  const m = d.getMonth() + 1
  const mStr = m < 10 ? '0' + m : String(m)
  const day = d.getDate()
  const dayStr = day < 10 ? '0' + day : String(day)
  const h = d.getHours()
  const hStr = h < 10 ? '0' + h : String(h)
  const min = d.getMinutes()
  const minStr = min < 10 ? '0' + min : String(min)
  const sec = d.getSeconds()
  const secStr = sec < 10 ? '0' + sec : String(sec)
  switch (type) {
    case 'Y':
      return String(year)
    case 'M':
      return `${year}-${mStr}`
    case 'M_D':
      return `${mStr}-${dayStr}`
    case 'M_CN':
      return `${year}年${mStr}月`
    case 'D':
      return `${year}-${mStr}-${dayStr}`
    case 'm':
      return `${year}-${mStr}-${dayStr} ${hStr}:${minStr}`
    default:
      return `${year}-${mStr}-${dayStr} ${hStr}:${minStr}:${secStr}`
  }
}

export function _time(time: any): string {
  if (!time) return ''
  if (String(time).length === 10) time = time * 1000
  const date = new Date(Number(time))
  const now = new Date()
  const d = now.valueOf() - date.valueOf()
  if (d < 1000 * 60) return '刚刚'
  if (d < 1000 * 60 * 60) return `${Math.floor(d / (1000 * 60))}分钟前`
  if (d < 1000 * 60 * 60 * 24) return `${Math.floor(d / (1000 * 60 * 60))}小时前`
  if (d < 1000 * 60 * 60 * 24 * 2) return '昨天'
  if (d < 1000 * 60 * 60 * 24 * 3) return '前天'
  if (date.getFullYear() === now.getFullYear()) return _dateFormat(time, 'M_D')
  return _dateFormat(time, 'D')
}

export function _duration(v: number) {
  if (!v || !Number.isFinite(v)) return '00:00'
  const total = Math.max(0, Math.round(v))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => (n < 10 ? '0' + n : String(n))
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`
  return `${pad(m)}:${pad(s)}`
}

export function _sleep(duration: number) {
  return new Promise((resolve) => setTimeout(resolve, duration))
}

export function cloneDeep<T>(val: T): T {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(val)
    } catch {
      /* 含函数/Blob 等不可克隆值时退化为 JSON */
    }
  }
  return JSON.parse(JSON.stringify(val))
}

function mountDialog(render: () => any, cls: string[] = ['dialog-ctn', 'fade-in']) {
  const app = Vue.createApp({ render })
  const parent = document.createElement('div')
  parent.classList.add(...cls)
  document.body.append(parent)
  app.mount(parent)
}

function removeDialog(_e?: any) {
  const parent = document.querySelector('.dialog-ctn')
  if (!parent) return
  parent.classList.replace('fade-in', 'fade-out')
  setTimeout(() => parent.remove(), 300)
}

export function _showLoading() {
  mountDialog(() => <Loading />)
}

export function _hideLoading() {
  document.querySelector('.dialog-ctn')?.remove()
}

export function _showSelectDialog(list: any[], cb: (v: any) => void) {
  const tempCb = (e: any) => {
    removeDialog()
    cb(e)
  }
  mountDialog(() => <SelectDialog onCancel={removeDialog} list={list} onOk={tempCb} />)
}

export function _showSimpleConfirmDialog(
  title: string,
  okCb: (e?: any) => void,
  cancelCb?: (e?: any) => void,
  okText?: string,
  cancelText?: string
) {
  const tempOkCb = () => {
    removeDialog()
    okCb?.()
  }
  const tempCancelCb = () => {
    removeDialog()
    cancelCb?.()
  }
  mountDialog(() => (
    <SimpleConfirmDialog
      onCancel={tempCancelCb}
      onDismiss={removeDialog}
      title={title}
      okText={okText}
      cancelText={cancelText}
      onOk={tempOkCb}
    />
  ))
}

export function _showConfirmDialog(
  title: string,
  subtitle?: string,
  subtitleColor?: string,
  okCb?: (e?: any) => void,
  cancelCb?: (e?: any) => void,
  okText?: string,
  cancelText?: string,
  cancelTextColor?: string
) {
  const tempOkCb = () => {
    removeDialog()
    okCb?.()
  }
  const tempCancelCb = () => {
    removeDialog()
    cancelCb?.()
  }
  mountDialog(() => (
    <ConfirmDialog
      onCancel={tempCancelCb}
      onDismiss={removeDialog}
      title={title}
      subtitle={subtitle}
      subtitleColor={subtitleColor}
      cancelTextColor={cancelTextColor}
      okText={okText}
      cancelText={cancelText}
      onOk={tempOkCb}
    />
  ))
}

export function _showNoticeDialog(
  title: string,
  subtitle: string,
  subtitleColor?: string,
  cancelCb?: (e?: any) => void,
  cancelText?: string
) {
  const tempCancelCb = () => {
    removeDialog()
    cancelCb?.()
  }
  mountDialog(() => (
    <NoticeDialog
      onCancel={tempCancelCb}
      onDismiss={removeDialog}
      title={title}
      subtitleColor={subtitleColor}
      cancelText={cancelText}
      subtitle={subtitle}
    />
  ))
}

export function _notice(val: string) {
  const div = document.createElement('div')
  div.classList.add('global-notice')
  div.textContent = val
  document.body.append(div)
  setTimeout(() => div.remove(), 1600)
}

export function _no() {
  _notice('该功能未实现')
}

/** slide 列表的条目渲染器：只保留视频一种类型 */
export function slideItemRender(props: Record<string, any>) {
  return function render(
    item: any,
    index: number,
    play: boolean,
    uniqueId: string,
    currentIndex: number
  ) {
    return (
      <BaseVideo
        isPlay={play}
        item={item}
        position={{ uniqueId, index }}
        currentIndex={currentIndex}
        {...props}
      />
    )
  }
}
