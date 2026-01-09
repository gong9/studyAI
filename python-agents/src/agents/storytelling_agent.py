"""
讲书主 Agent

核心能力：
1. write_todos - 任务规划和追踪
2. task() - 委托子 Agent
3. 文件系统 - 存储中间结果
4. 流式通知 - SSE 推送进度
"""

import asyncio
import json
import logging
import os
from pathlib import Path
from typing import Any, AsyncGenerator, Optional, List

from langchain_openai import ChatOpenAI

from ..config import get_settings
from .subagents.story_extractor import extract_story
from .subagents.book_synthesizer import synthesize_book
from .subagents.episode_planner import plan_episodes
from .subagents.storyteller import generate_episode_script, extract_ending

logger = logging.getLogger(__name__)

# ==================== 工作目录配置 ====================

WORKSPACE_ROOT = Path(os.getenv("AGENT_WORKSPACE", "/tmp/teaching-agents"))
STORYTELLING_DIR = WORKSPACE_ROOT / "storytelling"

# 确保目录存在
STORYTELLING_DIR.mkdir(parents=True, exist_ok=True)


# ==================== 主 Agent 类 ====================


class StorytellingAgent:
    """
    讲书 Agent - 将书籍转化为评书风格有声内容
    
    处理流程：
    1. 接收 PDF，提取章节（书签）
    2. 并行提取各章故事摘要
    3. 汇总全书形成"全书视角"
    4. 基于全书视角规划分集
    5. 逐回生成评书讲稿
    6. 生成音频（TTS）
    """

    def __init__(self):
        """初始化 Agent"""
        settings = get_settings()

        # 初始化 LLM
        self.llm = ChatOpenAI(
            model=settings.openai_model,
            openai_api_key=settings.openai_api_key,
            openai_api_base=settings.openai_api_base,
            temperature=0.8,  # 评书需要更有创意
        )

        # 任务列表
        self.todos: list[dict] = []

        # 会话上下文
        self.context: dict[str, Any] = {}

        logger.info(f"StorytellingAgent initialized with model: {settings.openai_model}")

    # ==================== Todo 管理 ====================

    def write_todos(self, todos: list[dict]) -> None:
        """写入任务列表"""
        self.todos = todos
        logger.info(f"Created {len(todos)} todos")

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

    def _get_book_dir(self, book_id: str) -> Path:
        """获取书籍工作目录"""
        book_dir = STORYTELLING_DIR / book_id
        book_dir.mkdir(parents=True, exist_ok=True)
        return book_dir

    def write_file(self, book_id: str, path: str, content: str) -> str:
        """写入文件"""
        book_dir = self._get_book_dir(book_id)
        full_path = book_dir / path.lstrip("/")
        full_path.parent.mkdir(parents=True, exist_ok=True)
        full_path.write_text(content, encoding="utf-8")
        logger.info(f"Wrote file: {full_path} ({len(content)} chars)")
        return str(full_path)

    def read_file(self, book_id: str, path: str) -> Optional[str]:
        """读取文件"""
        book_dir = self._get_book_dir(book_id)
        full_path = book_dir / path.lstrip("/")
        if full_path.exists():
            return full_path.read_text(encoding="utf-8")
        return None

    def write_json(self, book_id: str, path: str, data: dict) -> str:
        """写入 JSON 文件"""
        return self.write_file(book_id, path, json.dumps(data, ensure_ascii=False, indent=2))

    def read_json(self, book_id: str, path: str) -> Optional[dict]:
        """读取 JSON 文件"""
        content = self.read_file(book_id, path)
        if content:
            return json.loads(content)
        return None

    def log_activity(self, book_id: str, agent: str, message: str) -> None:
        """记录 AI 活动日志（用于终端展示）"""
        from datetime import datetime
        book_dir = self._get_book_dir(book_id)
        log_file = book_dir / "agent.log"
        timestamp = datetime.now().strftime("%H:%M:%S")
        log_line = f"[{timestamp}] [{agent}] {message}\n"
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(log_line)

    # ==================== 子 Agent 委托 ====================

    async def task(self, agent: str, input_data: dict) -> Any:
        """委托子 Agent 执行任务"""
        logger.info(f"Delegating task to: {agent}")

        if agent == "story_extractor":
            return await extract_story(
                chapter_title=input_data["chapter_title"],
                chapter_content=input_data["chapter_content"],
                llm_client=self.llm,
            )
        elif agent == "book_synthesizer":
            return await synthesize_book(
                book_title=input_data["book_title"],
                chapter_summaries=input_data["chapter_summaries"],
                llm_client=self.llm,
            )
        elif agent == "episode_planner":
            return await plan_episodes(
                book_title=input_data["book_title"],
                book_overview=input_data["book_overview"],
                chapter_summaries=input_data["chapter_summaries"],
                target_duration_minutes=input_data.get("target_duration_minutes", 10),
                llm_client=self.llm,
            )
        elif agent == "storyteller":
            return await generate_episode_script(
                episode_number=input_data["episode_number"],
                episode_plan=input_data["episode_plan"],
                episode_content=input_data["episode_content"],
                book_overview=input_data.get("book_overview", {}),
                previous_ending=input_data.get("previous_ending"),
                llm_client=self.llm,
            )
        else:
            raise ValueError(f"Unknown agent: {agent}")

    # ==================== 进度状态管理 ====================

    def _get_progress(self, book_id: str) -> dict:
        """获取处理进度"""
        progress = self.read_json(book_id, "progress/state.json")
        return progress or {
            "status": "pending",
            "phase": "init",
            "total_chapters": 0,
            "processed_chapters": 0,
            "total_episodes": 0,
            "ready_episodes": 0,
            "current_episode": 0,
            "message": "",
        }

    def _update_progress(self, book_id: str, **kwargs) -> None:
        """更新处理进度"""
        progress = self._get_progress(book_id)
        progress.update(kwargs)
        self.write_json(book_id, "progress/state.json", progress)

    # ==================== 准备阶段 ====================

    async def prepare(
        self,
        book_id: str,
        book_title: str,
        chapters: List[dict],
        target_duration_minutes: int = 10,
    ) -> dict:
        """
        准备阶段：故事提取 + 全书综合 + 分集规划
        
        Args:
            book_id: 书籍 ID
            book_title: 书名
            chapters: 章节列表 [{"title": "...", "content": "..."}]
            target_duration_minutes: 目标每回时长
            
        Returns:
            分集规划
        """
        logger.info(f"[Prepare] Starting for: {book_title}, {len(chapters)} chapters")
        
        # 清空日志文件
        log_file = self._get_book_dir(book_id) / "agent.log"
        log_file.write_text("", encoding="utf-8")
        
        self.log_activity(book_id, "System", f"开始处理《{book_title}》共 {len(chapters)} 章")

        # 保存书籍信息
        self.write_json(book_id, "meta/book_info.json", {
            "title": book_title,
            "chapter_count": len(chapters),
            "target_duration_minutes": target_duration_minutes,
        })
        self.write_json(book_id, "meta/chapters.json", chapters)

        # 初始化进度
        self._update_progress(
            book_id,
            status="processing",
            phase="story_extraction",
            total_chapters=len(chapters),
            processed_chapters=0,
            message="正在提取各章故事...",
        )
        
        self.log_activity(book_id, "StorytellingAgent", "初始化任务规划...")

        # 创建任务计划
        self.write_todos([
            {"id": "extract", "content": "提取各章故事摘要", "status": "in_progress"},
            {"id": "synthesize", "content": "汇总全书视角", "status": "pending"},
            {"id": "plan", "content": "生成分集规划", "status": "pending"},
        ])
        
        self.log_activity(book_id, "StoryExtractor", f"开始并行提取 {len(chapters)} 个章节的故事元素")

        # Step 1: 并行提取各章故事摘要
        chapter_summaries = []
        tasks = []
        for chapter in chapters:
            tasks.append(self.task("story_extractor", {
                "chapter_title": chapter["title"],
                "chapter_content": chapter["content"],
            }))

        # 并行执行，但限制并发数
        batch_size = 5
        for i in range(0, len(tasks), batch_size):
            batch = tasks[i:i + batch_size]
            self.log_activity(book_id, "StoryExtractor", f"处理批次 {i // batch_size + 1}：章节 {i + 1}-{min(i + batch_size, len(chapters))}")
            results = await asyncio.gather(*batch, return_exceptions=True)
            for j, result in enumerate(results):
                if isinstance(result, Exception):
                    logger.error(f"Chapter {i + j + 1} extraction failed: {result}")
                    self.log_activity(book_id, "StoryExtractor", f"⚠ 章节 {i + j + 1} 提取失败")
                    result = {"chapter_title": chapters[i + j]["title"], "error": str(result)}
                else:
                    char_count = len(result.get("characters", []))
                    event_count = len(result.get("key_events", []))
                    self.log_activity(book_id, "StoryExtractor", f"✓ 章节 {i + j + 1} 完成：{char_count} 人物, {event_count} 事件")
                chapter_summaries.append(result)
                # 保存各章摘要
                self.write_json(book_id, f"summaries/chapter_{i + j + 1:02d}.json", result)
                # 更新进度
                self._update_progress(
                    book_id,
                    processed_chapters=len(chapter_summaries),
                    message=f"已提取 {len(chapter_summaries)}/{len(chapters)} 章",
                )

        self.log_activity(book_id, "StoryExtractor", f"全部 {len(chapters)} 章提取完成")
        self.update_todo("extract", "completed")

        # Step 2: 汇总全书视角
        self.update_todo("synthesize", "in_progress")
        self._update_progress(book_id, phase="synthesizing", message="正在汇总全书视角...")
        self.log_activity(book_id, "BookSynthesizer", "开始综合全书人物关系与故事脉络...")

        book_overview = await self.task("book_synthesizer", {
            "book_title": book_title,
            "chapter_summaries": chapter_summaries,
        })
        self.write_json(book_id, "understanding/book_overview.json", book_overview)
        self.update_todo("synthesize", "completed")
        
        char_count = len(book_overview.get("main_characters", []))
        theme = book_overview.get("main_theme", "")[:30]
        self.log_activity(book_id, "BookSynthesizer", f"✓ 综合完成：{char_count} 主角，主题「{theme}...」")

        # Step 3: 分集规划
        self.update_todo("plan", "in_progress")
        self._update_progress(book_id, phase="planning", message="正在规划分集...")
        self.log_activity(book_id, "EpisodePlanner", f"开始规划分集结构（目标时长 {target_duration_minutes} 分钟/回）...")

        episode_plan = await self.task("episode_planner", {
            "book_title": book_title,
            "book_overview": book_overview,
            "chapter_summaries": chapter_summaries,
            "target_duration_minutes": target_duration_minutes,
        })
        self.write_json(book_id, "plan/episode_plan.json", episode_plan)
        self.update_todo("plan", "completed")
        
        total_episodes = episode_plan.get("total_episodes", 0)
        self.log_activity(book_id, "EpisodePlanner", f"✓ 分集完成：共规划 {total_episodes} 回")

        # 更新进度
        self._update_progress(
            book_id,
            status="ready",
            phase="prepared",
            total_episodes=total_episodes,
            ready_episodes=0,
            message="准备完成，开始生成讲稿...",
        )
        
        self.log_activity(book_id, "StorytellingAgent", f"准备阶段完成，等待生成讲稿...")

        logger.info(f"[Prepare] Completed: {total_episodes} episodes planned")

        return episode_plan

    # ==================== 生成阶段 ====================

    async def generate_episode(
        self,
        book_id: str,
        episode_number: int,
    ) -> str:
        """
        生成单回讲稿
        
        Args:
            book_id: 书籍 ID
            episode_number: 回目编号
            
        Returns:
            讲稿内容
        """
        logger.info(f"[Generate] Episode {episode_number}")

        # 读取必要数据
        episode_plan = self.read_json(book_id, "plan/episode_plan.json")
        book_overview = self.read_json(book_id, "understanding/book_overview.json")
        chapters = self.read_json(book_id, "meta/chapters.json")

        if not episode_plan or not chapters:
            raise ValueError(f"Book {book_id} not prepared")

        episodes = episode_plan.get("episodes", [])
        if episode_number < 1 or episode_number > len(episodes):
            raise ValueError(f"Invalid episode number: {episode_number}")

        episode = episodes[episode_number - 1]
        episode_title = episode.get("title", f"第{episode_number}回")
        
        self.log_activity(book_id, "Storyteller", f"开始生成「{episode_title}」...")

        # 获取本回涉及的章节内容
        chapter_range = episode.get("chapter_range", {})
        start_ch = chapter_range.get("start_chapter", episode_number)
        end_ch = chapter_range.get("end_chapter", start_ch)
        
        self.log_activity(book_id, "Storyteller", f"读取章节 {start_ch}-{end_ch} 内容...")
        
        episode_content = ""
        for i in range(start_ch - 1, min(end_ch, len(chapters))):
            episode_content += f"\n\n### {chapters[i]['title']}\n\n{chapters[i]['content']}"

        # 获取上一回结尾（用于衔接）
        previous_ending = None
        if episode_number > 1:
            prev_script = self.read_file(book_id, f"scripts/episode_{episode_number - 1:02d}.md")
            if prev_script:
                previous_ending = extract_ending(prev_script)
                self.log_activity(book_id, "Storyteller", f"读取上回结尾用于衔接...")

        self.log_activity(book_id, "Storyteller", f"调用 LLM 生成评书风格讲稿...")
        
        # 生成讲稿
        script = await self.task("storyteller", {
            "episode_number": episode_number,
            "episode_plan": episode,
            "episode_content": episode_content,
            "book_overview": book_overview,
            "previous_ending": previous_ending,
        })

        # 保存讲稿
        self.write_file(book_id, f"scripts/episode_{episode_number:02d}.md", script)
        
        script_len = len(script)
        self.log_activity(book_id, "Storyteller", f"✓「{episode_title}」完成，{script_len} 字")

        # 更新进度
        progress = self._get_progress(book_id)
        self._update_progress(
            book_id,
            ready_episodes=episode_number,
            current_episode=episode_number,
            message=f"第 {episode_number} 回讲稿已完成",
        )

        return script

    # ==================== 流式生成 ====================

    async def generate_all_episodes(
        self,
        book_id: str,
        start_episode: int = 1,
    ) -> AsyncGenerator[dict, None]:
        """
        流式生成所有回目
        
        Yields:
            进度事件 {"type": "...", "data": {...}}
        """
        episode_plan = self.read_json(book_id, "plan/episode_plan.json")
        if not episode_plan:
            yield {"type": "error", "data": {"message": "Book not prepared"}}
            return

        total_episodes = episode_plan.get("total_episodes", 0)
        self._update_progress(book_id, status="generating", phase="generating")

        for ep_num in range(start_episode, total_episodes + 1):
            try:
                yield {
                    "type": "episode_start",
                    "data": {"episode": ep_num, "total": total_episodes},
                }

                script = await self.generate_episode(book_id, ep_num)

                yield {
                    "type": "episode_ready",
                    "data": {
                        "episode": ep_num,
                        "total": total_episodes,
                        "script_length": len(script),
                    },
                }

            except Exception as e:
                logger.error(f"Episode {ep_num} generation failed: {e}")
                yield {
                    "type": "episode_error",
                    "data": {"episode": ep_num, "error": str(e)},
                }

        self._update_progress(
            book_id,
            status="completed",
            phase="done",
            message="全部生成完成",
        )
        yield {"type": "complete", "data": {"total_episodes": total_episodes}}

    # ==================== 完整流水线 ====================

    async def full_pipeline(
        self,
        book_id: str,
        book_title: str,
        chapters: List[dict],
        target_duration_minutes: int = 10,
    ) -> AsyncGenerator[dict, None]:
        """
        完整流水线：准备 + 生成所有回目
        
        Yields:
            进度事件
        """
        yield {"type": "start", "data": {"book_id": book_id, "book_title": book_title}}

        # 准备阶段
        yield {"type": "phase", "data": {"phase": "prepare", "message": "开始准备..."}}

        try:
            episode_plan = await self.prepare(
                book_id=book_id,
                book_title=book_title,
                chapters=chapters,
                target_duration_minutes=target_duration_minutes,
            )

            yield {
                "type": "prepared",
                "data": {
                    "total_episodes": episode_plan.get("total_episodes", 0),
                    "episodes": episode_plan.get("episodes", []),
                },
            }

        except Exception as e:
            logger.error(f"Prepare failed: {e}")
            yield {"type": "error", "data": {"phase": "prepare", "error": str(e)}}
            return

        # 生成阶段
        yield {"type": "phase", "data": {"phase": "generate", "message": "开始生成讲稿..."}}

        async for event in self.generate_all_episodes(book_id):
            yield event


# ==================== 全局实例管理 ====================

_agent_instance: Optional[StorytellingAgent] = None


def get_storytelling_agent() -> StorytellingAgent:
    """获取或创建全局 Agent 实例"""
    global _agent_instance
    if _agent_instance is None:
        _agent_instance = StorytellingAgent()
    return _agent_instance


def reset_storytelling_agent() -> None:
    """重置 Agent（用于测试）"""
    global _agent_instance
    _agent_instance = None

