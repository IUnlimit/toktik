import { installShutdown, startServer } from './http/server'

async function main(): Promise<void> {
  const server = await startServer()
  installShutdown(server)
}

void main().catch((err) => {
  console.error('[toktik] 启动失败', err)
  process.exit(1)
})
