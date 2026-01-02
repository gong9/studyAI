#!/bin/bash
#
# 背景音乐资源自动化设置脚本
#
# 功能：
# 1. 下载 Pixabay 免费音乐
# 2. 生成 music-library.json 元数据
# 3. 创建 GitHub Release 并上传
#
# 使用方法：
#   ./scripts/setup-bgm.sh download   # 下载音乐
#   ./scripts/setup-bgm.sh generate   # 生成元数据
#   ./scripts/setup-bgm.sh upload     # 上传到 GitHub
#   ./scripts/setup-bgm.sh all        # 执行全部步骤

set -e

# ==================== 配置 ====================

# 脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 音乐存储目录
BGM_DIR="./bgm-resources"

# 音乐列表配置文件
MUSIC_LIST_FILE="${SCRIPT_DIR}/bgm-music-list.txt"

# GitHub 仓库配置
GITHUB_USER="${GITHUB_USER:-gongzhen}"
GITHUB_REPO="${GITHUB_REPO:-studyAI-bgm}"
RELEASE_TAG="bgm-v1"

# 从配置文件读取音乐列表
MUSIC_LIST=()
load_music_list() {
  if [ -f "$MUSIC_LIST_FILE" ]; then
    while IFS= read -r line || [ -n "$line" ]; do
      # 跳过空行和注释
      [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
      MUSIC_LIST+=("$line")
    done < "$MUSIC_LIST_FILE"
    log_info "从配置文件加载了 ${#MUSIC_LIST[@]} 首音乐"
  else
    log_warn "未找到配置文件: $MUSIC_LIST_FILE"
    log_info "使用默认音乐列表"
    # 默认列表
    MUSIC_LIST=(
      "calm-piano-01|晨光微熹|calm,focused|slow|piano|teaching,intro|https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3"
      "uplifting-ambient-01|启程|uplifting,inspiring|medium|ambient|teaching,tech|https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3"
      "focused-lofi-01|深夜咖啡|focused,relaxed|slow|lofi|teaching,tech|https://cdn.pixabay.com/download/audio/2022/05/16/audio_a69d80dc5e.mp3"
      "tech-electronic-01|数字世界|focused,uplifting|medium|electronic|tech,business|https://cdn.pixabay.com/download/audio/2022/03/10/audio_6f5c244814.mp3"
      "serious-orchestral-01|庄严时刻|serious,inspiring|slow|orchestral|law,business|https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0c6ea0c50.mp3"
    )
  fi
}

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ==================== 函数定义 ====================

log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

# 下载音乐
download_music() {
  log_info "开始下载背景音乐..."
  
  mkdir -p "$BGM_DIR"
  
  local success_count=0
  local fail_count=0
  
  for entry in "${MUSIC_LIST[@]}"; do
    IFS='|' read -r filename name mood tempo genre scenes url <<< "$entry"
    
    local filepath="$BGM_DIR/${filename}.mp3"
    
    if [ -f "$filepath" ]; then
      log_warn "已存在: ${filename}.mp3，跳过"
      ((success_count++))
      continue
    fi
    
    log_info "下载: $name (${filename}.mp3)"
    
    if curl -L -s -o "$filepath" "$url"; then
      # 检查文件是否有效
      if [ -s "$filepath" ]; then
        log_success "下载成功: ${filename}.mp3"
        ((success_count++))
      else
        log_error "下载失败: ${filename}.mp3 (文件为空)"
        rm -f "$filepath"
        ((fail_count++))
      fi
    else
      log_error "下载失败: ${filename}.mp3"
      ((fail_count++))
    fi
    
    # 避免请求过快
    sleep 1
  done
  
  echo ""
  log_info "下载完成: 成功 $success_count, 失败 $fail_count"
  
  if [ $fail_count -gt 0 ]; then
    log_warn "部分音乐下载失败，请检查链接或手动下载"
    log_info "你可以从 https://pixabay.com/music/ 搜索并获取新的下载链接"
  fi
}

# 生成元数据 JSON
generate_metadata() {
  log_info "生成 music-library.json..."
  
  local json_file="$BGM_DIR/music-library.json"
  local today=$(date +%Y-%m-%d)
  
  # 开始 JSON
  cat > "$json_file" << EOF
{
  "version": "1.0.0",
  "updatedAt": "$today",
  "tracks": [
EOF

  local first=true
  
  for entry in "${MUSIC_LIST[@]}"; do
    IFS='|' read -r filename name mood tempo genre scenes url <<< "$entry"
    
    local filepath="$BGM_DIR/${filename}.mp3"
    
    # 检查文件是否存在
    if [ ! -f "$filepath" ]; then
      log_warn "文件不存在，跳过: ${filename}.mp3"
      continue
    fi
    
    # 获取音频时长（需要 ffprobe）
    local duration=180
    if command -v ffprobe &> /dev/null; then
      duration=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$filepath" 2>/dev/null | cut -d. -f1)
      if [ -z "$duration" ] || [ "$duration" = "N/A" ]; then
        duration=180
      fi
    fi
    
    # 转换 mood 和 scenes 为 JSON 数组
    local mood_array=$(echo "$mood" | sed 's/,/", "/g')
    local scenes_array=$(echo "$scenes" | sed 's/,/", "/g')
    
    # 生成颜色（基于类型）
    local color="#6366f1"
    case "$genre" in
      piano) color="#64B5F6" ;;
      ambient) color="#81C784" ;;
      lofi) color="#BA68C8" ;;
      electronic) color="#4DD0E1" ;;
      orchestral) color="#FFB74D" ;;
    esac
    
    # 添加逗号（非首个元素）
    if [ "$first" = true ]; then
      first=false
    else
      echo "," >> "$json_file"
    fi
    
    # 写入 track 对象
    cat >> "$json_file" << EOF
    {
      "id": "$filename",
      "name": "$name",
      "duration": $duration,
      "filename": "${filename}.mp3",
      "mood": ["$mood_array"],
      "tempo": "$tempo",
      "genre": "$genre",
      "scenes": ["$scenes_array"],
      "color": "$color"
    }
