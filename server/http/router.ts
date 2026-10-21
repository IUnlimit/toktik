import type { IncomingMessage, ServerResponse } from 'node:http'
import type { UserRecord } from '../store'

export interface RouteContext {
  params: Record<string, string>
  query: URLSearchParams
  body: any
  path: string
  user: UserRecord | null
  req: IncomingMessage
  res: ServerResponse
}

export interface RouteResponse {
  status: number
  body: any
  headers?: Record<string, string>
}

type Handler = (ctx: RouteContext) => Promise<RouteResponse> | RouteResponse

interface Route {
  method: string
  pattern: RegExp
  keys: string[]
  handler: Handler
  /** 未登录也可访问 */
  public: boolean
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
  }
}

/** 把 /source/:id/scan 编译成带捕获组的正则 */
function compile(path: string): { pattern: RegExp; keys: string[] } {
  const keys: string[] = []
  const source = path
    .split('/')
    .map((segment) => {
      if (!segment) return ''
      if (segment.startsWith(':')) {
        keys.push(segment.slice(1))
        return '([^/]+)'
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    })
    .join('/')
  return { pattern: new RegExp('^' + source + '/?$'), keys }
}

export class Router {
  private routes: Route[] = []

  register(method: string, path: string, handler: Handler, isPublic = false): this {
    const { pattern, keys } = compile(path)
    this.routes.push({ method: method.toUpperCase(), pattern, keys, handler, public: isPublic })
    return this
  }

  get(path: string, handler: Handler, isPublic = false) {
    return this.register('GET', path, handler, isPublic)
  }

  post(path: string, handler: Handler, isPublic = false) {
    return this.register('POST', path, handler, isPublic)
  }

  delete(path: string, handler: Handler, isPublic = false) {
    return this.register('DELETE', path, handler, isPublic)
  }

  isPublic(method: string, path: string): boolean {
    const upper = (method || 'GET').toUpperCase()
    const clean = (path || '/').split('?')[0]
    return this.routes.some(
      (route) => route.public && route.method === upper && route.pattern.test(clean)
    )
  }

  async handle(
    method: string,
    url: string,
    ctx: Omit<RouteContext, 'params' | 'path'>
  ): Promise<RouteResponse> {
    const clean = (url || '/').split('?')[0]
    const upper = (method || 'GET').toUpperCase()
    for (const route of this.routes) {
      if (route.method !== upper) continue
      const match = route.pattern.exec(clean)
      if (!match) continue
      const params: Record<string, string> = {}
      route.keys.forEach((key, index) => {
        try {
          params[key] = decodeURIComponent(match[index + 1])
        } catch {
          params[key] = match[index + 1]
        }
      })
      try {
        return await route.handler({ ...ctx, params, path: clean })
      } catch (err) {
        const status = err instanceof HttpError ? err.status : 500
        const message = err instanceof Error ? err.message : String(err)
        if (status >= 500) console.error('[api]', clean, err)
        return { status, body: { code: status, msg: message, data: null } }
      }
    }
    return { status: 404, body: { code: 404, msg: `接口不存在: ${upper} ${clean}`, data: null } }
  }
}
