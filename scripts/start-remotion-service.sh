#!/bin/bash
# 
# 启动 Remotion Studio 服务（后台模式）
# 
# 用于生产环境部署，作为独立服务运行
# 
# 使用方法：
#   ./scripts/start-remotion-service.sh        # 启动服务
#   ./scripts/start-remotion-service.sh stop   # 停止服务
#   ./scripts/start-remotion-service.sh status # 查看状态

ACTION=${1:-start}
PORT=${REMOTION_PORT:-3002}
PID_FILE=".remotion-studio.pid"
LOG_FILE="logs/remotion-studio.log"

# 确保 logs 目录存在
mkdir -p logs

case $ACTION in
  start)
    if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
      echo "⚠️  Remotion Studio 已在运行 (PID: $(cat $PID_FILE))"
      echo "   访问: http://localhost:$PORT"
      exit 0
    fi
    
    echo "🎬 启动 Remotion Studio 服务..."
    echo "   端口: $PORT"
    echo "   日志: $LOG_FILE"
    
    # 后台启动 Remotion Studio
    nohup pnpm remotion studio src/remotion/index.tsx --port $PORT > "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
    
    # 等待服务启动
    sleep 3
    
    if kill -0 $(cat "$PID_FILE") 2>/dev/null; then
      echo "✅ Remotion Studio 已启动"
      echo "   访问: http://localhost:$PORT"
      echo "   PID: $(cat $PID_FILE)"
    else
      echo "❌ 启动失败，请查看日志: $LOG_FILE"
      rm -f "$PID_FILE"
      exit 1
    fi
    ;;
    
  stop)
    if [ -f "$PID_FILE" ]; then
      PID=$(cat "$PID_FILE")
      if kill -0 $PID 2>/dev/null; then
        echo "🛑 停止 Remotion Studio (PID: $PID)..."
        kill $PID
        rm -f "$PID_FILE"
        echo "✅ 已停止"
      else
        echo "⚠️  进程不存在，清理 PID 文件"
        rm -f "$PID_FILE"
      fi
    else
      echo "⚠️  Remotion Studio 未运行"
    fi
    ;;
    
  status)
    if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
      echo "✅ Remotion Studio 运行中"
      echo "   PID: $(cat $PID_FILE)"
      echo "   端口: $PORT"
      echo "   访问: http://localhost:$PORT"
    else
      echo "❌ Remotion Studio 未运行"
    fi
    ;;
    
  restart)
    $0 stop
    sleep 2
    $0 start
    ;;
    
  *)
    echo "用法: $0 {start|stop|status|restart}"
    exit 1
    ;;
esac

