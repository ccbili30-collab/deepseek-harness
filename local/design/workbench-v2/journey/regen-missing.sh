#!/bin/bash
# re-run every journey screen that has no PNG yet (needs image-API balance)
cd "$(dirname "$0")"
for f in prompts/J*.txt; do n=$(basename "$f" .txt); [ -f "$n.png" ] || echo "$n"; done | xargs -P 3 -I{} ./gen.sh {}
