#!/bin/bash
# usage: gen.sh <name> ; composes style + layout-core + tree (from @tree: line) + screen
cd "$(dirname "$0")/.."
D=journey; n="$1"; f="$D/prompts/$n.txt"
tree=$(head -1 "$f" | sed -n 's/^@tree://p')
P="$(cat prompts/style.txt; echo; cat $D/prompts/layout-core.txt; echo; [ -n "$tree" ] && cat $D/prompts/tree-$tree.txt; echo; tail -n +2 "$f")"
python3 ~/.agents/skills/gen-image/scripts/gen_image.py --alias flare --image base.png --ratio 16:9 --prompt "$P" --out "$D/$n.png" > "$D/$n.log" 2>&1
