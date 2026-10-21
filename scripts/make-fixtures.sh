#!/usr/bin/env bash
# 生成一批测试用短视频（需要 ffmpeg），用于验证扫描/刮削/播放链路
#   bash scripts/make-fixtures.sh [输出目录]
set -euo pipefail

OUT="${1:-/tmp/toktik-fixtures}"
mkdir -p "$OUT/都市日常" "$OUT/山野纪录" "$OUT/山野纪录/2024/冬季" "$OUT/竖直切片"

echo "==> 输出目录：$OUT"

ffmpeg -y -loglevel error -f lavfi -i "testsrc2=size=720x1280:rate=24:duration=6" \
  -f lavfi -i "sine=frequency=440:duration=6" \
  -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest "$OUT/都市日常/01.mp4"

ffmpeg -y -loglevel error -f lavfi -i "testsrc=size=720x1280:rate=24:duration=5" \
  -f lavfi -i "sine=frequency=660:duration=5" \
  -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest "$OUT/都市日常/02.mp4"

ffmpeg -y -loglevel error -f lavfi -i "smptebars=size=1280x720:rate=24:duration=4" \
  -c:v libx264 -pix_fmt yuv420p "$OUT/山野纪录/第一集.mp4"

ffmpeg -y -loglevel error -f lavfi -i "testsrc2=size=1280x720:rate=24:duration=5" \
  -c:v libx264 -pix_fmt yuv420p "$OUT/山野纪录/第二集.mp4"

# 深层目录：用于验证扫描器会递归到任意层级
ffmpeg -y -loglevel error -f lavfi -i "testsrc2=size=1280x720:rate=24:duration=4" \
  -c:v libx264 -pix_fmt yuv420p "$OUT/山野纪录/2024/冬季/第三集.mp4"

ffmpeg -y -loglevel error -f lavfi -i "testsrc2=size=1080x1920:rate=24:duration=8" \
  -f lavfi -i "sine=frequency=330:duration=8" \
  -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest "$OUT/竖直切片/EP03.mp4"

ffmpeg -y -loglevel error -f lavfi -i "testsrc=size=1080x1920:rate=24:duration=7" \
  -f lavfi -i "sine=frequency=520:duration=7" \
  -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest "$OUT/竖直切片/EP04.mp4"

# 一个浏览器打不开的容器，用于验证「索引但不播放」的降级提示
ffmpeg -y -loglevel error -f lavfi -i "testsrc=size=640x360:rate=24:duration=3" \
  -c:v libx264 -pix_fmt yuv420p "$OUT/竖直切片/不支持.mkv"

ls -R "$OUT"
echo "==> 完成。可在 TokTik 中添加「$OUT」作为本地目录或 WebDAV 根目录"
