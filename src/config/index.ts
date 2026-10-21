/** 前端只与同源后端 /api 通信（开发态由 vite 代理到 tsx 服务） */
export default {
  baseUrl: '/api',
  imgPath: '/api/media',
  version: '0.2.0'
}

export const IS_DEV = import.meta.env.DEV
/** 不使用子域部署，统一 history 路由 */
export const IS_SUB_DOMAIN = false
export const BASE_URL = ''
export const IMG_URL = ''
export const FILE_URL = ''