EOF
  done

  # 结束 JSON
  cat >> "$json_file" << EOF

  ]
}
EOF

  log_success "生成完成: $json_file"
  
  # 验证 JSON
  if command -v jq &> /dev/null; then
    if jq empty "$json_file" 2>/dev/null; then
      log_success "JSON 格式验证通过"
    else
      log_error "JSON 格式错误，请检查"
    fi
  fi
}

# 上传到 GitHub Release
upload_to_github() {
  log_info "准备上传到 GitHub Release..."
  
  # 检查 gh CLI
  if ! command -v gh &> /dev/null; then
    log_error "请先安装 GitHub CLI: brew install gh"
    log_info "安装后运行: gh auth login"
    exit 1
  fi
  
  # 检查登录状态
  if ! gh auth status &> /dev/null; then
    log_error "请先登录 GitHub: gh auth login"
    exit 1
  fi
  
  # 检查仓库是否存在
  if ! gh repo view "$GITHUB_USER/$GITHUB_REPO" &> /dev/null; then
    log_info "创建新仓库: $GITHUB_USER/$GITHUB_REPO"
    gh repo create "$GITHUB_REPO" --public --description "StudyAI 背景音乐资源" || {
      log_error "创建仓库失败"
      exit 1
    }
  fi
  
  # 检查 Release 是否存在
  if gh release view "$RELEASE_TAG" --repo "$GITHUB_USER/$GITHUB_REPO" &> /dev/null; then
    log_warn "Release $RELEASE_TAG 已存在，将删除重建"
    gh release delete "$RELEASE_TAG" --repo "$GITHUB_USER/$GITHUB_REPO" --yes || true
  fi
  
  # 创建 Release
  log_info "创建 Release: $RELEASE_TAG"
  gh release create "$RELEASE_TAG" \
    --repo "$GITHUB_USER/$GITHUB_REPO" \
    --title "背景音乐资源 v1" \
    --notes "StudyAI 智能背景音乐推荐系统使用的音乐资源

## 包含内容
- 10 首免费可商用的背景音乐
- music-library.json 元数据文件

## 音乐分类
- 平静钢琴 (2首)
- 励志环境 (2首)
- 专注 Lo-Fi (2首)
- 科技电子 (2首)
- 庄重管弦 (2首)

## 使用方式
配置环境变量:
\`\`\`
NEXT_PUBLIC_MUSIC_CDN_BASE=https://cdn.jsdelivr.net/gh/$GITHUB_USER/$GITHUB_REPO@$RELEASE_TAG
\`\`\`
"
  
  # 上传文件
  log_info "上传音乐文件..."
  
  for file in "$BGM_DIR"/*.mp3 "$BGM_DIR"/music-library.json; do
    if [ -f "$file" ]; then
      local filename=$(basename "$file")
      log_info "上传: $filename"
      gh release upload "$RELEASE_TAG" "$file" \
        --repo "$GITHUB_USER/$GITHUB_REPO" \
        --clobber || log_warn "上传失败: $filename"
    fi
  done
  
  log_success "上传完成！"
  echo ""
  log_info "CDN 地址: https://cdn.jsdelivr.net/gh/$GITHUB_USER/$GITHUB_REPO@$RELEASE_TAG/"
  log_info "请在 .env 中添加:"
  echo ""
  echo "  NEXT_PUBLIC_MUSIC_CDN_BASE=https://cdn.jsdelivr.net/gh/$GITHUB_USER/$GITHUB_REPO@$RELEASE_TAG"
  echo ""
}

# 显示帮助
show_help() {
  echo "🎵 背景音乐资源自动化设置脚本"
  echo ""
  echo "用法: $0 <command>"
  echo ""
  echo "命令:"
  echo "  download    下载音乐文件到 ./bgm-resources/"
  echo "  generate    生成 music-library.json 元数据"
  echo "  upload      上传到 GitHub Release (需要 gh CLI)"
  echo "  all         执行全部步骤 (推荐)"
  echo "  list        显示音乐列表"
  echo "  help        显示帮助"
  echo ""
  echo "配置文件:"
  echo "  scripts/bgm-music-list.txt  音乐列表配置"
  echo ""
  echo "环境变量:"
  echo "  GITHUB_USER   GitHub 用户名 (默认: gongzhen)"
  echo "  GITHUB_REPO   GitHub 仓库名 (默认: studyAI-bgm)"
  echo ""
  echo "前置要求:"
  echo "  - curl       下载音乐文件"
  echo "  - gh         GitHub CLI (用于上传)"
  echo "  - ffprobe    获取音频时长 (可选)"
  echo ""
  echo "示例:"
  echo "  ./scripts/setup-bgm.sh all                     # 一键完成全部步骤"
  echo "  ./scripts/setup-bgm.sh download                # 只下载音乐"
  echo "  GITHUB_USER=myname ./scripts/setup-bgm.sh all  # 使用自定义用户名"
  echo ""
  echo "自定义音乐:"
  echo "  编辑 scripts/bgm-music-list.txt 添加或修改音乐"
  echo "  从 https://pixabay.com/music/ 获取下载链接"
}

# 显示音乐列表
list_music() {
  echo "预配置的背景音乐列表:"
  echo ""
  printf "%-25s %-15s %-10s %-12s %-15s\n" "ID" "名称" "类型" "节奏" "情绪"
  echo "--------------------------------------------------------------------------------"
  
  for entry in "${MUSIC_LIST[@]}"; do
    IFS='|' read -r filename name mood tempo genre scenes url <<< "$entry"
    printf "%-25s %-15s %-10s %-12s %-15s\n" "$filename" "$name" "$genre" "$tempo" "$mood"
  done
  
  echo ""
  echo "共 ${#MUSIC_LIST[@]} 首音乐"
}

# ==================== 主程序 ====================

# 先加载音乐列表
load_music_list

case "${1:-help}" in
  download)
    download_music
    ;;
  generate)
    generate_metadata
    ;;
  upload)
    upload_to_github
    ;;
  all)
    download_music
    echo ""
    generate_metadata
    echo ""
    upload_to_github
    ;;
  list)
    list_music
    ;;
  help|*)
    show_help
    ;;
esac

