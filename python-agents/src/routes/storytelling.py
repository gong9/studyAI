"""
讲书 API 路由

提供讲书功能的 HTTP 接口。
"""

import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import json
import asyncio

from ..agents.storytelling_agent import get_storytelling_agent, StorytellingAgent

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/storytelling", tags=["storytelling"])


# ==================== 请求/响应模型 ====================


class Chapter(BaseModel):
    """章节"""
    title: str
    content: str


class PrepareRequest(BaseModel):
    """准备请求"""
    book_id: str
    book_title: str
    chapters: list[Chapter]
    target_duration_minutes: int = 10


class PrepareResponse(BaseModel):
    """准备响应"""
    success: bool
    book_id: str
    total_episodes: int
    episodes: list[dict]
    message: str = ""


class GenerateRequest(BaseModel):
    """生成请求"""
    book_id: str
    episode_number: int


class GenerateResponse(BaseModel):
    """生成响应"""
    success: bool
    episode_number: int
    script: str
    message: str = ""


class StatusResponse(BaseModel):
    """状态响应"""
    status: str
    phase: str
    total_chapters: int = 0
    processed_chapters: int = 0
    total_episodes: int = 0
    ready_episodes: int = 0
    current_episode: int = 0
    message: str = ""


class EpisodeInfo(BaseModel):
    """回目信息"""
    episode_number: int
    title: str
    summary: str
    status: str  # pending / ready
    duration_minutes: int = 0


class EpisodesResponse(BaseModel):
    """回目列表响应"""
    book_id: str
    total_episodes: int
    episodes: list[EpisodeInfo]


# ==================== 路由 ====================


@router.post("/prepare", response_model=PrepareResponse)
async def prepare(request: PrepareRequest):
    """
    准备阶段：故事提取 + 全书综合 + 分集规划
    
    这是一个长时间运行的操作，建议使用 /stream 接口获取进度。
    """
    try:
        agent = get_storytelling_agent()
        
        chapters = [{"title": c.title, "content": c.content} for c in request.chapters]
        
        episode_plan = await agent.prepare(
            book_id=request.book_id,
            book_title=request.book_title,
            chapters=chapters,
            target_duration_minutes=request.target_duration_minutes,
        )
        
        return PrepareResponse(
            success=True,
            book_id=request.book_id,
            total_episodes=episode_plan.get("total_episodes", 0),
            episodes=episode_plan.get("episodes", []),
            message="准备完成",
        )
        
    except Exception as e:
        logger.error(f"Prepare failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate", response_model=GenerateResponse)
async def generate_episode(request: GenerateRequest):
    """
    生成单回讲稿
    """
    try:
        agent = get_storytelling_agent()
        
        script = await agent.generate_episode(
            book_id=request.book_id,
            episode_number=request.episode_number,
        )
        
        return GenerateResponse(
            success=True,
            episode_number=request.episode_number,
            script=script,
            message=f"第 {request.episode_number} 回生成完成",
        )
        
    except Exception as e:
        logger.error(f"Generate failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status/{book_id}", response_model=StatusResponse)
async def get_status(book_id: str):
    """
    获取处理进度
    """
    try:
        agent = get_storytelling_agent()
        progress = agent._get_progress(book_id)
        
        return StatusResponse(**progress)
        
    except Exception as e:
        logger.error(f"Get status failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/episodes/{book_id}", response_model=EpisodesResponse)
