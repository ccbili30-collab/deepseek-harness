#!/bin/zsh
# 诺文 Web 镜像：固定使用本仓库的隔离数据根；已有服务只复用，不重复启动。
set -u

REPO="${0:A:h}"
PORT=3083
LOG="$REPO/.data/web-$PORT.log"
URL=""

export DSH_HOME="$REPO/.data/harness"
export NOVEN_HOME="$REPO/.data/library"
export NOVEN_PROJECTS_ROOT="$REPO/.data/projects"

mkdir -p "$DSH_HOME" "$NOVEN_HOME" "$NOVEN_PROJECTS_ROOT"

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  print -r -- "端口 $PORT 已有服务，只复用现有实例。"
else
  if [[ ! -f "$REPO/apps/web/dist/index.html" ]]; then
    print -r -- "缺少 Web 构建，请先在仓库根目录运行 pnpm run build。" >&2
    exit 1
  fi
  : > "$LOG"
  print -r -- "正在启动隔离的 Noven Web 镜像…"
  nohup env NODE_NO_BUILD=1 pnpm --dir "$REPO" dsh web \
    --patch "$REPO/apps/desktop/noven/profile/cordis.patch.yml" \
    --no-open --port "$PORT" > "$LOG" 2>&1 &
  STARTED_PID=$!
fi

for _ in {1..60}; do
  if [[ -f "$LOG" ]]; then
    URL=$(grep -m1 -o "http://127.0.0.1:$PORT/?token=[A-Za-z0-9_-]*" "$LOG" 2>/dev/null || true)
    [[ -n "$URL" ]] && break
  fi
  sleep 0.5
done

if [[ -z "$URL" ]]; then
  if [[ -n "${STARTED_PID:-}" ]] && kill -0 "$STARTED_PID" 2>/dev/null; then
    kill "$STARTED_PID"
  fi
  print -r -- "启动失败或超时；未重复启动。日志：$LOG" >&2
  exit 1
fi

if ! curl -fsS --max-time 5 "$URL" -o /dev/null; then
  print -r -- "现有地址不可访问；未再启动第二套服务。日志：$LOG" >&2
  exit 1
fi

open "$URL"
print -r -- "已打开：$URL"
print -r -- "数据根：$REPO/.data（与 Noven Test、正式版隔离）"
