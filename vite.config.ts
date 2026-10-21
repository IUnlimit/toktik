import { defineConfig, type UserConfig } from 'vite'
import Vue from '@vitejs/plugin-vue'
import VueJsx from '@vitejs/plugin-vue-jsx'
import { fileURLToPath, URL } from 'node:url'
import VueMacros from 'unplugin-vue-macros/vite'

export default defineConfig((): UserConfig => {
  return {
    // 用绝对路径，否则在 /sources/edit 这类深层路由直接刷新时相对路径会解析错误
    base: '/',
    envDir: 'env',
    plugins: [
      VueMacros({
        plugins: {
          vue: Vue(),
          vueJsx: VueJsx()
        }
      })
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@shared': fileURLToPath(new URL('./shared', import.meta.url))
      },
      extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.vue']
    },
    build: {
      sourcemap: false,
      target: 'es2022',
      rollupOptions: {
        output: {
          chunkFileNames: 'js/[name]-[hash].js',
          entryFileNames: 'js/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]'
        }
      },
      assetsInlineLimit: 2048
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      fs: {
        strict: false
      },
      // 开发时前端只与 vite 同源交互，/api 转发到本机后端（pnpm dev:server）
      proxy: {
        '/api': {
          target: process.env.TOKTIK_API || 'http://127.0.0.1:8787',
          changeOrigin: false
        }
      }
    },
    preview: {
      port: 5555
    }
  }
})
