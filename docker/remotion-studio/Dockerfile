# Remotion Studio 服务 Dockerfile
# 
# 用于生产环境部署 Remotion Studio 编辑器服务
#
# 构建: docker build -t remotion-studio -f docker/remotion-studio/Dockerfile .
# 运行: docker run -p 3002:3002 -e API_BASE=http://host:3000 remotion-studio

FROM node:20-alpine AS base

# 安装必要的系统依赖
RUN apk add --no-cache libc6-compat curl

WORKDIR /app

# 安装 pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# 复制依赖文件
COPY package.json pnpm-lock.yaml ./

# 安装依赖
RUN pnpm install --frozen-lockfile

# 复制 Remotion 相关文件
COPY src/remotion ./src/remotion
COPY remotion.config.ts ./
COPY tsconfig.json ./

# 复制 public 目录（用于存放课程数据）
COPY public ./public

# 暴露端口
EXPOSE 3002

# 环境变量
ENV NODE_ENV=production
ENV REMOTION_PORT=3002

# 启动命令
CMD ["pnpm", "remotion", "studio", "src/remotion/index.tsx", "--port", "3002"]

