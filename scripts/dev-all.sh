#!/usr/bin/env bash
# 一键启动「TokTik 后端 + Vite 前端」，并在退出时一并清理。
#
# 用法：
#   pnpm dev:all                       # 后端 127.0.0.1:8787 + 前端 http://localhost:3000
#   pnpm dev:all --port 5173           # 追加参数原样传给 vite
#   PORT=9000 pnpm dev:all             # 改后端端口（vite 会读取 TOKTIK_API 代理目标）
#   HOST=0.0.0.0 PORT=8787 pnpm dev:all  # 让后端对局域网开放
#   TOKTIK_DATA=/srv/toktik-data pnpm dev:all  # 改数据目录（默认 ./data）
#
# Vite 只把 /api 代理到后端，页面本身不直接连接任何信源；
# 后端若已在运行则直接复用，不再重复启动。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

API_PORT="${PORT:-8787}"
API_HOST="${HOST:-127.0.0.1}"
export PORT="$API_PORT"
export HOST="$API_HOST"
# vite 的 /api 代理目标：后端换端口时前端自动跟随
export TOKTIK_API="${TOKTIK_API:-http://127.0.0.1:$API_PORT}"

info() { printf '\033[36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[33m!!\033[0m %s\n' "$*"; }

command -v node >/dev/null 2>&1 || {
  echo "缺少 node，请先安装 Node.js 20+"
  exit 1
}
[ -d "$ROOT/node_modules" ] || {
  echo "未安装依赖，请先运行 pnpm install"
  exit 1
}
[ -x "$ROOT/node_modules/.bin/vite" ] || {
  echo "找不到 vite，请先运行 pnpm install"
  exit 1
}

api_pid=""
web_pid=""

# 只统计仍在运行的后台任务；已退出但未回收的子进程不会误判为存活
alive() {
  local list
  list="$(jobs -pr)"
  case $'\n'"$list"$'\n' in
    *$'\n'"$1"$'\n'*) return 0 ;;
    *) return 1 ;;
  esac
}

stop_job() {
  local pid="$1"
  [ -n "$pid" ] || return 0
  alive "$pid" || return 0
  kill -TERM "$pid" 2>/dev/null || true
  local i
  for i in 1 2 3 4 5 6 7 8 9 10; do
    alive "$pid" || return 0
    sleep 0.2
  done
  kill -KILL "$pid" 2>/dev/null || true
}

cleanup() {
  trap - INT TERM EXIT
  stop_job "$web_pid"
  stop_job "$api_pid"
  wait 2>/dev/null || true
}
trap 'cleanup; exit 130' INT
trap 'cleanup; exit 143' TERM
trap cleanup EXIT

# 用 Node 探测后端健康状态（避免依赖 curl）
http_ok() {
  node - "$1" "$2" "${3:-1500}" <<'NODE'
const [host, port, timeout] = process.argv.slice(2)
const probeHost = host === '0.0.0.0' ? '127.0.0.1' : host
const deadline = Date.now() + Number(timeout)
async function tick() {
  try {
    const res = await fetch(`http://${probeHost}:${port}/api/health`, {
      signal: AbortSignal.timeout(700)
    })
    if (res.ok) process.exit(0)
  } catch {
    /* 尚未就绪 */
  }
  if (Date.now() > deadline) process.exit(1)
  setTimeout(tick, 150)
}
void tick()
NODE
}

if command -v ffmpeg >/dev/null 2>&1 && command -v ffprobe >/dev/null 2>&1; then
  info "检测到 ffmpeg：$(command -v ffmpeg)"
else
  warn "未找到 ffmpeg/ffprobe：仍可扫描与播放，但封面将使用文字兜底"
fi

if http_ok 127.0.0.1 "$API_PORT" 1000; then
  info "后端已在 127.0.0.1:$API_PORT 运行，跳过启动"
else
  info "启动后端 → http://$API_HOST:$API_PORT（数据目录：${TOKTIK_DATA:-$ROOT/data}）"
  ( exec ./node_modules/.bin/tsx watch server/index.ts ) &
  api_pid=$!
  if ! http_ok 127.0.0.1 "$API_PORT" 15000; then
    if ! alive "$api_pid"; then
      warn "后端启动失败，已退出"
      exit 1
    fi
    warn "后端尚未就绪，前端继续启动；稍后刷新页面重试"
  fi
fi

info "启动前端 → vite --host $*"
( exec ./node_modules/.bin/vite --host "$@" ) &
web_pid=$!

info "已启动（Ctrl+C 同时退出后端与前端）"

# 任一进程退出就结束另一个，退出码沿用先退出的进程
set +e
while alive "$web_pid"; do
  if [ -n "$api_pid" ] && ! alive "$api_pid"; then
    wait "$api_pid"
    code=$?
    warn "后端已退出（code $code），正在停止前端"
    exit "$code"
  fi
  sleep 0.5
done
wait "$web_pid"
exit $?
