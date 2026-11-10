#!/bin/zsh
# 构建并安装「桌面世界」。
#
#   app/build.sh          构建 → 安装到 ~/Applications/DeskWorld.app → 同步场景文件
#   app/build.sh --run    之后顺便启动
#
# 只改了场景（scene-lab 里的 js / html）不需要重建：运行 app/sync-web.sh，程序会自己重新载入。
#
# 签名：默认是临时签名（ad-hoc）。那样每次重建后，macOS 会重新问一次「是否允许桌面世界控制访达」。
# 想让授权在重建后依然有效，用自己的开发证书签名：
#   DESKWORLD_SIGN_ID="Apple Development: …" app/build.sh
#
# 安装位置放在 ~/Applications 而不是项目目录里，是因为「文稿」文件夹受系统保护，
# 程序从那里启动时读自己的资源也会触发额外的授权询问。
set -euo pipefail
HERE="${0:A:h}"
NAME=DeskWorld
STAGE="$HERE/build/$NAME.app"
DEST_DIR="${DESKWORLD_INSTALL_DIR:-$HOME/Applications}"
DEST="$DEST_DIR/$NAME.app"
SIGN_ID="${DESKWORLD_SIGN_ID:--}"

echo "编译…"
rm -rf "$STAGE"
mkdir -p "$STAGE/Contents/MacOS" "$STAGE/Contents/Resources"
swiftc -O -swift-version 5 -target "$(uname -m)-apple-macos13.0" \
  -o "$STAGE/Contents/MacOS/$NAME" "$HERE"/Sources/*.swift
cp "$HERE/Info.plist" "$STAGE/Contents/Info.plist"
"$HERE/sync-web.sh" "$STAGE/Contents/Resources/web" > /dev/null   # 程序包里也带一份场景文件

echo "安装到 $DEST …"
pkill -x "$NAME" 2> /dev/null || true        # 正在运行的旧版本先退出
mkdir -p "$DEST_DIR"
[[ "$DEST" == */$NAME.app ]] && rm -rf "$DEST"
cp -R "$STAGE" "$DEST"
codesign --force --sign "$SIGN_ID" "$DEST"
"$HERE/sync-web.sh"

echo "完成。启动：open \"$DEST\"    日志：~/Library/Logs/DeskWorld.log"
if [[ "${1:-}" == "--run" ]]; then open "$DEST"; fi
