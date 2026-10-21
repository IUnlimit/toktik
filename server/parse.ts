import { baseName, extOf, isPlayableExt, parentPath } from '../shared/types'

/** 常见质量/来源标签，命中即整体剔除 */
const TAG_PATTERN = new RegExp(
  [
    '\\b(?:2160p|1440p|1080p|1080i|720p|576p|480p|4k|8k|uhd)\\b',
    '\\b(?:hdr10\\+?|hdr|dolby\\s*vision|dv|10bit|8bit|60fps|120fps)\\b',
    '\\b(?:h\\.?26[45]|x26[45]|hevc|avc|av1)\\b',
    '\\b(?:aac|ac3|eac3|dts(?:-hd)?|truehd|flac|opus|mp3)\\b',
    '\\b\\d\\.\\d(?:\\.\\d)?\\b',
    '\\b(?:blu-?ray|bdrip|brrip|web-?dl|webrip|hdtv|remux|dvdrip|hdcam|proper|repack)\\b'
  ].join('|'),
  'gi'
)

const RELEASE_GROUP_TAIL = /\s*[-–—]\s*[A-Za-z0-9@._]{2,20}$/
const BRACKET_GROUP = /^\s*[[【][^\]】]{1,24}[\]】]\s*/
const YEAR_PAREN = /[(（[]\s*(?:19|20)\d{2}\s*[)）\]]/g
const CN_EPISODE = /第\s*(\d{1,4})\s*[集话話期篇回]/
const SXXEXX = /\bS(\d{1,2})\s*E(\d{1,3})\b/i
const BRACKET_NUM = /[[【(（]\s*(\d{1,4})\s*[\]】)）]/
const DASH_NUM = /[-–—]\s*(\d{1,4})(?:\s*[-–—]|$)/

export interface ParsedName {
  title: string
  episode: number | null
}

/**
 * 从文件名推导标题与集数。
 * 目标不是还原绝对准确的元信息，而是让播放列表看起来像抖音的信息流：
 * 标题足够干净、集数可用于排序与「第 N 集」展示。
 */
export function parseVideoName(fileName: string): ParsedName {
  const ext = extOf(fileName)
  let name = ext ? fileName.slice(0, -(ext.length + 1)) : fileName

  let episode: number | null = null

  const cn = CN_EPISODE.exec(name)
  if (cn) {
    episode = Number(cn[1])
    name = name.replace(CN_EPISODE, ' ')
  } else {
    const sxxexx = SXXEXX.exec(name)
    if (sxxexx) {
      episode = Number(sxxexx[2])
      name = name.replace(SXXEXX, ' ')
    } else {
      const bracket = BRACKET_NUM.exec(name)
      if (bracket) {
        episode = Number(bracket[1])
        name = name.replace(BRACKET_NUM, ' ')
      } else {
        const dash = DASH_NUM.exec(name)
        if (dash) {
          episode = Number(dash[1])
          name = name.replace(DASH_NUM, ' ')
        }
      }
    }
  }

  name = name
    .replace(BRACKET_GROUP, ' ')
    .replace(YEAR_PAREN, ' ')
    .replace(TAG_PATTERN, ' ')
    .replace(/[._]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()

  // 去掉结尾的发布组残留，例如 "xxx - RARBG"
  if (name.length > 8) {
    const stripped = name.replace(RELEASE_GROUP_TAIL, '')
    if (stripped.trim().length >= 2) name = stripped.trim()
  }

  name = name.replace(/^[-–—_~\s]+|[-–—_~\s]+$/g, '')

  if (!name) name = baseName(fileName)

  return { title: name, episode }
}

/** 由视频路径推导合集名：上一级目录，根目录文件归入「未分类」 */
export function parseCollection(path: string): string {
  const parent = parentPath(path)
  if (parent === '/' || !parent) return '未分类'
  const dir = baseName(parent)
  const cleaned = dir.replace(/[._]+/g, ' ').replace(/\s{2,}/g, ' ').trim()
  return cleaned || '未分类'
}

/** 仅末尾标签，不含 @ 前缀（用于生成抖音风格的描述） */
export function buildDescription(video: {
  title: string
  collection: string
  episode: number | null
  ext: string
}): string {
  const parts: string[] = [video.title]
  if (video.collection && video.collection !== '未分类') parts.push('#' + video.collection)
  if (video.episode !== null) parts.push('#第' + video.episode + '集')
  if (!isPlayableExt(video.ext)) parts.push('#需转码')
  return parts.join(' ')
}
