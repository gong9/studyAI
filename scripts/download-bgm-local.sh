#!/bin/bash
#
# 下载背景音乐到本地 public 目录
#
# 使用方法：
#   ./scripts/download-bgm-local.sh
#

set -e

# 目标目录
BGM_DIR="./public/audio/bgm"

# 颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🎵 下载背景音乐到本地${NC}"
echo ""

mkdir -p "$BGM_DIR"

# 音乐列表: "文件名|下载链接"
# 这些是 Pixabay 的免费音乐
MUSIC_LIST=(
  "calm-piano-01.mp3|https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3"
  "uplifting-ambient-01.mp3|https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3"
  "focused-lofi-01.mp3|https://cdn.pixabay.com/download/audio/2022/05/16/audio_a69d80dc5e.mp3"
  "tech-electronic-01.mp3|https://cdn.pixabay.com/download/audio/2022/03/10/audio_6f5c244814.mp3"
  "serious-orchestral-01.mp3|https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0c6ea0c50.mp3"
)

success_count=0
fail_count=0

for entry in "${MUSIC_LIST[@]}"; do
  IFS='|' read -r filename url <<< "$entry"
  filepath="$BGM_DIR/$filename"
  
  if [ -f "$filepath" ]; then
    echo -e "${YELLOW}已存在: $filename${NC}"
    ((success_count++))
    continue
  fi
  
  echo -n "下载: $filename ... "
  
  if curl -L -s -o "$filepath" "$url"; then
    if [ -s "$filepath" ]; then
      echo -e "${GREEN}✓${NC}"
      ((success_count++))
    else
      echo -e "失败 (空文件)"
      rm -f "$filepath"
      ((fail_count++))
    fi
  else
    echo -e "失败"
    ((fail_count++))
  fi
  
  sleep 0.5
done

echo ""
echo -e "${GREEN}完成！${NC} 成功: $success_count, 失败: $fail_count"
echo ""
echo "音乐文件位置: $BGM_DIR/"
echo ""

if [ $fail_count -gt 0 ]; then
  echo -e "${YELLOW}提示: 部分文件下载失败，可能需要代理访问 Pixabay${NC}"
  echo "你也可以手动从 https://pixabay.com/music/ 下载音乐"
fi

