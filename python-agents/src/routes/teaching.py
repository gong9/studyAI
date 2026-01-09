"""
教学 Agent API 路由

支持：
1. 单步执行（plan/draft/enrich）
2. 完整流水线（pipeline）
3. 状态查询（todos/files）
4. SSE 流式输出
"""

import json
import logging
import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..agents.teaching_agent import TeachingAgent, get_teaching_agent, reset_teaching_agent

logger = logging.getLogger(__name__)
router = APIRouter()

# 会话存储（生产环境应使用 Redis）
_sessions: dict[str, TeachingAgent] = {}


def get_or_create_session(session_id: Optional[str] = None) -> tuple[str, TeachingAgent]:
    """获取或创建会话"""
    if session_id and session_id in _sessions:
        return session_id, _sessions[session_id]
    
    new_id = session_id or str(uuid.uuid4())
    agent = TeachingAgent()
    _sessions[new_id] = agent
    return new_id, agent


# ==================== 请求/响应模型 ====================


class PlanRequest(BaseModel):
    """教学规划请求"""
    knowledge_base_id: str
    chapter_title: str
    chapter_content: str
    scene_type: str = "general"
    session_id: Optional[str] = None


class PlanResponse(BaseModel):
    """教学规划响应"""
    success: bool
    plan: Optional[dict] = None
    session_id: Optional[str] = None
    todos: Optional[list] = None
    error: Optional[str] = None


class DraftRequest(BaseModel):
    """手稿生成请求"""
    knowledge_base_id: str
    plan: dict
    chapter_key_points: Optional[list] = None
    chapter_summary: Optional[str] = None
    chapter_content: Optional[str] = None
    session_id: Optional[str] = None


class DraftResponse(BaseModel):
    """手稿生成响应"""
    success: bool
    markdown: Optional[str] = None
    session_id: Optional[str] = None
    todos: Optional[list] = None
    error: Optional[str] = None


class EnrichRequest(BaseModel):
    """润色请求"""
    knowledge_base_id: str
    draft_content: str
    plan: dict
    session_id: Optional[str] = None


class EnrichResponse(BaseModel):
    """润色响应"""
    success: bool
    enriched_content: Optional[str] = None
    review_notes: Optional[list] = None
    review: Optional[dict] = None
    session_id: Optional[str] = None
    todos: Optional[list] = None
    error: Optional[str] = None


class PipelineRequest(BaseModel):
    """完整流水线请求"""
    knowledge_base_id: str
    chapter_title: str
    chapter_content: str
    scene_type: str = "general"
    session_id: Optional[str] = None


class PipelineResponse(BaseModel):
    """完整流水线响应"""
    success: bool
    plan: Optional[dict] = None
    draft: Optional[str] = None
    review: Optional[dict] = None
    enriched_content: Optional[str] = None
    output_path: Optional[str] = None
    session_id: Optional[str] = None
    todos: Optional[list] = None
    error: Optional[str] = None


class ProcessManuscriptRequest(BaseModel):
    """处理用户手稿请求"""
    knowledge_base_id: str
    manuscript_content: str
    scene_type: str = "general"
    skip_review: bool = False
    skip_enrich: bool = False
    auto_format: bool = True
    session_id: Optional[str] = None


class ProcessManuscriptResponse(BaseModel):
    """处理用户手稿响应"""
    success: bool
    plan: Optional[dict] = None
    original_content: Optional[str] = None
    processed_content: Optional[str] = None
    review: Optional[dict] = None
    output_path: Optional[str] = None
    session_id: Optional[str] = None
    todos: Optional[list] = None
    trace_id: Optional[str] = None
    error: Optional[str] = None


# ==================== API 端点 ====================


@router.post("/plan", response_model=PlanResponse)
async def generate_plan(request: PlanRequest) -> PlanResponse:
    """
    生成教学规划
    
    根据章节内容生成教学规划，包括教学目标、核心概念、节次安排等。
    使用 deepagents 的 write_todos 追踪任务进度。
    """
    try:
        logger.info(f"Generating plan for chapter: {request.chapter_title}")
        
        session_id, agent = get_or_create_session(request.session_id)
        
        result = await agent.generate_plan(
            knowledge_base_id=request.knowledge_base_id,
            chapter_title=request.chapter_title,
            chapter_content=request.chapter_content,
            scene_type=request.scene_type,
        )
        
        return PlanResponse(
            success=True,
            plan=result,
            session_id=session_id,
            todos=agent.get_todos(),
        )
        
    except Exception as e:
        logger.error(f"Plan generation failed: {e}", exc_info=True)
        return PlanResponse(success=False, error=str(e))


