import BaseFooter from '../components/BaseFooter.vue'
import Back from '../components/Back.vue'
import Loading from '../components/Loading.vue'
import CONST_VAR from './const_var'
import { Icon } from '@iconify/vue'

/**
 * 全局 mixin：只保留项目实际用到的全局组件与指令。
 * 原项目里大量电商/聊天相关的全局组件已随页面裁剪一并移除。
 */
export default {
  components: {
    BaseFooter,
    'dy-back': Back,
    Loading,
    Icon
  },
  data() {
    return {
      SUCCESS: 200,
      RELATE_ENUM: CONST_VAR.RELATE_ENUM
    }
  },
  directives: {
    longpress: {
      beforeMount: function (el, binding, vNode) {
        // 确保提供的表达式是函数
        if (typeof binding.value !== 'function') {
          // 获取组件名称
          const compName = vNode.context?.name
          // 将警告传递给控制台
          let warn = `[longpress:] provided expression '${binding.expression}' is not afunction, but has to be `
          if (compName) {
            warn += `Found in component '${compName}' `
          }
          console.warn(warn)
        }
        let pressTimer = null
        const start = (e) => {
          if (e.type === 'click' && e.button !== 0) {
            return
          }
          if (pressTimer === null) {
            pressTimer = setTimeout(() => handler(e), 300)
          }
        }
        const cancel = () => {
          if (pressTimer !== null) {
            clearTimeout(pressTimer)
            pressTimer = null
          }
        }
        const handler = (e) => {
          e.stopPropagation()
          e.preventDefault()
          binding.value(e)
        }
        el.addEventListener('touchstart', start)
        el.addEventListener('click', cancel)
        el.addEventListener('touchend', cancel)
        el.addEventListener('touchcancel', cancel)
      }
    },
    hide: {
      beforeMount: function (el, binding) {
        el.style.opacity = binding.value ? 0 : 1
      },
      updated: function (el, binding) {
        el.style.opacity = binding.value ? 0 : 1
      }
    }
  }
}