async def get_episodes(book_id: str):
    """
    获取回目列表
    """
    try:
        import os
        from pathlib import Path
        
        agent = get_storytelling_agent()
        
        episode_plan = agent.read_json(book_id, "plan/episode_plan.json")
        if not episode_plan:
            raise HTTPException(status_code=404, detail="Book not found or not prepared")
        
        # 扫描 scripts 目录，找出已生成的回目
        scripts_dir = Path("/tmp/teaching-agents/storytelling") / book_id / "scripts"
        ready_episodes = set()
        if scripts_dir.exists():
            for f in scripts_dir.iterdir():
                if f.suffix == '.md' and f.name.startswith('episode_'):
                    try:
                        ep_num = int(f.name.replace('episode_', '').replace('.md', ''))
                        ready_episodes.add(ep_num)
                    except ValueError:
                        pass
        
        episodes = []
        for ep in episode_plan.get("episodes", []):
            ep_num = ep.get("episode_number", 0)
            episodes.append(EpisodeInfo(
                episode_number=ep_num,
                title=ep.get("title", f"第{ep_num}回"),
                summary=ep.get("summary", ""),
                status="ready" if ep_num in ready_episodes else "pending",
                duration_minutes=ep.get("estimated_duration_minutes", 10),
            ))
        
        return EpisodesResponse(
            book_id=book_id,
            total_episodes=episode_plan.get("total_episodes", 0),
            episodes=episodes,
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get episodes failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/episode/{book_id}/{episode_number}")
async def get_episode(book_id: str, episode_number: int):
    """
    获取单回详情（讲稿）
    """
    try:
        agent = get_storytelling_agent()
        
        script = agent.read_file(book_id, f"scripts/episode_{episode_number:02d}.md")
        if not script:
            raise HTTPException(status_code=404, detail="Episode not found")
        
        episode_plan = agent.read_json(book_id, "plan/episode_plan.json")
        episodes = episode_plan.get("episodes", []) if episode_plan else []
        
        episode_info = {}
        for ep in episodes:
            if ep.get("episode_number") == episode_number:
                episode_info = ep
                break
        
        return {
            "episode_number": episode_number,
            "title": episode_info.get("title", f"第{episode_number}回"),
            "summary": episode_info.get("summary", ""),
            "script": script,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get episode failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stream/{book_id}")
async def stream_pipeline(book_id: str, request: PrepareRequest):
    """
    流式执行完整流水线
    
    使用 SSE (Server-Sent Events) 推送进度。
    """
    async def event_generator():
        try:
            agent = get_storytelling_agent()
            chapters = [{"title": c.title, "content": c.content} for c in request.chapters]
            
            async for event in agent.full_pipeline(
                book_id=request.book_id,
                book_title=request.book_title,
                chapters=chapters,
                target_duration_minutes=request.target_duration_minutes,
            ):
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
                
        except Exception as e:
            logger.error(f"Stream pipeline failed: {e}")
            yield f"data: {json.dumps({'type': 'error', 'data': {'error': str(e)}})}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


@router.post("/generate-all/{book_id}")
async def stream_generate_all(book_id: str, start_episode: int = 1):
    """
    流式生成所有回目
    """
    async def event_generator():
        try:
            agent = get_storytelling_agent()
            
            async for event in agent.generate_all_episodes(book_id, start_episode):
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
                
        except Exception as e:
            logger.error(f"Generate all failed: {e}")
            yield f"data: {json.dumps({'type': 'error', 'data': {'error': str(e)}})}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
    )


@router.get("/watch/{book_id}")
async def watch_status(book_id: str):
    """
    实时监听项目状态变化 (SSE)
    
    推送内容：
    - status: 项目状态
    - phase: 当前阶段
    - progress: 进度信息
    - episodes: 回目状态
    - logs: AI 活动日志（新增）
    """
    from pathlib import Path
    
    async def event_generator():
        agent = get_storytelling_agent()
        last_state = None
        last_log_size = 0
        
        base_dir = Path("/tmp/teaching-agents/storytelling") / book_id
        log_file = base_dir / "agent.log"
        
        while True:
            try:
                # 获取状态
                progress = agent._get_progress(book_id)
                
                # 获取 episodes 状态
                scripts_dir = base_dir / "scripts"
                ready_episodes = set()
                if scripts_dir.exists():
                    for f in scripts_dir.iterdir():
                        if f.suffix == '.md' and f.name.startswith('episode_'):
                            try:
                                ep_num = int(f.name.replace('episode_', '').replace('.md', ''))
                                ready_episodes.add(ep_num)
                            except ValueError:
                                pass
                
                # 读取新的日志行
                new_logs = []
                if log_file.exists():
                    with open(log_file, 'r', encoding='utf-8') as f:
                        f.seek(last_log_size)
                        new_content = f.read()
                        last_log_size = f.tell()
                        if new_content:
                            new_logs = [line.strip() for line in new_content.split('\n') if line.strip()]
                
                # 构建状态数据
                state = {
                    "status": progress.get("status", "unknown"),
                    "phase": progress.get("phase", "unknown"),
                    "total_chapters": progress.get("total_chapters", 0),
                    "processed_chapters": progress.get("processed_chapters", 0),
                    "total_episodes": progress.get("total_episodes", 0),
                    "ready_episodes": len(ready_episodes),
                    "ready_episode_numbers": sorted(list(ready_episodes)),
                    "message": progress.get("message", ""),
                    "logs": new_logs,  # 新增日志
                }
                
                # 只在状态变化或有新日志时推送
                state_str = json.dumps(state, ensure_ascii=False)
                if state_str != last_state or new_logs:
                    yield f"data: {state_str}\n\n"
                    last_state = state_str
                else:
                    # 心跳，保持连接
                    yield f": heartbeat\n\n"
                
                await asyncio.sleep(1)  # 改为 1 秒轮询以更快地捕获日志
                
            except Exception as e:
                logger.error(f"Watch status error: {e}")
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
                break
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ==================== 流水线可视化 API ====================


@router.get("/meta/{book_id}")
async def get_meta(book_id: str):
    """
    获取书籍元数据
    """
    try:
        agent = get_storytelling_agent()
        
        # 读取 state.json 获取书籍信息
        state = agent.read_json(book_id, "progress/state.json")
        if not state:
            raise HTTPException(status_code=404, detail="Book not found")
        
        return {
            "title": state.get("book_title", "未知书籍"),
            "chapters": state.get("total_chapters", 0),
            "book_id": book_id,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get meta failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/summaries/{book_id}")
async def get_summaries(book_id: str):
    """
    获取章节摘要列表
    """
    try:
        import os
        from pathlib import Path
        
        agent = get_storytelling_agent()
        
        # 列出所有章节摘要文件
        summaries_dir = Path("/tmp/teaching-agents/storytelling") / book_id / "summaries"
        if not summaries_dir.exists():
            return []
        
        summaries = []
        for filename in sorted(os.listdir(summaries_dir)):
            if filename.endswith(".json"):
                data = agent.read_json(book_id, f"summaries/{filename}")
                if data:
                    summaries.append(data)
        
        return summaries
        
    except Exception as e:
        logger.error(f"Get summaries failed: {e}")
        return []


@router.get("/overview/{book_id}")
async def get_overview(book_id: str):
    """
    获取全书视角
    """
    try:
        agent = get_storytelling_agent()
        
        overview = agent.read_json(book_id, "understanding/book_overview.json")
        if not overview:
            return {}
        
        return overview
        
    except Exception as e:
        logger.error(f"Get overview failed: {e}")
        return {}


@router.get("/plan/{book_id}")
async def get_plan(book_id: str):
    """
    获取分集规划
    """
    try:
        agent = get_storytelling_agent()
        
        plan = agent.read_json(book_id, "plan/episode_plan.json")
        if not plan:
            return {"episodes": []}
        
        return plan
        
    except Exception as e:
        logger.error(f"Get plan failed: {e}")
        return {"episodes": []}


@router.get("/recent")
async def get_recent_projects():
    """
    获取最近的讲书项目列表
    """
    try:
        import os
        from pathlib import Path
        
        agent = get_storytelling_agent()
        base_dir = Path("/tmp/teaching-agents/storytelling")
        
        if not base_dir.exists():
            return {"projects": []}
        
        projects = []
        
        # 遍历所有项目目录
        for project_dir in base_dir.iterdir():
            if not project_dir.is_dir():
                continue
                
            book_id = project_dir.name
            
            # 读取状态
            state = agent.read_json(book_id, "progress/state.json")
            if not state:
                continue
            
            projects.append({
                "id": book_id,
                "title": state.get("book_title", "未知书籍"),
                "status": state.get("status", "unknown"),
                "phase": state.get("phase", "unknown"),
                "total_chapters": state.get("total_chapters", 0),
                "processed_chapters": state.get("processed_chapters", 0),
                "total_episodes": state.get("total_episodes", 0),
                "ready_episodes": state.get("ready_episodes", 0),
                "updated_at": os.path.getmtime(project_dir / "progress" / "state.json") if (project_dir / "progress" / "state.json").exists() else 0,
            })
        
        # 按更新时间排序
        projects.sort(key=lambda x: x.get("updated_at", 0), reverse=True)
        
        # 移除 updated_at 字段
        for p in projects:
            p.pop("updated_at", None)
        
        return {"projects": projects[:10]}  # 最多返回 10 个
        
    except Exception as e:
        logger.error(f"Get recent projects failed: {e}")
        return {"projects": []}

