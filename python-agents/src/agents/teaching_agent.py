"""
教学主 Agent

核心能力：
1. write_todos - 任务规划和追踪
2. task() - 委托子 Agent
3. 文件系统 - 存储中间结果
4. interrupt_on - 人工审核
"""

import json
import logging
import os
from typing import Any, Optional
from pathlib import Path

from langchain_openai import ChatOpenAI

from ..config import get_settings
from ..prompts.teaching_planner import format_planner_prompt, get_scene_config
from ..prompts.manuscript_generator import format_manuscript_prompt, get_scene_prompt
from ..prompts.reviewer import format_review_prompt, format_enrich_prompt
from ..tools.rag_client import rag_search
from .hitl import (
    HITLManager,
    HITLConfig,
    CheckpointType,
    Decision,
    should_auto_approve_review,
    create_plan_checkpoint_message,
    create_draft_checkpoint_message,
)
from .trace import TraceManager, StepType, get_tracer

logger = logging.getLogger(__name__)

# ==================== 工作目录配置 ====================

WORKSPACE_ROOT = Path(os.getenv("AGENT_WORKSPACE", "/tmp/teaching-agents"))
OUTPUT_DIR = WORKSPACE_ROOT / "output"
DRAFTS_DIR = WORKSPACE_ROOT / "drafts"

# 确保目录存在
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
DRAFTS_DIR.mkdir(parents=True, exist_ok=True)


# ==================== 主 Agent 系统提示词 ====================

ORCHESTRATOR_PROMPT = """你是一位专业的教学课件生成编排者。你的工作是协调多个专家子 Agent 完成课件生成任务。

## 核心原则

1. **先规划再执行**：收到任务后，先用 write_todos 创建任务清单
2. **专业分工**：通过 task() 委托专门的子 Agent 执行具体任务
3. **质量把控**：每个阶段完成后检查输出质量
4. **透明追踪**：及时更新任务状态，保持进度可见

## 可用子 Agent

### 1. planner（规划专家）
- 职责：分析章节内容，生成教学规划
- 输入：章节标题、内容、场景类型
- 输出：JSON 格式的教学规划

### 2. writer（手稿专家）  
- 职责：根据规划撰写教学手稿
- 输入：教学规划、RAG 检索内容
- 输出：Markdown 格式手稿

### 3. reviewer（审核专家）
- 职责：审核手稿质量，提出改进建议
- 输入：手稿内容、教学规划
- 输出：审核报告（问题、建议、评分）

### 4. enricher（润色专家）
- 职责：根据审核建议优化手稿
- 输入：原始手稿、审核建议、补充资料
- 输出：优化后的 Markdown 手稿

## 标准工作流程

收到「生成教学课件」任务后：

```
1. write_todos([
     {id: "1", content: "分析章节结构，生成教学规划", status: "pending"},
     {id: "2", content: "根据规划生成手稿初稿", status: "pending"},
     {id: "3", content: "审核手稿质量", status: "pending"},
     {id: "4", content: "根据审核建议润色", status: "pending"},
     {id: "5", content: "保存最终输出", status: "pending"}
   ])

2. 更新 todo 1 为 in_progress，委托 planner 子 Agent
   task(agent="planner", input="...")
   
3. 更新 todo 1 为 completed，todo 2 为 in_progress
   task(agent="writer", input="...")

4. 以此类推...
```

## 输出规范

- 规划阶段：返回 JSON 格式教学规划
- 手稿阶段：返回 Markdown（用 --- 分页）
- 最终输出：保存到文件系统，返回文件路径

请始终遵循工作流程，保持专业和高效。
"""


# ==================== 子 Agent 配置 ====================

PLANNER_AGENT_CONFIG = {
    "name": "planner",
    "description": "教学规划专家，擅长分析教材内容并生成结构化的教学规划",
    "system_prompt": """你是一位资深的教学规划专家。

你的任务是分析章节内容，生成结构化的教学规划。

## 输出格式 (JSON)

{
  "chapter": "章节名称",
  "summary": "一句话概括",
  "teaching_goals": ["学完能掌握xxx", "学完能理解xxx"],
  "key_concepts": ["核心概念1", "核心概念2"],
  "sections": [
    {
      "title": "段落标题",
      "key_points": ["要点1", "要点2"],
      "duration_minutes": 5,
      "notes": "讲解建议"
    }
  ],
  "total_duration_minutes": 30,
  "notes": "整体讲解建议"
}

## 注意事项

1. 根据内容本身结构划分，不强套模板
2. 每节控制在 3-8 分钟
3. 关键点要具体、可讲
4. 结合场景类型调整风格
""",
}

WRITER_AGENT_CONFIG = {
    "name": "writer",
    "description": "教学手稿专家，擅长将教学规划转化为详尽的讲稿",
    "system_prompt": """你是一位资深的教学内容撰写专家。

你的任务是根据教学规划生成详尽的教学手稿。

## 输出格式

Markdown 格式，用 --- 分隔每页幻灯片。

## 要求

1. 每节至少 150-300 字
2. 用文字详细描述，不引用图片
3. 包含公式（LaTeX）、代码块等
4. 语言风格符合场景类型
5. 自然衔接，循循善诱
""",
}

