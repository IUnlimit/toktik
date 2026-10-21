const COVER_WIDTH = 480

function hash32(input: string): number {
  let hash = 2166136261
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function paletteFor(seed: number): [string, string] {
  const hue = seed % 360
  const hue2 = (hue + 28 + (seed % 40)) % 360
  return [`hsl(${hue} 62% 34%)`, `hsl(${hue2} 58% 14%)`]
}

function initialOf(title: string): string {
  const text = title.trim()
  if (!text) return '▶'
  const first = Array.from(text)[0]
  return /[a-z0-9]/i.test(first) ? first.toUpperCase() : first
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** 没有抽帧成功时的兜底封面：标题首字 + 稳定渐变色 */
export function fallbackCoverSvg(title: string, seedText: string): Buffer {
  const seed = hash32(seedText || title)
  const [from, to] = paletteFor(seed)
  const initial = escapeXml(initialOf(title))
  const label = escapeXml(title.length > 14 ? title.slice(0, 14) + '…' : title)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${COVER_WIDTH}" height="${Math.round(
    COVER_WIDTH * 1.6
  )}" viewBox="0 0 480 768">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>
</linearGradient></defs>
<rect width="480" height="768" fill="url(#g)"/>
<circle cx="380" cy="150" r="220" fill="rgba(255,255,255,0.06)"/>
<circle cx="90" cy="620" r="180" fill="rgba(0,0,0,0.18)"/>
<text x="240" y="400" text-anchor="middle" font-family="-apple-system,'PingFang SC','Microsoft YaHei',sans-serif"
 font-size="150" font-weight="700" fill="rgba(255,255,255,0.9)">${initial}</text>
<text x="240" y="520" text-anchor="middle" font-family="-apple-system,'PingFang SC','Microsoft YaHei',sans-serif"
 font-size="30" fill="rgba(255,255,255,0.72)">${label}</text>
</svg>`
  return Buffer.from(svg, 'utf8')
}

/** 按文件头判断封面格式（ffmpeg 可能输出 webp / jpeg） */
export function sniffImageMime(data: Buffer): string {
  if (data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp'
  }
  if (data.length >= 4 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
    return 'image/png'
  }
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return 'image/jpeg'
  }
  if (data.length >= 6 && data.toString('ascii', 0, 3) === 'GIF') return 'image/gif'
  if (data.length >= 1 && data[0] === 0x3c) return 'image/svg+xml'
  return 'application/octet-stream'
}
