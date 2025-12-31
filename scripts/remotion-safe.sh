#!/bin/bash

# Remotion Studio 安全启动脚本
# 🔒 不加载 .env 文件，避免敏感信息泄露

# 端口配置
REMOTION_PORT=${REMOTION_PORT:-3002}

# 创建临时空 .env 文件来覆盖真实的 .env
TEMP_ENV=$(mktemp)
echo "# Empty env file for Remotion Studio security" > "$TEMP_ENV"

# 清除所有敏感的 API 环境变量
unset MEILISEARCH_HOST
unset MEILISEARCH_API_KEY
unset NANO_BANANA_KEY
unset MINIMAX_API_KEY
unset BANANA_API_KEY
unset BANANA_API_BASE
unset BANANA_IMAGE_MODEL
unset OPENAI_API_KEY
unset DATABASE_URL
unset NEXTAUTH_SECRET
unset AIHUBMIX_API_KEY
unset LIGHTRAG_INDEX_DELAY
unset LIGHTRAG_LLM_CONCURRENCY
unset STORAGE_DIR

# 使用 npx 直接调用 remotion，并指定空的 env-file
exec npx remotion studio src/remotion/index.tsx --port "$REMOTION_PORT" --env-file="$TEMP_ENV"

