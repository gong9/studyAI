# StudyAI

> 一站式 AI 内容数字化演示平台

让每份文档都转化为**专业级**的 AI 互动演示 —— 支持 PPT 自动生成、语音合成、1对1私教互动、视频导出。


## 适用场景

| 场景 | 说明 | 示例 |
|------|------|------|
| 💻 **技术培训** | 产品文档、技术手册，快速转化为 AI 培训课程 | 技术入门、产品功能、接口讲解 |
| 📋 **制度培训** | 规章制度、员工手册，合规培训一键生成 | 入职培训、安全规范、流程宣贯 |
| ⚖️ **普法讲座** | 法律条文转化为通俗易懂的科普讲座 | 劳动法、民法典、消费维权 |

## 核心功能

### 内容引擎

| 功能 | 描述 |
|------|------|
| 🗂️ 智能章节提取 | AI 自动识别文档目录结构 |
| 🎯 方案智能规划 | 自动生成培训目标与重难点 |
| 📝 手稿自动生成 | 基于文档生成结构化讲稿 |
| ✅ 智能审核优化 | AI 审核手稿给出修改建议 |

### 演示输出

| 功能 | 描述 |
|------|------|
| 🖼️ PPT 自动生成 | 一键生成精美演示课件（Slidev 驱动） |
| 🎙️ 语音合成 TTS | 真人级语音，多种音色可选 |
| 💬 1对1私教互动 | 随时打断提问，AI 即时解答 |
| 📤 课程导出分享 | 一键导出 MP4 高清视频，轻松分享传播 |

### 双模式演示

- **🟢 直播模式**: 1对1私教互动，随时打断提问，AI 实时应答
- **🎬 录播模式**: 一键生成高清演示视频，支持多平台导出分享

## 技术架构

```
文档上传 → AI 智能扫描 → 章节识别 → 培训大纲规划 → 讲稿生成 → PPT/视频输出
                                                          │
                          ┌───────────────────────────────┼───────────────────────────────┐
                          ▼                               ▼                               ▼
                    智能问答 (RAG)                   语音合成 (TTS)                  知识图谱 (LightRAG)
                          │                               │                               │
                   ┌──────┴──────┐                        │                               │
                   ▼             ▼                        ▼                               ▼
              向量检索      关键词检索              多音色朗读                      实体关系可视化
            (LlamaIndex)  (Meilisearch)           (真人级语音)                    (图谱可交互浏览)
```

### 底层 RAG 能力

- **文档管理**: 支持 PDF、DOCX、TXT、MD 等格式上传和索引
- **智能问答**: 基于知识库内容的精准上下文问答
- **混合搜索**: 向量检索 + 关键词检索，RRF 融合排序
- **知识图谱**: LightRAG 自动抽取实体关系，支持图谱可视化
- **Agentic RAG**: ReAct Agent 可自主选择工具进行多轮推理
- **上下文工程**: 智能记忆 + RAG 优化 + 语义压缩，最大化 Token 价值
- **RAG 评估系统**: 四维度 LLM Judge 自动评分，支持 SSE 实时进度推送

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 环境配置

创建 `.env` 文件：

```env
DATABASE_URL="file:./dev.db"
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key

# Qwen API (阿里云)
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxx
OPENAI_MODEL=qwen-turbo
OPENAI_API_BASE=https://dashscope.aliyuncs.com/compatible-mode/v1

# Meilisearch (可选，用于关键词搜索)
MEILISEARCH_HOST=http://localhost:7700
MEILISEARCH_API_KEY=your-master-key
```

### 3. 初始化数据库

```bash
npx prisma generate
npx prisma db push
```

### 4. 启动 Meilisearch (可选)

```bash
./deploy-meilisearch.sh
```

### 5. 启动开发环境

```bash
./dev.sh start

# 查看服务状态
./dev.sh status

# 停止所有服务
./dev.sh stop
```

启动后：
- 🌐 Next.js: http://localhost:3000
- 🕸️ LightRAG: http://localhost:8005/health

## 目录结构

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API 路由
│   │   ├── chat/          # 聊天接口
│   │   ├── documents/     # 文档处理
│   │   ├── eval/          # 评估系统接口
│   │   └── knowledge-bases/ # 知识库管理
│   ├── chat/[id]/         # 聊天页面
│   └── dashboard/         # 管理页面
├── components/            # React 组件
├── lib/                   # 核心库
│   ├── llm/              # LLM 服务 & Agentic RAG
│   ├── context/          # 上下文工程
│   ├── memory/           # 智能记忆系统
│   └── ...
├── lightrag-service/      # LightRAG Python 服务
```

## 许可证

MIT
