#!/bin/zsh
# 诺文本地启动器：起服务（如未起）并自动打开浏览器。
# 双击运行，或终端执行 ./启动诺文.command

REPO="/Users/noven/Documents/Codex/CodexProduct/1/桌面端 noven"
LOG="/tmp/noven-web.log"
PORT=3081

cd "$REPO" || { echo "找不到仓库目录：$REPO"; read -q "?按任意键退出"; exit 1 }

if pgrep -f "dsh web.*--port $PORT" > /dev/null 2>&1; then
  echo "诺文已在运行，直接打开页面…"
else
  echo "正在启动诺文…"
  nohup env NODE_NO_BUILD=1 pnpm dsh web --no-open --port $PORT > "$LOG" 2>&1 &
fi

URL=""
for _ in {1..60}; do
  for candidate in "$LOG" /tmp/dsh-web9.log; do
    URL=$(grep -m1 -o "http://127.0.0.1:$PORT/?token=[A-Za-z0-9_-]*" "$candidate" 2>/dev/null)
    [[ -n "$URL" ]] && break 2
  done
  sleep 0.5
done

if [[ -n "$URL" ]]; then
  open "$URL"
  echo "已打开：$URL"
  echo "日志：$LOG"
else
  echo "启动超时，请查看日志：$LOG"
fi
