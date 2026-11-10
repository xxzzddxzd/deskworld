#!/bin/zsh
# 打一个可以分发的发布包：通用二进制（Apple 芯片 + Intel）、自带场景文件、压成 zip。
#
#   app/release.sh      →  app/build/release/DeskWorld-<版本>.zip
#
# 版本号取自 Info.plist 的 CFBundleShortVersionString。不安装、也不会动正在运行的桌面世界。
#
# 签名：
#   默认是临时签名（ad-hoc）。这样的包从网上下载后，第一次打开会被系统门禁拦一次，
#   要到「系统设置 → 隐私与安全性」里点「仍要打开」；之后才是正常的双击打开。
#
#   想做到「下载后直接双击」，需要 Developer ID 证书并经 Apple 公证：
#     DESKWORLD_SIGN_ID="Developer ID Application: 名字 (团队号)" \
#     DESKWORLD_NOTARY_PROFILE="notarytool store-credentials 时起的名字" app/release.sh
#   注意：这条路还没有实测过（写这个脚本时手头没有 Developer ID 证书）。
set -euo pipefail
HERE="${0:A:h}"
NAME=DeskWorld
VERSION=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$HERE/Info.plist")
OUT="$HERE/build/release"
APP="$OUT/$NAME.app"
ZIP="$OUT/$NAME-$VERSION.zip"
SIGN_ID="${DESKWORLD_SIGN_ID:--}"

echo "编译 $NAME $VERSION（arm64 + x86_64）…"
rm -rf "$OUT"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
for arch in arm64 x86_64; do
  swiftc -O -swift-version 5 -target "$arch-apple-macos13.0" -o "$OUT/$NAME-$arch" "$HERE"/Sources/*.swift
done
lipo -create "$OUT/$NAME-arm64" "$OUT/$NAME-x86_64" -output "$APP/Contents/MacOS/$NAME"
rm "$OUT/$NAME-arm64" "$OUT/$NAME-x86_64"
cp "$HERE/Info.plist" "$APP/Contents/Info.plist"
"$HERE/sync-web.sh" "$APP/Contents/Resources/web" > /dev/null    # 场景文件装进程序包

echo "签名…"
if [[ "$SIGN_ID" == "-" ]]; then
  codesign --force --sign - "$APP"
else
  # 正式签名要开「强化运行时」，而它默认不许给别的程序发 Apple 事件——所以要带上授权文件
  codesign --force --options runtime --timestamp --entitlements "$HERE/DeskWorld.entitlements" --sign "$SIGN_ID" "$APP"
fi
codesign --verify --strict "$APP"

# 压缩时不带扩展属性：否则 zip 里会多出一堆 ._ 开头的文件，用命令行 unzip 解开后会破坏签名
pack() { rm -f "$ZIP"; ditto -c -k --norsrc --noextattr --keepParent "$APP" "$ZIP"; }
pack
if [[ -n "${DESKWORLD_NOTARY_PROFILE:-}" ]]; then
  echo "提交 Apple 公证…"
  xcrun notarytool submit "$ZIP" --keychain-profile "$DESKWORLD_NOTARY_PROFILE" --wait
  xcrun stapler staple "$APP"
  pack
fi

echo "完成：$ZIP"
echo "  架构：$(lipo -archs "$APP/Contents/MacOS/$NAME")    大小：$(du -h "$ZIP" | cut -f1)"
