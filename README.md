# 📚 StudyAI

<p align="center">
  <strong>一站式 AI 内容数字化演示平台</strong>
</p>

<p align="center">
  让每份文档都转化为<b>专业级</b>的 AI 互动演示<br/>
  智能讲稿生成 · 语音合成 · 1对1私教互动 · 高清视频导出
</p>

---

## ✨ 核心亮点

| 🎯 一键生成 | 🎙️ 真人语音 | 💬 智能互动 | 🎬 视频导出 |
|:-----------:|:-----------:|:-----------:|:-----------:|
| 上传文档即可生成专业培训内容 | 多音色 TTS，支持声音克隆 | 1对1私教，随时打断提问 | 一键导出 MP4 高清视频 |

## 🎬 功能演示

<table>
  <tr>
  </tr>
  <tr>
    <td align="center">📂 文档管理与智能扫描</td>
    <td align="center">📑 章节目录自动提取</td>
  </tr>
  <tr>
  </tr>
  <tr>
    <td align="center">✏️ 讲稿编辑与审核优化</td>
    <td align="center">🎥 视频预览与导出</td>
  </tr>
</table>

## 🎯 适用场景

| 场景 | 说明 | 示例 |
|------|------|------|
| 💻 **技术培训** | 产品文档、技术手册，快速转化为 AI 培训课程 | SDK 教程、API 讲解、新员工技术入门 |
| 📋 **制度培训** | 规章制度、员工手册，合规培训一键生成 | 入职培训、安全规范、流程宣贯 |
| ⚖️ **普法讲座** | 法律条文转化为通俗易懂的科普讲座 | 劳动法、民法典、消费维权 |

## 🔥 核心功能

### 📖 智能内容引擎

```
文档上传 → 智能扫描 → 章节识别 → 知识图谱构建 → 讲稿生成 → 审核优化
```

| 功能 | 描述 |
|------|------|
| 🔍 **智能扫描** | AI 自动识别文档目录结构，支持 PDF/DOCX/TXT/MD |
| 📊 **知识图谱** | LightRAG 抽取实体关系，可视化知识网络 |
| 📝 **讲稿生成** | 基于文档生成结构化讲稿，可手动编辑优化 |
| ✅ **智能审核** | AI 审核讲稿，给出修改建议，一键优化 |

### 🎤 演示输出

| 功能 | 描述 |
|------|------|
| 🖼️ **PPT 生成** | 一键生成精美演示课件（Slidev 驱动） |
| 🎙️ **语音合成** | 真人级语音，多种音色可选，支持声音克隆 |
| 🎵 **背景音乐** | AI 智能推荐 / MiniMax 自动生成配乐 |
| 📤 **视频导出** | Remotion 渲染高清视频，支持自定义分辨率和帧率 |

### 🎓 双模式演示

| 模式 | 特点 |
|------|------|
| 🟢 **直播模式** | 1对1私教互动，随时打断提问，AI 实时解答 |
| 🎬 **录播模式** | 一键生成高清演示视频，支持多平台分享 |

### 🧠 RAG 智能问答

```
用户提问 → 意图分析 → 混合检索 → 上下文优化 → LLM 推理 → 精准回答
              │             │              │            │
              ▼             ▼              ▼            ▼
          多轮记忆     向量+关键词      语义压缩    工具调用
```

| 能力 | 描述 |
|------|------|
| 🔎 **混合检索** | 向量检索 + Meilisearch 关键词检索，RRF 融合排序 |
| 🕸️ **知识图谱** | LightRAG 实体关系抽取，图谱可视化浏览 |
| 🤖 **Agentic RAG** | ReAct Agent 可自主选择工具进行多轮推理 |
| 💾 **智能记忆** | 自动提取关键信息，按重要性排序记忆 |
| 🗜️ **上下文压缩** | 语义压缩冗余信息，最大化 Token 利用率 |

## 🏗️ 技术架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Frontend (Next.js 14)                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │  Dashboard  │  │   Editor    │  │  Presenter  │  │   Player    │ │
│  │  (React 18) │  │  (Tiptap)   │  │  (Remotion) │  │  (Remotion) │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        API Layer (Next.js API Routes)                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐│
│  │ Document │  │ Teaching │  │   Chat   │  │ Remotion │  │  TTS   ││
│  │   API    │  │   API    │  │   API    │  │   API    │  │  API   ││
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └────────┘│
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          Core Services                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │ LlamaIndex  │  │  LightRAG   │  │ Meilisearch │  │   Prisma    │ │
│  │ (向量检索)  │  │ (知识图谱)  │  │ (关键词)    │  │   (ORM)     │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘ │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │  Remotion   │  │   Slidev    │  │  阿里云TTS  │  │   FFmpeg    │ │
│  │ (视频渲染)  │  │   (PPT)     │  │  (语音合成) │  │  (音视频)   │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           LLM Backend                                │
│              Qwen / GPT / DeepSeek (OpenAI Compatible)               │
└─────────────────────────────────────────────────────────────────────┘
```

## 🚀 快速开始

### 环境要求

- Node.js 18+
- pnpm 8+
- Python 3.10+ (LightRAG 服务)
- FFmpeg (视频渲染)

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

# LLM API (OpenAI 兼容格式)
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxx
OPENAI_MODEL=qwen-turbo
OPENAI_API_BASE=https://dashscope.aliyuncs.com/compatible-mode/v1

# TTS 语音合成 (阿里云)
DASHSCOPE_API_KEY=sk-xxxxxxxxxxxxxxxxxxxx

# Meilisearch (可选，用于关键词搜索)
MEILISEARCH_HOST=http://localhost:7700
MEILISEARCH_API_KEY=your-master-key
```

