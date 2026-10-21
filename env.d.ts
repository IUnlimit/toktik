/// <reference types="vite/client" />
/// <reference types="unplugin-vue-macros/macros-global" />

declare global {
  interface Window {
    isMoved: boolean
    isMuted: boolean
    showMutedNotice: boolean
  }

  interface Navigator {
    control: any
  }
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

export {}