@router.post("/draft", response_model=DraftResponse)
async def generate_draft(request: DraftRequest) -> DraftResponse:
    """
    生成手稿初稿
    
    根据教学规划生成 Markdown 格式的教学手稿。
    通过 RAG 检索相关教材内容辅助生成。
    """
    try:
        logger.info(f"Generating draft for KB: {request.knowledge_base_id}")
        
        session_id, agent = get_or_create_session(request.session_id)
        
        result = await agent.generate_draft(
            knowledge_base_id=request.knowledge_base_id,
            plan=request.plan,
            chapter_key_points=request.chapter_key_points,
            chapter_summary=request.chapter_summary,
            chapter_content=request.chapter_content,
        )
        
        return DraftResponse(
            success=True,
            markdown=result,
            session_id=session_id,
            todos=agent.get_todos(),
        )
        
    except Exception as e:
        logger.error(f"Draft generation failed: {e}", exc_info=True)
        return DraftResponse(success=False, error=str(e))


@router.post("/enrich", response_model=EnrichResponse)
async def enrich_draft(request: EnrichRequest) -> EnrichResponse:
    """
    审核并润色手稿
    
    1. 审核手稿质量（多维度评估）
    2. 根据审核建议进行智能润色
    3. RAG 检索补充遗漏内容
    """
    try:
        logger.info(f"Enriching draft for KB: {request.knowledge_base_id}")
        
        session_id, agent = get_or_create_session(request.session_id)
        
        result = await agent.review_and_enrich(
            knowledge_base_id=request.knowledge_base_id,
            draft_content=request.draft_content,
            plan=request.plan,
        )
        
        return EnrichResponse(
            success=True,
            enriched_content=result.get("enriched_content"),
            review_notes=result.get("review_notes"),
            review=result.get("review"),
            session_id=session_id,
            todos=agent.get_todos(),
        )
        
    except Exception as e:
        logger.error(f"Enrich failed: {e}", exc_info=True)
        return EnrichResponse(success=False, error=str(e))


@router.post("/process-manuscript", response_model=ProcessManuscriptResponse)
async def process_user_manuscript(request: ProcessManuscriptRequest) -> ProcessManuscriptResponse:
    """
    处理用户手写的手稿
    
    用户直接在编辑器中写手稿，然后通过此接口处理：
    1. 分析手稿结构
    2. 可选：审核质量
    3. 可选：RAG 补充润色
    4. 输出处理后的手稿（用于渲染 HTML）
    """
    try:
        logger.info(f"Processing user manuscript for KB: {request.knowledge_base_id}")
        
        session_id, agent = get_or_create_session(request.session_id)
        
        result = await agent.process_user_manuscript(
            knowledge_base_id=request.knowledge_base_id,
            manuscript_content=request.manuscript_content,
            scene_type=request.scene_type,
            options={
                "skip_review": request.skip_review,
                "skip_enrich": request.skip_enrich,
                "auto_format": request.auto_format,
            },
        )
        
        return ProcessManuscriptResponse(
            success=True,
            plan=result.get("plan"),
            original_content=result.get("original_content"),
            processed_content=result.get("processed_content"),
            review=result.get("review"),
            output_path=result.get("output_path"),
            session_id=session_id,
            todos=result.get("todos"),
            trace_id=result.get("trace_id"),
        )
        
    except Exception as e:
        logger.error(f"Process manuscript failed: {e}", exc_info=True)
        return ProcessManuscriptResponse(success=False, error=str(e))


@router.post("/pipeline", response_model=PipelineResponse)
async def run_pipeline(request: PipelineRequest) -> PipelineResponse:
    """
    运行完整的课件生成流水线
    
    执行完整的 规划 -> 手稿 -> 审核 -> 润色 流程。
    使用 deepagents 的任务规划和子 Agent 委托能力。
    """
    try:
        logger.info(f"Running pipeline for: {request.chapter_title}")
        
        session_id, agent = get_or_create_session(request.session_id)
        
        result = await agent.full_pipeline(
            knowledge_base_id=request.knowledge_base_id,
            chapter_title=request.chapter_title,
            chapter_content=request.chapter_content,
            scene_type=request.scene_type,
        )
        
        return PipelineResponse(
            success=True,
            plan=result.get("plan"),
            draft=result.get("draft"),
            review=result.get("review"),
            enriched_content=result.get("enriched_content"),
            output_path=result.get("output_path"),
            session_id=session_id,
            todos=result.get("todos"),
        )
        
    except Exception as e:
        logger.error(f"Pipeline failed: {e}", exc_info=True)
        return PipelineResponse(success=False, error=str(e))