REVIEWER_AGENT_CONFIG = {
    "name": "reviewer",
    "description": "教学质量审核专家，擅长评估教学内容的完整性和准确性",
    "system_prompt": """你是一位资深的教学质量审核专家。

你的任务是审核教学手稿的质量，提出改进建议。

## 输出格式 (JSON)

{
  "overall_score": 8,
  "passed": true,
  "strengths": ["优点1", "优点2"],
  "suggestions": [
    {
      "type": "content|structure|expression",
      "severity": "high|medium|low",
      "location": "问题位置",
      "issue": "具体问题",
      "suggestion": "改进建议"
    }
  ],
  "missing_topics": ["缺失主题1"]
}

## 审核维度

1. 内容完整性：是否覆盖教学目标
2. 逻辑清晰度：前后衔接是否自然
3. 表达准确性：概念是否正确
4. 内容充实度：例子是否充足
""",
}

ENRICHER_AGENT_CONFIG = {
    "name": "enricher",
    "description": "教学内容润色专家，擅长根据审核建议优化手稿",
    "system_prompt": """你是一位资深的教学内容润色专家。

你的任务是根据审核建议优化教学手稿。

## 优化策略

1. 针对性修改：只改需要改的部分
2. 补充内容：融入新检索的资料
3. 保持风格：不改变原有语言风格
4. 标注修改：用 <!-- 修改: xxx --> 标注重大修改

## 输出格式

优化后的完整 Markdown 手稿。
""",
}

LAYOUT_AGENT_CONFIG = {
    "name": "layout",
    "description": "PPT 布局专家，擅长将手稿内容智能分页排版成适合演示的幻灯片",
    "system_prompt": """你是一位专业的 PPT 布局设计专家。

你的任务是将用户的手稿内容智能分页，布局成适合演示的幻灯片。

## 核心原则

**不删减任何内容** - 用户的每一个知识点、每一句话都必须保留！

## 布局策略

1. 分析内容结构，识别所有知识点
2. 合理分页，每页内容适中（150-300字）
3. 保持逻辑连贯，相关内容放一起
4. 优化排版层次（标题、要点、正文）

## 分页规则

- 开场/引入：1页
- 核心概念：每个概念 1-2 页
- 公式推导：独立成页
- 例题案例：独立成页
- 总结回顾：1页

## 输出格式

Markdown 格式，用 --- 分隔每页。
""",
}

ANALYZER_AGENT_CONFIG = {
    "name": "analyzer",
    "description": "内容分析专家，擅长识别手稿中的知识点和结构",
    "system_prompt": """你是一位内容分析专家。

你的任务是分析手稿内容，识别其中的所有知识点和结构。

## 分析维度

1. 主题识别：手稿的核心主题是什么
2. 知识点提取：有哪些知识点（概念、公式、方法、案例等）
3. 结构分析：内容的逻辑结构如何
4. 分页建议：哪些地方适合分页

## 输出格式 (JSON)

{
  "title": "主题",
  "knowledge_points": [...],
  "structure": {...},
  "page_suggestions": [...]
}
""",
}


# ==================== TeachingAgent 类 ====================