### 3. 初始化数据库

```bash
npx prisma generate
npx prisma db push
```

### 4. 启动服务

**方式一：一键启动（推荐）**

```bash
./dev.sh start     # 启动所有服务
./dev.sh status    # 查看服务状态
./dev.sh stop      # 停止所有服务
```

**方式二：单独启动**

```bash
# 启动 Next.js
pnpm dev

# 启动 Meilisearch（可选）
./deploy-meilisearch.sh

# 启动 LightRAG 服务（可选，用于知识图谱）
cd lightrag-service && python main.py
```

启动后访问：
- 🌐 **Web 应用**: http://localhost:3000
- 🕸️ **LightRAG API**: http://localhost:8005/health
- 🔍 **Meilisearch**: http://localhost:7700

## 📁 目录结构

```
src/
├── app/                          # Next.js App Router
│   ├── api/                      # API 路由
│   │   ├── chat/                 # 聊天接口
│   │   ├── documents/            # 文档处理
│   │   ├── teaching/             # 培训系统接口
│   │   │   ├── lecture/          # 直播讲座 API
│   │   │   ├── manuscript/       # 讲稿管理 API
│   │   │   └── music/            # 背景音乐 API
│   │   ├── remotion/             # 视频渲染接口
│   │   ├── tts/                  # 语音合成接口
│   │   └── knowledge-bases/      # 知识库管理
│   ├── dashboard/                # 管理页面
│   │   ├── teaching/             # 培训项目管理
│   │   ├── codebase/             # 代码库分析
│   │   ├── legal/                # 普法讲座
│   │   └── eval/                 # RAG 评估
│   └── chat/                     # 问答页面
├── components/                   # React 组件
│   ├── teaching/                 # 培训相关组件
│   └── ui/                       # 通用 UI 组件
├── lib/                          # 核心库
│   ├── book-understanding/       # 书籍理解四阶段
│   │   ├── stage1-skim/          # 快速浏览
│   │   ├── stage2-kg/            # 知识图谱构建
│   │   ├── stage3-deep-read/     # 深度阅读
│   │   └── stage4-output/        # 输出生成
│   ├── teaching/                 # 教学系统
│   │   ├── agents/               # AI Agent（讲稿生成、审核等）
│   │   ├── lecture/              # 直播讲座 Agent
│   │   ├── music/                # 背景音乐服务
│   │   └── remotion/             # 视频渲染逻辑
│   ├── llm/                      # LLM 服务
│   │   ├── agent.ts              # Agentic RAG
│   │   └── tools/                # Agent 工具集
│   ├── context/                  # 上下文工程
│   │   ├── intent/               # 意图分析
│   │   ├── rag/                  # RAG 优化
│   │   └── optimizer/            # 上下文压缩
│   ├── memory/                   # 智能记忆系统
│   └── github/                   # 代码库分析
├── remotion/                     # Remotion 视频组件
│   ├── compositions/             # 视频合成器
│   └── templates/                # 幻灯片模板
└── types/                        # TypeScript 类型定义

lightrag-service/                 # LightRAG Python 服务
```

## 🛠️ 技术栈

| 类别 | 技术 |
|------|------|
| **前端** | Next.js 14, React 18, Tailwind CSS, Tiptap, Remotion Player |
| **后端** | Next.js API Routes, Prisma, WebSocket |
| **LLM** | LlamaIndex, OpenAI API (兼容 Qwen/DeepSeek) |
| **检索** | Meilisearch (全文检索), LlamaIndex (向量检索) |
| **知识图谱** | LightRAG |
| **语音** | 阿里云 TTS, 声音克隆 |
| **视频** | Remotion, FFmpeg |
| **PPT** | Slidev, PPTXGenJS |
| **数据库** | SQLite (Prisma ORM) |

## 📜 许可证

MIT License

---

<p align="center">
  Made with ❤️ by StudyAI Team
</p>