@router.post("/pipeline/stream")
async def run_pipeline_stream(request: PipelineRequest):
    """
    流式运行完整的课件生成流水线
    
    使用 SSE 实时推送进度和结果。
    """
    async def generate():
        try:
            session_id, agent = get_or_create_session(request.session_id)
            
            # 发送会话 ID
            yield f"data: {json.dumps({'type': 'session', 'session_id': session_id})}\n\n"
            
            # 发送开始事件
            yield f"data: {json.dumps({'type': 'start', 'message': '开始生成课件...'})}\n\n"
            
            # Step 1: 规划
            yield f"data: {json.dumps({'type': 'progress', 'step': 'plan', 'status': 'running'})}\n\n"
            
            plan = await agent.generate_plan(
                knowledge_base_id=request.knowledge_base_id,
                chapter_title=request.chapter_title,
                chapter_content=request.chapter_content,
                scene_type=request.scene_type,
            )
            
            yield f"data: {json.dumps({'type': 'progress', 'step': 'plan', 'status': 'completed', 'data': plan})}\n\n"
            
            # Step 2: 手稿
            yield f"data: {json.dumps({'type': 'progress', 'step': 'draft', 'status': 'running'})}\n\n"
            
            draft = await agent.generate_draft(
                knowledge_base_id=request.knowledge_base_id,
                plan=plan,
                chapter_content=request.chapter_content,
            )
            
            yield f"data: {json.dumps({'type': 'progress', 'step': 'draft', 'status': 'completed', 'data': {'markdown': draft[:500] + '...'}})}\n\n"
            
            # Step 3: 审核润色
            yield f"data: {json.dumps({'type': 'progress', 'step': 'enrich', 'status': 'running'})}\n\n"
            
            result = await agent.review_and_enrich(
                knowledge_base_id=request.knowledge_base_id,
                draft_content=draft,
                plan=plan,
            )
            
            yield f"data: {json.dumps({'type': 'progress', 'step': 'enrich', 'status': 'completed'})}\n\n"
            
            # 发送完成事件
            final_result = {
                "plan": plan,
                "draft": draft,
                "enriched_content": result.get("enriched_content"),
                "review": result.get("review"),
                "todos": agent.get_todos(),
            }
            
            yield f"data: {json.dumps({'type': 'complete', 'data': final_result})}\n\n"
            
        except Exception as e:
            logger.error(f"Stream pipeline failed: {e}", exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


# ==================== 状态查询端点 ====================


@router.get("/session/{session_id}/todos")
async def get_session_todos(session_id: str):
    """获取会话的任务列表"""
    if session_id not in _sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    agent = _sessions[session_id]
    return {
        "session_id": session_id,
        "todos": agent.get_todos(),
    }


@router.get("/session/{session_id}/files")
async def get_session_files(session_id: str):
    """获取会话的文件列表"""
    if session_id not in _sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    agent = _sessions[session_id]
    return {
        "session_id": session_id,
        "files": list(agent.files.keys()),
    }


@router.get("/session/{session_id}/file")
async def get_session_file(session_id: str, path: str):
    """获取会话的指定文件内容"""
    if session_id not in _sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    agent = _sessions[session_id]
    content = agent.read_file(path)
    
    if content is None:
        raise HTTPException(status_code=404, detail="File not found")
    
    return {
        "path": path,
        "content": content,
    }


@router.delete("/session/{session_id}")
async def delete_session(session_id: str):
    """删除会话"""
    if session_id in _sessions:
        del _sessions[session_id]
        return {"message": "Session deleted"}
    
    raise HTTPException(status_code=404, detail="Session not found")


@router.get("/status")
async def get_status():
    """获取服务状态"""
    return {
        "status": "ready",
        "active_sessions": len(_sessions),
        "session_ids": list(_sessions.keys()),
    }
