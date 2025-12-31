#!/bin/bash
# 
# 启动 Remotion Studio 并加载指定课程
# 
# 使用方法：
#   pnpm remotion:course                     # 启动空白 Studio
#   pnpm remotion:course <courseId>          # 加载指定课程
#
# 示例：
#   pnpm remotion:course def4a9aa-b267-4d2b-b956-78fcac6c5d0b

COURSE_ID=$1
API_BASE=${NEXT_PUBLIC_APP_URL:-http://localhost:3000}
PROPS_FILE="public/remotion-course-data.json"

if [ -z "$COURSE_ID" ]; then
  echo "🎬 启动 Remotion Studio (示例模式)..."
  echo "💡 提示: 使用 'pnpm remotion:course <courseId>' 加载真实课程"
  echo ""
  
  # 清除之前的数据文件
  rm -f "$PROPS_FILE"
  
  pnpm remotion studio src/remotion/index.tsx
else
  echo "🎬 加载课程: $COURSE_ID"
  echo "📡 从 $API_BASE 获取数据..."
  
  # 获取课程数据并保存到 public 目录
  curl -s "$API_BASE/api/remotion/course/$COURSE_ID" > "$PROPS_FILE"
  
  if [ $? -ne 0 ] || [ ! -s "$PROPS_FILE" ]; then
    echo "❌ 无法获取课程数据"
    echo "   请确保:"
    echo "   1. Next.js 服务正在运行 (pnpm dev)"
    echo "   2. 课程 ID 正确"
    rm -f "$PROPS_FILE"
    exit 1
  fi
  
  # 检查是否有错误
  if grep -q '"error"' "$PROPS_FILE"; then
    echo "❌ API 返回错误:"
    cat "$PROPS_FILE"
    rm -f "$PROPS_FILE"
    exit 1
  fi
  
  echo "✅ 课程数据已保存到 $PROPS_FILE"
  
  # 提取幻灯片数量
  SLIDE_COUNT=$(grep -o '"slideCount":[0-9]*' "$PROPS_FILE" | grep -o '[0-9]*')
  DURATION=$(grep -o '"duration":[0-9]*' "$PROPS_FILE" | grep -o '[0-9]*')
  
  echo "📊 幻灯片: ${SLIDE_COUNT:-未知} 页"
  echo "⏱️  时长: $((DURATION / 1000 / 60)) 分钟"
  echo ""
  echo "🚀 启动 Remotion Studio..."
  echo "📁 数据文件: $PROPS_FILE"
  echo ""
  
  # 启动 Remotion Studio
  pnpm remotion studio src/remotion/index.tsx
fi
