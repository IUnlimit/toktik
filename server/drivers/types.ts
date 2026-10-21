import type { Readable } from 'node:stream'
import type { DirEntry, SourceKind } from '../../shared/types'

/** 闭区间字节范围 */
export interface ByteRange {
  start: number
  end: number
}

export interface OpenResult {
  stream: Readable
  /** 本次返回的字节数（用于 Content-Length） */
  contentLength: number
  /** 远端文件总大小（未知时为 undefined） */
  totalSize?: number
}

export interface SourceDriver {
  readonly kind: SourceKind
  list(relPath: string): Promise<DirEntry[]>
  open(relPath: string, range: ByteRange): Promise<OpenResult>
}

/** 请求的区间超出文件长度 */
export class RangeError_ extends Error {
  constructor(message = '请求的字节范围无效') {
    super(message)
  }
}
