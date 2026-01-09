# Python Teaching Agents

基于 DeepAgents 架构的教学课件生成服务。

## 核心特性

### 1. DeepAgents 编排能力

真正利用 DeepAgents 的核心能力：

- **write_todos**: 任务规划和进度追踪
- **task()**: 委托子 Agent 执行特定任务（上下文隔离）
- **文件系统**: 存储中间结果和最终输出
- **HITL**: Human-in-the-Loop 人工审核机制

### 2. 子 Agent 分工

| 子 Agent | 职责 | 输入 | 输出 |
|----------|------|------|------|
| planner | 教学规划 | 章节内容、场景类型 | JSON 教学规划 |
| writer | 手稿撰写 | 规划、RAG内容 | Markdown 手稿 |
| reviewer | 质量审核 | 手稿、规划 | 审核报告 |
| enricher | 内容润色 | 手稿、建议、补充 | 优化后手稿 |

### 3. HITL 人工审核

支持在关键节点暂停等待用户确认：

- `plan_review`: 规划审核
- `draft_review`: 手稿审核
- `final_approval`: 最终确认

## 快速开始

### 1. 安装依赖

```bash
cd python-agents
./setup.sh
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 填入 API Key
```

### 3. 启动服务

```bash
./start.sh
# 或
source .venv/bin/activate
uvicorn src.main:app --reload --port 8000
```

### 4. 统一启动（与 Next.js 一起）

```bash
# 在项目根目录
pnpm dev
```

## API 文档

启动后访问 http://localhost:8000/docs

### 核心端点

#### 单步执行

```bash
# 生成教学规划
POST /api/v1/teaching/plan
{
  "knowledge_base_id": "kb_xxx",
  "chapter_title": "第一章",
  "chapter_content": "...",
  "scene_type": "k12_teaching"
}

# 生成手稿
POST /api/v1/teaching/draft
{
  "knowledge_base_id": "kb_xxx",
  "plan": {...}
}

# 审核润色
POST /api/v1/teaching/enrich
{
  "knowledge_base_id": "kb_xxx",
  "draft_content": "...",
  "plan": {...}
}
```

#### 完整流水线

```bash
# 同步执行
POST /api/v1/teaching/pipeline
{
  "knowledge_base_id": "kb_xxx",
  "chapter_title": "第一章",
  "chapter_content": "...",
  "scene_type": "k12_teaching"
}

# SSE 流式执行
POST /api/v1/teaching/pipeline/stream
```

#### 会话管理

```bash
# 获取任务列表
GET /api/v1/teaching/session/{session_id}/todos

# 获取文件列表
GET /api/v1/teaching/session/{session_id}/files

# 获取文件内容
GET /api/v1/teaching/session/{session_id}/file?path=/drafts/xxx/plan.json
```

#### HITL 人工审核

```bash
# 配置 HITL
POST /api/v1/hitl/session/{session_id}/hitl/configure
{
  "enabled": true,
  "checkpoints": ["plan_review", "draft_review"],
  "timeout_seconds": 3600,
  "auto_approve_score": 8
}

# 获取待处理检查点
GET /api/v1/hitl/session/{session_id}/checkpoints

# 提交决策
POST /api/v1/hitl/session/{session_id}/checkpoint/resolve
{
  "checkpoint_id": "xxx",
  "decision": "approve",  // approve | edit | reject
  "feedback": "可选反馈",
  "edited_data": {}  // edit 时的修改数据
}
```

## 架构说明

```
┌─────────────────────────────────────────────────────────────┐
│                    TeachingAgent (主 Agent)                  │
│         使用 deepagents 编排，负责任务规划和委托               │
│                                                             │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────────┐ │
│  │write_todos│  │  task()  │  │  files  │  │  HITL Manager  │ │
│  │任务规划   │  │子Agent委托│  │文件系统  │  │  人工审核      │ │
│  └─────────┘  └─────────┘  └─────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│    planner       │ │     writer       │ │reviewer/enricher │
│   教学规划子Agent │ │  手稿撰写子Agent  │ │  审核润色子Agent  │
└──────────────────┘ └──────────────────┘ └──────────────────┘
          │                   │                   │
          └───────────────────┼───────────────────┘
                              ▼
                    ┌──────────────────┐
                    │   RAG Client     │
                    │ (调用 Next.js API)│
                    └──────────────────┘
```

## 工作流程

### 完整流水线

```
1. write_todos 创建任务计划
   ↓
2. task("planner") 生成教学规划
   ↓
3. [HITL] 规划审核（如启用）
   ↓
4. task("writer") + RAG 生成手稿
   ↓
5. task("reviewer") 审核手稿
   ↓
6. [HITL] 手稿审核（如启用）
   ↓
7. task("enricher") + RAG 润色补充
   ↓
8. 保存最终输出
```

### 文件存储结构

```
/tmp/teaching-agents/
├── drafts/
│   └── {knowledge_base_id}/
│       ├── plan.json           # 教学规划
│       ├── draft_v1.md         # 初稿
│       ├── review.json         # 审核结果
│       └── draft_v2.md         # 润色后
└── output/
    └── {knowledge_base_id}/
        └── manuscript.md       # 最终输出
```

## 场景类型

| scene_type | 适用场景 | 风格特点 |
|------------|----------|----------|
| k12_teaching | K12 教育 | 亲切、启发式、循序渐进 |
| tech_training | 技术培训 | 专业、代码示例、最佳实践 |
| company_training | 企业制度 | 严谨规范、条款引用 |
| legal_training | 普法讲座 | 通俗易懂、生活案例 |
| general | 通用 | 清晰专业 |

## 开发

### 运行测试

```bash
source .venv/bin/activate
pytest tests/ -v
```

### 代码结构

```
python-agents/
├── src/
│   ├── agents/
│   │   ├── teaching_agent.py  # 主 Agent
│   │   └── hitl.py            # HITL 机制
│   ├── prompts/
│   │   ├── teaching_planner.py
│   │   ├── manuscript_generator.py
│   │   └── reviewer.py
│   ├── routes/
│   │   ├── teaching.py        # 教学 API
│   │   └── hitl.py            # HITL API
│   ├── tools/
│   │   └── rag_client.py      # RAG 检索
│   ├── config.py
│   └── main.py
├── tests/
├── pyproject.toml
└── README.md
```

## 与 Next.js 集成

### 环境变量

在 Next.js 项目的 `.env` 中设置：

```env
USE_DEEPAGENTS=true
PYTHON_AGENT_URL=http://localhost:8000
```

### 调用方式

Next.js API 路由会根据 `USE_DEEPAGENTS` 环境变量决定：
- `true`: 代理请求到 Python Agent 服务
- `false`: 使用原有 TypeScript 实现
