#!/bin/zsh
# 把场景文件同步到「桌面世界」读取的位置。
#
#   app/sync-web.sh            同步到 ~/Library/Application Support/DeskWorld/web
#   app/sync-web.sh <目录>     同步到指定目录
#
# 正在运行的桌面世界每秒检查一次这些文件，发现变化就自己重新载入——
# 所以只改场景（scene-lab 里的 js / html）时不需要重建程序，运行这个脚本就行。
set -euo pipefail
HERE="${0:A:h}"
SRC="${HERE:h}/scene-lab"
DEST="${1:-$HOME/Library/Application Support/DeskWorld/web}"

mkdir -p "$DEST/scenes"
cp "$SRC/wallpaper.html" "$SRC/engine.js" "$SRC/wall.js" "$DEST/"
cp "$SRC/scenes/paper.js" "$DEST/scenes/"
echo "场景文件已同步到 $DEST"
