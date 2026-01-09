#!/bin/bash

# 启动 Teaching Agents 服务

# 进入项目目录
cd "$(dirname "$0")"

# 激活虚拟环境（如果存在）
if [ -d "venv" ]; then
    source venv/bin/activate
fi

# 启动服务
python -m uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload

