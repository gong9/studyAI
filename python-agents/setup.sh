#!/bin/bash

# Python Agents 环境设置脚本

set -e

echo "🚀 Setting up Python Agents environment..."

# 进入项目目录
cd "$(dirname "$0")"

# 检查 Python 版本
python_version=$(python3 --version 2>&1 | cut -d' ' -f2 | cut -d'.' -f1,2)
required_version="3.10"

if [[ "$(printf '%s\n' "$required_version" "$python_version" | sort -V | head -n1)" != "$required_version" ]]; then
    echo "❌ Python $required_version or higher is required. Found: $python_version"
    exit 1
fi

echo "✅ Python version: $python_version"

# 创建虚拟环境
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
fi

# 激活虚拟环境
source venv/bin/activate

# 安装依赖
echo "📦 Installing dependencies..."
pip install --upgrade pip
pip install -e .

# 创建 .env 文件（如果不存在）
if [ ! -f ".env" ]; then
    echo "📝 Creating .env file from template..."
    cat > .env << 'EOF'
# LLM 配置（使用 qwen/阿里云 OpenAI 兼容 API）
OPENAI_API_KEY=your-api-key
OPENAI_API_BASE=https://dashscope.aliyuncs.com/compatible-mode/v1
OPENAI_MODEL=qwen-plus

# Next.js 服务地址（用于调用 RAG API）
NEXTJS_URL=http://localhost:3000

# 内部 API 密钥（可选，用于服务间认证）
INTERNAL_API_KEY=

# 服务配置
HOST=0.0.0.0
PORT=8000
DEBUG=true
EOF
    echo "⚠️  Please edit .env file with your API keys"
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "To start the service:"
echo "  cd python-agents"
echo "  source venv/bin/activate"
echo "  python -m uvicorn src.main:app --reload --host 0.0.0.0 --port 8000"
echo ""
echo "Or simply run: ./start.sh"