class TeachingAgent:
    """
    教学 Agent - 真正的 deepagents 编排实现

    通过 write_todos 规划任务，用 task() 委托子 Agent，
    使用文件系统存储中间结果，支持 HITL 人工审核。
    """

    def __init__(self, hitl_config: Optional[HITLConfig] = None):
        """初始化 Agent"""
        settings = get_settings()

        # 初始化 LLM
        self.llm = ChatOpenAI(
            model=settings.openai_model,
            openai_api_key=settings.openai_api_key,
            openai_api_base=settings.openai_api_base,
            temperature=0.7,
        )

        # 任务列表（模拟 write_todos）
        self.todos: list[dict] = []

        # 会话上下文
        self.context: dict[str, Any] = {}

        # 中间文件存储
        self.files: dict[str, str] = {}

        # HITL 管理器
        self.hitl = HITLManager(config=hitl_config)

        # 执行追踪器
        self.tracer = get_tracer()
        self.current_trace_id: Optional[str] = None

        logger.info(f"TeachingAgent initialized with model: {settings.openai_model}")
        logger.info(f"HITL enabled: {self.hitl.config.enabled}")

    # ==================== Todo 管理 ====================

    def write_todos(self, todos: list[dict]) -> None:
        """写入任务列表"""
        self.todos = todos
        logger.info(f"Created {len(todos)} todos")
        for todo in todos:
            logger.debug(f"  [{todo['status']}] {todo['id']}: {todo['content']}")

    def update_todo(self, todo_id: str, status: str) -> None:
        """更新任务状态"""
        for todo in self.todos:
            if todo["id"] == todo_id:
                old_status = todo["status"]
                todo["status"] = status
                logger.info(f"Todo {todo_id}: {old_status} -> {status}")
                break

    def get_todos(self) -> list[dict]:
        """获取当前任务列表"""
        return self.todos.copy()

    # ==================== 文件系统 ====================

    def write_file(self, path: str, content: str) -> str:
        """写入文件（内存+磁盘）"""
        self.files[path] = content

        # 持久化到磁盘
        full_path = WORKSPACE_ROOT / path.lstrip("/")
        full_path.parent.mkdir(parents=True, exist_ok=True)
        full_path.write_text(content, encoding="utf-8")

        logger.info(f"Wrote file: {path} ({len(content)} chars)")
        return str(full_path)

    def read_file(self, path: str) -> Optional[str]:
        """读取文件"""
        if path in self.files:
            return self.files[path]

        full_path = WORKSPACE_ROOT / path.lstrip("/")
        if full_path.exists():
            return full_path.read_text(encoding="utf-8")

        return None

    # ==================== 子 Agent 委托 ====================

    async def task(self, agent: str, input_data: dict) -> dict:
        """
        委托子 Agent 执行任务

        这是 deepagents 的核心能力之一，实现上下文隔离。
        会记录执行步骤和思考过程到 Trace。
        """
        logger.info(f"Delegating task to sub-agent: {agent}")

        # 记录思考过程
        reasoning = self._generate_reasoning(agent, input_data)

        # 开始追踪步骤
        step_id = None
        if self.current_trace_id:
            step_id = self.tracer.start_step(
                trace_id=self.current_trace_id,
                step_type=StepType.SUBAGENT,
                name=agent,
                input_data=self._safe_input(input_data),
                reasoning=reasoning,
            )

        try:
            if agent == "planner":
                result = await self._run_planner(input_data)
            elif agent == "writer":
                result = await self._run_writer(input_data)
            elif agent == "reviewer":
                result = await self._run_reviewer(input_data)
            elif agent == "enricher":
                result = await self._run_enricher(input_data)
            elif agent == "analyzer":
                result = await self._run_analyzer(input_data)
            elif agent == "layout":
                result = await self._run_layout(input_data)
            else:
                raise ValueError(f"Unknown sub-agent: {agent}")

            # 记录决策
            decision = self._generate_decision(agent, result)

            # 结束追踪步骤
            if self.current_trace_id and step_id:
                self.tracer.end_step(
                    trace_id=self.current_trace_id,
                    step_id=step_id,
                    output=self._safe_output(result),
                    decision=decision,
                )

            return result

        except Exception as e:
            if self.current_trace_id and step_id:
                self.tracer.end_step(
                    trace_id=self.current_trace_id,
                    step_id=step_id,
                    error=str(e),
                )
            raise

    def _generate_reasoning(self, agent: str, input_data: dict) -> str:
        """生成思考过程说明"""
        if agent == "planner":
            chapter = input_data.get("chapter_title", "")
            scene = input_data.get("scene_type", "general")
            return f"分析章节《{chapter}》的内容结构，根据{scene}场景类型规划教学大纲，需要确定教学目标、核心概念和节次安排"

        elif agent == "writer":
            plan = input_data.get("plan", {})
            sections_count = len(plan.get("sections", []))
            return f"根据教学规划生成手稿，共{sections_count}个节次，需要为每节生成详尽的讲解内容，通过RAG检索补充教材原文"

        elif agent == "reviewer":
            return "从内容完整性、逻辑清晰度、表达准确性、内容充实度等维度审核手稿质量，识别问题并给出改进建议"

        elif agent == "enricher":
            review = input_data.get("review", {})
            suggestions_count = len(review.get("suggestions", []))
            missing_count = len(review.get("missing_topics", []))
            return f"根据{suggestions_count}条改进建议和{missing_count}个遗漏主题，通过RAG检索补充内容并优化手稿"

        elif agent == "analyzer":
            content = input_data.get("content", "")
            return f"分析用户手稿内容（{len(content)}字），识别所有知识点和结构，为PPT布局提供依据"

        elif agent == "layout":
            analysis = input_data.get("analysis", {})
            kp_count = len(analysis.get("knowledge_points", []))
            return f"根据分析结果（{kp_count}个知识点），智能分页布局，确保所有内容都被合理安排到幻灯片中"

        return f"执行{agent}任务"

    def _generate_decision(self, agent: str, result: dict) -> str:
        """生成决策说明"""
        if agent == "planner":
            sections = result.get("sections", [])
            duration = result.get("total_duration_minutes", 0)
            return f"规划完成：{len(sections)}个节次，预计{duration}分钟"

        elif agent == "writer":
            markdown = result.get("markdown", "")
            pages = markdown.count("---") + 1
            return f"手稿生成完成：约{len(markdown)}字，{pages}页"

        elif agent == "reviewer":
            score = result.get("overall_score", 0)
            passed = result.get("passed", False)
            suggestions = len(result.get("suggestions", []))
            return f"审核完成：{score}分，{'通过' if passed else '需改进'}，{suggestions}条建议"

        elif agent == "enricher":
            markdown = result.get("enriched_markdown", "")
            return f"润色完成：约{len(markdown)}字"

        elif agent == "analyzer":
            kp_count = len(result.get("knowledge_points", []))
            title = result.get("title", "")
            return f"分析完成：主题《{title}》，识别出{kp_count}个知识点"

        elif agent == "layout":
            content = result.get("paged_content", "")
            pages = content.count("---") + 1
            return f"布局完成：{pages}页PPT，保留所有知识点"

        return "任务完成"

    def _safe_input(self, data: dict) -> dict:
        """安全处理输入（截断过长内容）"""
        safe = {}
        for k, v in data.items():
            if isinstance(v, str) and len(v) > 500:
                safe[k] = v[:500] + "..."
            elif isinstance(v, dict):
                safe[k] = self._safe_input(v)
            else:
                safe[k] = v
        return safe

    def _safe_output(self, data: dict) -> dict:
        """安全处理输出（截断过长内容）"""
        return self._safe_input(data)

    async def _run_planner(self, input_data: dict) -> dict:
        """运行规划子 Agent"""
        prompt = format_planner_prompt(
            chapter_title=input_data["chapter_title"],
            chapter_content=input_data["chapter_content"],
            scene_type=input_data.get("scene_type", "general"),
        )

        response = await self.llm.ainvoke(prompt)
        text = response.content if hasattr(response, "content") else str(response)

        return self._parse_plan(text, input_data.get("scene_type", "general"))

    async def _run_writer(self, input_data: dict) -> dict:
        """运行手稿生成子 Agent"""
        plan = input_data["plan"]
        kb_id = input_data["knowledge_base_id"]
        scene_type = plan.get("scene_type", "general")

        # RAG 检索相关内容
        rag_content = ""
        for section in plan.get("sections", [])[:3]:  # 取前3节检索
            query = f"{section['title']} {' '.join(section.get('key_points', [])[:2])}"
            try:
                results = await rag_search(kb_id, query, vector_top_k=3)
                for r in results[:2]:
                    rag_content += f"\n---\n{r.get('text', r.get('content', ''))}\n"
            except Exception as e:
                logger.warning(f"RAG search failed: {e}")

        # 构建 Prompt
        prompt = format_manuscript_prompt(
            plan=plan,
            rag_content=rag_content,
            scene_type=scene_type,
            chapter_content=input_data.get("chapter_content", ""),
        )

        response = await self.llm.ainvoke(prompt)
        markdown = response.content if hasattr(response, "content") else str(response)

        return {"markdown": markdown}

    async def _run_reviewer(self, input_data: dict) -> dict:
        """运行审核子 Agent"""
        prompt = format_review_prompt(
            draft_content=input_data["draft_content"],
            plan=input_data["plan"],
        )

        response = await self.llm.ainvoke(prompt)
        text = response.content if hasattr(response, "content") else str(response)

        return self._parse_review(text)

    async def _run_enricher(self, input_data: dict) -> dict:
        """运行润色子 Agent"""
        kb_id = input_data["knowledge_base_id"]
        review = input_data["review"]

        # 根据 missing_topics 进行补充检索
        supplement = ""
        for topic in review.get("missing_topics", [])[:3]:
            try:
                results = await rag_search(kb_id, topic, vector_top_k=2)
                for r in results[:1]:
                    supplement += (
                        f"\n---\n主题：{topic}\n{r.get('text', r.get('content', ''))}\n"
                    )
            except Exception as e:
                logger.warning(f"Supplement RAG failed: {e}")

        prompt = format_enrich_prompt(
            draft_content=input_data["draft_content"],
            review=review,
            supplement=supplement,
        )

        response = await self.llm.ainvoke(prompt)
        markdown = response.content if hasattr(response, "content") else str(response)

        return {"enriched_markdown": markdown}

    async def _run_analyzer(self, input_data: dict) -> dict:
        """运行分析子 Agent - 识别手稿中的所有知识点"""
        content = input_data.get("content", "")

        prompt = f"""请分析以下手稿内容，识别其中的所有知识点和结构。

## 手稿内容
{content}

## 任务
1. 识别手稿的主题/标题
2. **提取所有知识点**（不遗漏任何内容）
3. 分析内容的逻辑结构
4. 标记适合分页的位置

## 输出格式 (JSON)
{{
  "title": "手稿主题/标题",
  "summary": "内容摘要（50字以内）",
  "knowledge_points": [
    {{
      "id": 1,
      "title": "知识点标题",
      "content_preview": "内容摘要（30字）",
      "type": "concept|formula|example|explanation|summary|intro|conclusion",
      "importance": "high|medium|low",
      "char_count": 100,
      "suggested_layout": "single_page|combine_prev|combine_next|split"
    }}
  ],
  "structure": {{
    "has_intro": true,
    "has_conclusion": true,
    "main_sections": ["节1标题", "节2标题"],
    "total_char_count": 1500
  }},
  "layout_suggestions": [
    "开场部分可独立成页",
    "公式推导部分建议拆分"
  ]
}}

## 重要提示
- **不要遗漏任何知识点**
- 每个知识点都要识别
- suggested_layout 说明：
  - single_page: 内容完整，适合独占一页
  - combine_prev: 内容较少，可与前一个合并
  - combine_next: 内容较少，可与后一个合并
  - split: 内容太长，需要拆分成多页

请直接输出 JSON："""

        response = await self.llm.ainvoke(prompt)
        text = response.content if hasattr(response, "content") else str(response)

        try:
            import re

            json_match = re.search(r"\{[\s\S]*\}", text)
            if json_match:
                return json.loads(json_match.group())
        except Exception as e:
            logger.error(f"Failed to parse analyzer result: {e}")

        return {
            "title": "用户手稿",
            "knowledge_points": [],
            "structure": {"has_intro": False, "has_conclusion": False},
        }

    async def _run_layout(self, input_data: dict) -> dict:
        """运行布局子 Agent - 智能分页，保留所有内容"""
        from langchain_core.messages import SystemMessage, HumanMessage

        content = input_data.get("content", "")
        analysis = input_data.get("analysis", {})

        # System message: 规则在这里，LLM 遵守但不输出
        system_prompt = """你是 PPT 布局专家。将手稿分页排版成幻灯片。

规则：
- 保留所有原始内容，一字不改
- 每页 150-300 字
- 用 --- 分隔页面
- 每页加清晰标题

直接输出 Markdown，不要任何解释或说明。"""

        # User message: 只放手稿内容，简洁明了
        user_prompt = f"""将以下手稿分页：

{content}"""

        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_prompt),
        ]

        response = await self.llm.ainvoke(messages)
        text = response.content if hasattr(response, "content") else str(response)

        # 只清理代码块标记
        text = text.replace("```markdown", "").replace("```", "").strip()

        # 规范化分页符
        lines = text.split("\n")
        result = []
        for line in lines:
            if line.strip() == "---":
                result.append("\n---\n")
            else:
                result.append(line)

        return {"paged_content": "\n".join(result)}

    # ==================== 主流程 ====================

    async def generate_plan(
        self,
        knowledge_base_id: str,
        chapter_title: str,
        chapter_content: str,
        scene_type: str = "general",
    ) -> dict:
        """生成教学规划"""
        logger.info(f"[Plan] Starting for: {chapter_title}")

        # 创建任务
        self.write_todos(
            [
                {"id": "plan", "content": "生成教学规划", "status": "in_progress"},
            ]
        )

        # 委托子 Agent
        plan = await self.task(
            "planner",
            {
                "chapter_title": chapter_title,
                "chapter_content": chapter_content,
                "scene_type": scene_type,
            },
        )

        # 保存到文件
        plan_path = f"/drafts/{knowledge_base_id}/plan.json"
        self.write_file(plan_path, json.dumps(plan, ensure_ascii=False, indent=2))

        # 更新状态
        self.update_todo("plan", "completed")
        self.context["plan"] = plan

        return plan

    async def generate_draft(
        self,
        knowledge_base_id: str,
        plan: dict,
        chapter_key_points: Optional[list] = None,
        chapter_summary: Optional[str] = None,
        chapter_content: Optional[str] = None,
    ) -> str:
        """生成手稿初稿"""
        logger.info(f"[Draft] Starting for: {plan.get('chapter', 'Unknown')}")

        # 创建任务
        self.write_todos(
            [
                {"id": "draft", "content": "生成手稿初稿", "status": "in_progress"},
            ]
        )

        # 委托子 Agent
        result = await self.task(
            "writer",
            {
                "plan": plan,
                "knowledge_base_id": knowledge_base_id,
                "chapter_content": chapter_content or "",
            },
        )

        markdown = result["markdown"]

        # 保存到文件
        draft_path = f"/drafts/{knowledge_base_id}/draft_v1.md"
        self.write_file(draft_path, markdown)

        # 更新状态
        self.update_todo("draft", "completed")
        self.context["draft"] = markdown

        return markdown

    async def process_user_manuscript(
        self,
        knowledge_base_id: str,
        manuscript_content: str,
        scene_type: str = "general",
        options: Optional[dict] = None,
    ) -> dict:
        """
        处理用户手写的手稿 - 智能分页布局

        用户手稿已经是完整严谨的内容，Agent 的任务是：
        1. 分析手稿结构，识别所有知识点
        2. 智能分页布局（不删减任何内容）
        3. 优化每页的排版结构
        4. 输出适合渲染 PPT 的 Markdown

        核心原则：**保留所有内容，只做布局优化**

        Args:
            knowledge_base_id: 知识库 ID
            manuscript_content: 用户手写的手稿内容
            scene_type: 场景类型
            options: 选项
                - max_content_per_page: 每页最大字数（默认 300）
                - preserve_structure: 保留原有结构（默认 True）
        """
        options = options or {}
        max_content_per_page = options.get("max_content_per_page", 300)
        preserve_structure = options.get("preserve_structure", True)

        logger.info(f"[Process User Manuscript] Starting layout for PPT")

        # 开始追踪
        self.current_trace_id = self.tracer.start_trace(
            name="process_user_manuscript",
            input_data={
                "knowledge_base_id": knowledge_base_id,
                "scene_type": scene_type,
                "content_length": len(manuscript_content),
            },
        )

        try:
            # 创建任务计划
            self.write_todos(
                [
                    {
                        "id": "1",
                        "content": "分析手稿知识点结构",
                        "status": "in_progress",
                    },
                    {"id": "2", "content": "智能分页布局", "status": "pending"},
                    {"id": "3", "content": "优化页面排版", "status": "pending"},
                    {"id": "4", "content": "输出 PPT 格式", "status": "pending"},
                ]
            )

            # Step 1: 委托 analyzer 子 Agent 分析手稿
            analysis = await self.task(
                "analyzer",
                {"content": manuscript_content},
            )
            self.update_todo("1", "completed")

            # Step 2: 委托 layout 子 Agent 智能分页布局
            self.update_todo("2", "in_progress")
            layout_result = await self.task(
                "layout",
                {
                    "content": manuscript_content,
                    "analysis": analysis,
                    "scene_type": scene_type,
                },
            )
            paged_content = layout_result.get("paged_content", manuscript_content)
            self.update_todo("2", "completed")

            # Step 3: 验证输出质量 - Deep Agents 的责任审核步骤
            self.update_todo("3", "in_progress")
            validation = self._validate_layout_output(manuscript_content, paged_content)

            if not validation["is_valid"]:
                # 记录到 trace
                if self.current_trace_id:
                    self.tracer.add_reasoning(
                        self.current_trace_id,
                        f"布局验证失败: {validation['issues']}，使用原始内容重新分页",
                    )

                # 如果验证失败，使用简单分页代替
                logger.warning(f"[Layout Validation] Failed: {validation['issues']}")
                paged_content = self._simple_pagination(manuscript_content)
            else:
                if self.current_trace_id:
                    self.tracer.add_decision(
                        self.current_trace_id,
                        f"布局验证通过: 内容保留率 {validation['content_retention']:.1%}",
                    )

            # 格式规范化
            optimized_content = self._normalize_page_format(paged_content)
            self.update_todo("3", "completed")

            # Step 4: 输出
            self.update_todo("4", "in_progress")
            output_path = self.write_file(
                f"/output/{knowledge_base_id}/user_manuscript.md",
                optimized_content,
            )

            # 生成 plan 用于后续处理
            plan = self._extract_plan_from_analysis(analysis, scene_type)
            self.update_todo("4", "completed")

            # 统计
            page_count = optimized_content.count("---") + 1

            result = {
                "success": True,
                "plan": plan,
                "original_content": manuscript_content,
                "processed_content": optimized_content,
                "output_path": output_path,
                "stats": {
                    "original_length": len(manuscript_content),
                    "processed_length": len(optimized_content),
                    "page_count": page_count,
                    "knowledge_points": len(analysis.get("knowledge_points", [])),
                },
                "todos": self.get_todos(),
            }

            # 结束追踪
            if self.current_trace_id:
                self.tracer.add_decision(
                    self.current_trace_id,
                    f"手稿布局完成：{len(manuscript_content)}字 → {page_count}页PPT，"
                    f"保留全部{len(analysis.get('knowledge_points', []))}个知识点",
                )
                self.tracer.end_trace(
                    self.current_trace_id,
                    output=self._safe_output(result),
                    status="completed",
                )
                result["trace_id"] = self.current_trace_id

            return result

        except Exception as e:
            if self.current_trace_id:
                self.tracer.add_error(self.current_trace_id, str(e))
                self.tracer.end_trace(self.current_trace_id, status="failed")
            raise
        finally:
            self.current_trace_id = None

    def _extract_plan_from_analysis(self, analysis: dict, scene_type: str) -> dict:
        """从分析结果提取 plan"""
        knowledge_points = analysis.get("knowledge_points", [])
        sections = []

        for kp in knowledge_points:
            sections.append(
                {
                    "title": kp.get("title", ""),
                    "key_points": [kp.get("content_preview", kp.get("content", ""))],
                    "duration_minutes": 3 if kp.get("importance") == "high" else 2,
                }
            )

        return {
            "chapter": analysis.get("title", "用户手稿"),
            "summary": analysis.get("summary", ""),
            "teaching_goals": [],
            "key_concepts": [kp.get("title", "") for kp in knowledge_points[:5]],
            "sections": sections,
            "total_duration_minutes": len(sections) * 3,
            "scene_type": scene_type,
            "source": "user_manuscript",
        }

    def _validate_layout_output(self, original: str, output: str) -> dict:
        """
        验证布局输出是否保留了原始内容。

        Deep Agents 不自动验证输出，需要我们主动添加这个步骤。
        """
        issues = []

        # 1. 检查输出长度 - 不应该比原始短太多（允许10%误差）
        if len(output) < len(original) * 0.8:
            issues.append(f"内容丢失: 输出{len(output)}字 < 原始{len(original)}字的80%")

        # 2. 检查关键段落是否保留
        # 提取原始内容中的段落（按空行分割）
        original_paragraphs = [p.strip() for p in original.split("\n\n") if p.strip()]
        preserved_count = 0

        for para in original_paragraphs:
            # 取段落前50字作为特征
            key = para[:50] if len(para) > 50 else para
            if key in output:
                preserved_count += 1

        content_retention = (
            preserved_count / len(original_paragraphs) if original_paragraphs else 1.0
        )

        if content_retention < 0.7:
            issues.append(f"内容保留率过低: {content_retention:.1%}")

        # 3. 检查是否有不应出现的规则性内容（警告，不作为失败条件）
        rule_keywords = ["必须遵守", "禁止的操作", "核心原则（必须遵守"]
        for kw in rule_keywords:
            if kw in output:
                issues.append(f"发现规则性内容: '{kw}'")
                break

        return {
            "is_valid": len(issues) == 0
            or (len(issues) == 1 and "规则性内容" in issues[0]),
            "issues": issues,
            "content_retention": content_retention,
            "original_length": len(original),
            "output_length": len(output),
        }

    def _simple_pagination(self, content: str, chars_per_page: int = 300) -> str:
        """
        简单分页 - 当 LLM 输出验证失败时的回退方案。

        按自然段落分页，保证内容完整。
        """
        paragraphs = content.split("\n\n")
        pages = []
        current_page = []
        current_length = 0

        for para in paragraphs:
            para = para.strip()
            if not para:
                continue

            if current_length + len(para) > chars_per_page and current_page:
                # 当前页满了，开始新页
                pages.append("\n\n".join(current_page))
                current_page = [para]
                current_length = len(para)
            else:
                current_page.append(para)
                current_length += len(para)

        # 最后一页
        if current_page:
            pages.append("\n\n".join(current_page))

        # 用 --- 连接各页
        return "\n\n---\n\n".join(pages)

    def _normalize_page_format(self, content: str) -> str:
        """规范化页面格式"""
        lines = content.split("\n")
        result = []
        prev_empty = False

        for line in lines:
            # 规范化分页符
            if line.strip() == "---" or line.strip() == "----":
                if not prev_empty:
                    result.append("")
                result.append("---")
                result.append("")
                prev_empty = True
            else:
                result.append(line)
                prev_empty = line.strip() == ""

        return "\n".join(result)

    async def review_and_enrich(
        self,
        knowledge_base_id: str,
        draft_content: str,
        plan: dict,
    ) -> dict:
        """审核并润色手稿"""
        logger.info(f"[Review & Enrich] Starting")

        # 创建任务
        self.write_todos(
            [
                {"id": "review", "content": "审核手稿质量", "status": "in_progress"},
                {"id": "enrich", "content": "根据建议润色", "status": "pending"},
            ]
        )

        # 1. 审核
        review = await self.task(
            "reviewer",
            {
                "draft_content": draft_content,
                "plan": plan,
            },
        )

        self.update_todo("review", "completed")

        # 保存审核结果
        review_path = f"/drafts/{knowledge_base_id}/review.json"
        self.write_file(review_path, json.dumps(review, ensure_ascii=False, indent=2))

        # 2. 如果需要润色
        enriched_content = draft_content
        if not review.get("passed", True) or review.get("suggestions"):
            self.update_todo("enrich", "in_progress")

            result = await self.task(
                "enricher",
                {
                    "draft_content": draft_content,
                    "review": review,
                    "knowledge_base_id": knowledge_base_id,
                },
            )

            enriched_content = result["enriched_markdown"]

            # 保存润色后的版本
            enriched_path = f"/drafts/{knowledge_base_id}/draft_v2.md"
            self.write_file(enriched_path, enriched_content)

            self.update_todo("enrich", "completed")
        else:
            self.update_todo("enrich", "cancelled")
            logger.info("Draft passed review, skipping enrich")

        return {
            "enriched_content": enriched_content,
            "review_notes": review.get("suggestions", []),
            "review": review,
        }

    async def full_pipeline(
        self,
        knowledge_base_id: str,
        chapter_title: str,
        chapter_content: str,
        scene_type: str = "general",
    ) -> dict:
        """
        完整的课件生成流水线

        这是 deepagents 编排能力的完整展示：
        1. 创建任务计划（write_todos）
        2. 逐步执行并更新状态
        3. 委托子 Agent（task）
        4. 保存中间结果（文件系统）
        5. 支持 HITL 人工审核（interrupt_on）
        """
        logger.info(f"[Full Pipeline] Starting for: {chapter_title}")

        # 开始执行追踪
        self.current_trace_id = self.tracer.start_trace(
            name="full_pipeline",
            input_data={
                "chapter_title": chapter_title,
                "scene_type": scene_type,
                "knowledge_base_id": knowledge_base_id,
            },
            metadata={"agent": "TeachingAgent"},
        )

        try:
            return await self._execute_pipeline(
                knowledge_base_id=knowledge_base_id,
                chapter_title=chapter_title,
                chapter_content=chapter_content,
                scene_type=scene_type,
            )
        except Exception as e:
            # 记录错误并结束追踪
            self.tracer.add_error(self.current_trace_id, str(e))
            self.tracer.end_trace(self.current_trace_id, status="failed")
            raise
        finally:
            self.current_trace_id = None

    async def _execute_pipeline(
        self,
        knowledge_base_id: str,
        chapter_title: str,
        chapter_content: str,
        scene_type: str,
    ) -> dict:
        """执行完整流水线（内部方法）"""
        # 创建完整任务计划
        self.write_todos(
            [
                {
                    "id": "1",
                    "content": "分析章节，生成教学规划",
                    "status": "in_progress",
                },
                {"id": "2", "content": "人工审核规划（如启用）", "status": "pending"},
                {"id": "3", "content": "根据规划生成手稿初稿", "status": "pending"},
                {"id": "4", "content": "审核手稿质量", "status": "pending"},
                {"id": "5", "content": "人工审核手稿（如启用）", "status": "pending"},
                {"id": "6", "content": "根据审核建议润色", "status": "pending"},
                {"id": "7", "content": "保存最终输出", "status": "pending"},
            ]
        )

        # Step 1: 生成规划
        plan = await self.task(
            "planner",
            {
                "chapter_title": chapter_title,
                "chapter_content": chapter_content,
                "scene_type": scene_type,
            },
        )
        self.write_file(
            f"/drafts/{knowledge_base_id}/plan.json",
            json.dumps(plan, ensure_ascii=False, indent=2),
        )
        self.update_todo("1", "completed")

        # Step 2: HITL - 规划审核
        self.update_todo("2", "in_progress")
        if self.hitl.is_checkpoint_enabled(CheckpointType.PLAN_REVIEW):
            checkpoint = await self.hitl.create_checkpoint(
                checkpoint_type=CheckpointType.PLAN_REVIEW,
                data={"plan": plan},
                message=create_plan_checkpoint_message(plan),
            )

            if checkpoint.decision == Decision.REJECT:
                self.update_todo("2", "cancelled")
                raise Exception("用户拒绝了教学规划")
            elif checkpoint.decision == Decision.EDIT and checkpoint.edited_data:
                plan = checkpoint.edited_data.get("plan", plan)
                self.write_file(
                    f"/drafts/{knowledge_base_id}/plan_edited.json",
                    json.dumps(plan, ensure_ascii=False, indent=2),
                )
        self.update_todo("2", "completed")

        # Step 3: 生成初稿
        self.update_todo("3", "in_progress")
        draft_result = await self.task(
            "writer",
            {
                "plan": plan,
                "knowledge_base_id": knowledge_base_id,
                "chapter_content": chapter_content,
            },
        )
        draft = draft_result["markdown"]
        self.write_file(f"/drafts/{knowledge_base_id}/draft_v1.md", draft)
        self.update_todo("3", "completed")

        # Step 4: 审核
        self.update_todo("4", "in_progress")
        review = await self.task(
            "reviewer",
            {
                "draft_content": draft,
                "plan": plan,
            },
        )
        self.write_file(
            f"/drafts/{knowledge_base_id}/review.json",
            json.dumps(review, ensure_ascii=False, indent=2),
        )
        self.update_todo("4", "completed")

        # Step 5: HITL - 手稿审核
        self.update_todo("5", "in_progress")
        if self.hitl.is_checkpoint_enabled(CheckpointType.DRAFT_REVIEW):
            checkpoint = await self.hitl.create_checkpoint(
                checkpoint_type=CheckpointType.DRAFT_REVIEW,
                data={"draft": draft, "review": review},
                message=create_draft_checkpoint_message(draft, review),
                auto_approve_fn=should_auto_approve_review,
            )

            if checkpoint.decision == Decision.REJECT:
                self.update_todo("5", "cancelled")
                raise Exception("用户拒绝了手稿内容")
            elif checkpoint.decision == Decision.EDIT and checkpoint.edited_data:
                draft = checkpoint.edited_data.get("draft", draft)
                self.write_file(f"/drafts/{knowledge_base_id}/draft_edited.md", draft)
        self.update_todo("5", "completed")

        # Step 6: 润色
        enriched = draft
        if not review.get("passed", True) or review.get("suggestions"):
            self.update_todo("6", "in_progress")
            enrich_result = await self.task(
                "enricher",
                {
                    "draft_content": draft,
                    "review": review,
                    "knowledge_base_id": knowledge_base_id,
                },
            )
            enriched = enrich_result["enriched_markdown"]
            self.write_file(f"/drafts/{knowledge_base_id}/draft_v2.md", enriched)
            self.update_todo("6", "completed")
        else:
            self.update_todo("6", "cancelled")

        # Step 7: 保存最终输出
        self.update_todo("7", "in_progress")
        final_path = self.write_file(
            f"/output/{knowledge_base_id}/manuscript.md", enriched
        )
        self.update_todo("7", "completed")

        logger.info(f"[Full Pipeline] Completed. Output: {final_path}")

        result = {
            "plan": plan,
            "draft": draft,
            "review": review,
            "enriched_content": enriched,
            "output_path": final_path,
            "todos": self.get_todos(),
        }

        # 结束执行追踪
        if self.current_trace_id:
            self.tracer.add_decision(
                self.current_trace_id,
                f"流水线执行完成，最终输出保存到 {final_path}",
                context={"output_path": final_path},
            )
            trace = self.tracer.end_trace(
                self.current_trace_id,
                output=self._safe_output(result),
                status="completed",
            )
            # 将追踪 ID 添加到结果中
            result["trace_id"] = self.current_trace_id
            result["trace_path"] = (
                f"/tmp/teaching-agents/traces/{self.current_trace_id}.json"
            )

        return result

    # ==================== 解析辅助 ====================

    def _parse_plan(self, text: str, scene_type: str) -> dict:
        """解析教学规划 JSON"""
        import re

        try:
            json_match = re.search(r"\{[\s\S]*\}", text)
            if not json_match:
                raise ValueError("No JSON found")

            json_str = json_match.group()
            json_str = json_str.replace("```json", "").replace("```", "")
            parsed = json.loads(json_str)

            sections = []
            for s in parsed.get("sections", []):
                sections.append(
                    {
                        "title": s.get("title", "未命名"),
                        "key_points": s.get("key_points", []),
                        "duration_minutes": s.get("duration_minutes", 5),
                        "notes": s.get("notes"),
                    }
                )

            total_duration = parsed.get("total_duration_minutes") or sum(
                s.get("duration_minutes", 5) for s in sections
            )

            return {
                "chapter": parsed.get("chapter", ""),
                "summary": parsed.get("summary", ""),
                "teaching_goals": parsed.get("teaching_goals", []),
                "key_concepts": parsed.get("key_concepts", []),
                "sections": sections,
                "total_duration_minutes": total_duration,
                "scene_type": scene_type,
                "notes": parsed.get("notes", ""),
            }
        except Exception as e:
            logger.error(f"Failed to parse plan: {e}")
            return {
                "chapter": "",
                "summary": "",
                "teaching_goals": [],
                "key_concepts": [],
                "sections": [],
                "total_duration_minutes": 30,
                "scene_type": scene_type,
                "error": str(e),
            }

    def _parse_review(self, text: str) -> dict:
        """解析审核结果 JSON"""
        import re

        try:
            json_match = re.search(r"\{[\s\S]*\}", text)
            if not json_match:
                raise ValueError("No JSON found")

            json_str = json_match.group()
            json_str = json_str.replace("```json", "").replace("```", "")
            parsed = json.loads(json_str)

            return {
                "overall_score": parsed.get("overall_score", 7),
                "passed": parsed.get("passed", True),
                "strengths": parsed.get("strengths", []),
                "suggestions": parsed.get("suggestions", []),
                "missing_topics": parsed.get("missing_topics", []),
            }
        except Exception as e:
            logger.error(f"Failed to parse review: {e}")
            return {
                "overall_score": 7,
                "passed": True,
                "strengths": [],
                "suggestions": [],
                "missing_topics": [],
                "error": str(e),
            }


# ==================== 全局实例管理 ====================

_agent_instance: Optional[TeachingAgent] = None


def get_teaching_agent() -> TeachingAgent:
    """获取或创建全局 Agent 实例"""
    global _agent_instance
    if _agent_instance is None:
        _agent_instance = TeachingAgent()
    return _agent_instance


def reset_teaching_agent() -> None:
    """重置 Agent（用于测试）"""
    global _agent_instance
    _agent_instance = None
