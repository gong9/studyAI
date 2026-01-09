#!/bin/bash

# Python Agents 服务管理脚本
# 用于 pnpm dev 启动时同时运行 Python 服务

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PYTHON_AGENTS_DIR="$PROJECT_DIR/python-agents"
PID_FILE="$PROJECT_DIR/.python-agents.pid"
LOG_FILE="$PROJECT_DIR/logs/python-agents.log"

# 确保日志目录存在
mkdir -p "$PROJECT_DIR/logs"

# 关闭之前的 Python Agents 进程
cleanup() {
    echo "[Python Agents] 清理旧进程..."
    
    # 通过 PID 文件关闭
    if [ -f "$PID_FILE" ]; then
        pid=$(cat "$PID_FILE")
        if ps -p "$pid" > /dev/null 2>&1; then
            kill "$pid" 2>/dev/null
            echo "[Python Agents] 已关闭进程 PID: $pid"
        fi
        rm -f "$PID_FILE"
    fi
    
    # 关闭所有 python-agents 相关进程
    pkill -f "python-agents/src/main" 2>/dev/null
    pkill -f "uvicorn src.main:app" 2>/dev/null
    
    # 等待进程完全退出
    sleep 1
}

# 启动 Python Agents 服务
start() {
    # 先清理旧进程
    cleanup
    
    echo "[Python Agents] 启动服务..."
    
    cd "$PYTHON_AGENTS_DIR"
    
    # 检查是否有 uv
    if command -v uv &> /dev/null; then
        echo "[Python Agents] 使用 uv 管理环境..."
        
        # uv 会自动创建 .venv 并安装正确的 Python 版本
        if [ ! -d ".venv" ]; then
            echo "[Python Agents] 创建虚拟环境 (Python 3.11+)..."
            uv venv --python 3.11
        fi
        
        # 安装依赖
        if ! uv run python -c "import fastapi" 2>/dev/null; then
            echo "[Python Agents] 安装依赖..."
            uv pip install .
            echo "[Python Agents] ✓ 依赖安装完成"
        fi
        
        USE_UV=true
    else
        echo "[Python Agents] 使用 pip 管理环境..."
        
        # 检查虚拟环境
        if [ ! -d "venv" ]; then
            echo "[Python Agents] 创建虚拟环境..."
            python3 -m venv venv
        fi
        
        source venv/bin/activate
        
        # 检查依赖是否已安装
        if ! python -c "import fastapi" 2>/dev/null; then
            echo "[Python Agents] 安装依赖..."
            pip install --upgrade pip -q
            pip install . -q
            echo "[Python Agents] ✓ 依赖安装完成"
        fi
        
        USE_UV=false
    fi
    
    # 检查 .env 文件，如果不存在则从项目根目录复制相关变量
    if [ ! -f ".env" ]; then
        echo "[Python Agents] 创建 .env 文件..."
        if [ -f "$PROJECT_DIR/.env" ]; then
            # 从根目录 .env 提取需要的变量
            grep -E "^(OPENAI_API_KEY|OPENAI_BASE_URL|OPENAI_MODEL|USE_DEEPAGENTS)" "$PROJECT_DIR/.env" > .env 2>/dev/null || true
            # 添加默认配置
            echo "" >> .env
            echo "# Python Agents 配置" >> .env
            echo "RAG_SERVICE_URL=http://localhost:3000" >> .env
            echo "[Python Agents] ✓ 已从项目 .env 创建配置"
        else
            # 创建模板
            cat > .env << 'EOF'
# OpenAI API 配置
OPENAI_API_KEY=your-api-key
OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
OPENAI_MODEL=qwen-plus

# RAG 服务地址
RAG_SERVICE_URL=http://localhost:3000
EOF
            echo "[Python Agents] ⚠️  已创建 .env 模板，请配置 OPENAI_API_KEY"
        fi
    fi
    
    # 启动服务（前台运行，输出到终端）
    echo "[Python Agents] 服务地址: http://localhost:8000"
    echo "[Python Agents] API 文档: http://localhost:8000/docs"
    echo ""
    
    # 使用 exec 替换当前进程，这样 Ctrl+C 可以正常终止
    if [ "$USE_UV" = true ]; then
        exec uv run uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload
    else
        exec python -m uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload
    fi
}

# 停止服务
stop() {
    cleanup
    echo "[Python Agents] 服务已停止"
}

# 主命令
case "$1" in
    start)
        start
        ;;
    stop)
        stop
        ;;
    cleanup)
        cleanup
        ;;
    *)
        start
        ;;
esac

