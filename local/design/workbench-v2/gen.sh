#!/bin/bash
# usage: gen.sh <screen-prompt-file-basename-without-.txt>
cd "$(dirname "$0")"
n="$1"
P="$(cat prompts/style.txt; echo; cat prompts/layout.txt; echo; cat "prompts/$n.txt")"
python3 ~/.agents/skills/gen-image/scripts/gen_image.py --alias flare --image base.png --ratio 16:9 --prompt "$P" --out "$n.png" > "$n.log" 2>&1
