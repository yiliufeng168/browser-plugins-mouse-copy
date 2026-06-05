#!/bin/sh
# 从 main.user.js 中提取 ==UserScript== 元数据块，生成 main.meta.js。
# main.meta.js 是 @updateURL 的轻量目标，必须始终与 main.user.js 的头部保持一致，
# 因此由本脚本自动生成，请勿手工编辑。
set -e
ROOT="$(git rev-parse --show-toplevel)"
awk '
  /^\/\/ ==UserScript==$/      { p = 1 }
  p                            { print }
  /^\/\/ ==\/UserScript==$/    { exit }
' "$ROOT/main.user.js" > "$ROOT/main.meta.js"
