import type { Source } from '../../shared/types'
import type { SourceDriver } from './types'
import { createLocalDriver } from './local'
import { createWebdavDriver } from './webdav'
import { createFtpDriver } from './ftp'
import { createSmbDriver } from './smb'

interface CachedDriver {
  signature: string
  driver: SourceDriver
}

const drivers = new Map<string, CachedDriver>()

function signatureOf(source: Source): string {
  return JSON.stringify({
    kind: source.kind,
    rootPath: source.rootPath,
    config: source.config
  })
}

/** 构造驱动（不做缓存）；「测试连接」等一次性场景直接调用 */
export function buildDriver(source: Source): SourceDriver {
  switch (source.kind) {
    case 'local':
      return createLocalDriver(source)
    case 'webdav':
      return createWebdavDriver(source)
    case 'ftp':
      return createFtpDriver(source)
    case 'smb':
      return createSmbDriver(source)
    default:
      throw new Error('未知的数据源类型：' + String((source as Source).kind))
  }
}

/** 取（或创建）数据源驱动；配置变化后自动重建，避免沿用旧凭据 */
export function driverOf(source: Source): SourceDriver {
  const signature = signatureOf(source)
  const cached = drivers.get(source.id)
  if (cached && cached.signature === signature) return cached.driver

  const driver = buildDriver(source)
  drivers.set(source.id, { signature, driver })
  return driver
}

export function dropDriver(sourceId: string): void {
  drivers.delete(sourceId)
}

export function dropAllDrivers(): void {
  drivers.clear()
}
