#!/bin/sh
# 验一眼：回答"我屏幕上看到的，到底是哪份代码"。
#
# 源码（src）→ 构建产物（lib）→ profile 链接 → 实例 → 浏览器，五道闸任何一道
# 没走完，页面就还是旧的，而全部测试跑在 src 上、照样全绿。本脚本把五道闸一次
# 打印出来，让"看不见"变成可检查的事实。
#
# 用法：sh local/design/验一眼.sh   （在仓库根目录跑）

printf '\n=== 1. 正在跑的实例 ===\n'
lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | grep -E 'node' | awk '{print "  " $9 "  pid=" $2}' || true
count=$(lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | grep -c 'node')
[ "$count" -gt 1 ] && printf '  ⚠ 有 %s 个实例在跑——会话锁可能互抢（症状：界面"被占用"、点不动）\n' "$count"
printf '  实例启动日志里那行 http://127.0.0.1:PORT/?token=... 才是唯一正确地址；重启会换 token，旧标签页会失效。\n'

printf '\n=== 2. profile 链接指向谁（每个插件一份代码） ===\n'
PROFILE="$HOME/.dsh/profiles/web"
for link in "$PROFILE"/node_modules/noven-*; do
  [ -L "$link" ] || continue
  target=$(readlink "$link")
  name=$(basename "$link")
  case "$target" in
    *noven-pc/plugins-noven/*) printf '  %-18s 主仓\n' "$name" ;;
    *) printf '  %-18s ⚠ %s\n' "$name" "$target" ;;
  esac
done

printf '\n=== 3. 构建产物是否落后于源码 ===\n'
stale=0
for pkg in packages/*/*/ apps/*/ plugins-noven/*/; do
  [ -d "$pkg/lib" ] || continue
  [ -d "$pkg/src" ] || continue
  libnew=$(find "$pkg/lib" -type f -exec stat -f '%m' {} + 2>/dev/null | sort -rn | head -1)
  srcnew=$(find "$pkg/src" -type f -exec stat -f '%m' {} + 2>/dev/null | sort -rn | head -1)
  [ -n "$libnew" ] && [ -n "$srcnew" ] || continue
  if [ "$srcnew" -gt "$libnew" ]; then
    stale=$((stale + 1))
    printf '  ⚠ %-46s 源码比产物新 %s 分钟\n' "$pkg" "$(( (srcnew - libnew) / 60 ))"
  fi
done
[ "$stale" -eq 0 ] && printf '  全部新鲜\n'
[ "$stale" -gt 0 ] && printf '  → 重建：pnpm --filter <包名> run bundle   （plugins-noven 用 pnpm --dir <路径> build）\n'

printf '\n=== 4. 仓库状态 ===\n'
git -C "$(git rev-parse --show-toplevel)" log --oneline -1 | sed 's/^/  HEAD: /'
printf '  未提交改动（不含未跟踪）：\n'
git -C "$(git rev-parse --show-toplevel)" status --short | grep -v '^??' | sed 's/^/    /' || printf '    无\n'
printf '  未跟踪（这些只活在磁盘上，砍目录即真丢）：\n'
git -C "$(git rev-parse --show-toplevel)" status --short | grep '^??' | sed 's/^/    /' || printf '    无\n'

printf '\n=== 5. 各 worktree 分支并入主线的进度 ===\n'
root=$(git rev-parse --show-toplevel)
main=$(git -C "$root" rev-parse --abbrev-ref HEAD)
for b in $(git -C "$root" for-each-ref --format='%(refname:short)' refs/heads | grep -v "^$main$"); do
  n=$(git -C "$root" rev-list --count "$main..$b" 2>/dev/null)
  if [ "$n" -eq 0 ]; then printf '  %-28s 已并入\n' "$b"; else printf '  %-28s ⚠ 未并入 %s 个提交\n' "$b" "$n"; fi
done
printf '\n'
