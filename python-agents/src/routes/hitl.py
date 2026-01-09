"""
Human-in-the-Loop (HITL) API 路由

提供人工审核相关的 API 端点。
"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..agents.hitl import Decision, CheckpointType

logger = logging.getLogger(__name__)
router = APIRouter()

# 从 teaching 路由导入会话存储
from .teaching import _sessions


# ==================== 请求/响应模型 ====================


class ResolveCheckpointRequest(BaseModel):
    """解决检查点请求"""
    checkpoint_id: str
    decision: str  # approve | edit | reject
    feedback: Optional[str] = None
    edited_data: Optional[dict] = None


class CheckpointResponse(BaseModel):
    """检查点响应"""
    id: str
    type: str
    message: str
    data: dict
    created_at: str
    status: str
    decision: Optional[str] = None
    feedback: Optional[str] = None
    resolved_at: Optional[str] = None


# ==================== API 端点 ====================


@router.get("/session/{session_id}/checkpoints")
async def get_pending_checkpoints(session_id: str):
    """获取会话中待处理的检查点"""
    if session_id not in _sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    agent = _sessions[session_id]
    checkpoints = agent.hitl.get_pending_checkpoints()
    
    return {
        "session_id": session_id,
        "pending_checkpoints": checkpoints,
        "count": len(checkpoints),
    }


@router.get("/session/{session_id}/checkpoint/{checkpoint_id}")
async def get_checkpoint(session_id: str, checkpoint_id: str):
    """获取检查点详情"""
    if session_id not in _sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    agent = _sessions[session_id]
    info = agent.hitl.get_checkpoint_info(checkpoint_id)
    
    if not info:
        raise HTTPException(status_code=404, detail="Checkpoint not found")
    
    return info


@router.post("/session/{session_id}/checkpoint/resolve")
async def resolve_checkpoint(session_id: str, request: ResolveCheckpointRequest):
    """
    解决检查点（提交用户决策）
    
    用户可以：
    - approve: 通过，继续执行
    - edit: 修改内容后继续
    - reject: 拒绝，终止流程
    """
    if session_id not in _sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # 验证 decision
    try:
        decision = Decision(request.decision)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid decision: {request.decision}. Must be one of: approve, edit, reject"
        )
    
    agent = _sessions[session_id]
    success = agent.hitl.resolve_checkpoint(
        checkpoint_id=request.checkpoint_id,
        decision=decision,
        feedback=request.feedback,
        edited_data=request.edited_data,
    )
    
    if not success:
        raise HTTPException(status_code=404, detail="Checkpoint not found or already resolved")
    
    return {
        "success": True,
        "checkpoint_id": request.checkpoint_id,
        "decision": decision.value,
    }


@router.get("/session/{session_id}/hitl/status")
async def get_hitl_status(session_id: str):
    """获取会话的 HITL 状态"""
    if session_id not in _sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    agent = _sessions[session_id]
    config = agent.hitl.config
    
    return {
        "session_id": session_id,
        "hitl_enabled": config.enabled,
        "enabled_checkpoints": [cp.value for cp in config.checkpoints],
        "timeout_seconds": config.timeout_seconds,
        "auto_approve_score": config.auto_approve_score,
        "pending_count": len(agent.hitl.pending_checkpoints),
        "history_count": len(agent.hitl.history),
    }


@router.post("/session/{session_id}/hitl/configure")
async def configure_hitl(
    session_id: str,
    enabled: bool = True,
    checkpoints: Optional[list[str]] = None,
    timeout_seconds: int = 3600,
    auto_approve_score: int = 8,
):
    """
    配置会话的 HITL 设置
    
    Args:
        enabled: 是否启用 HITL
        checkpoints: 启用的检查点列表 ["plan_review", "draft_review", "final_approval"]
        timeout_seconds: 超时时间（秒）
        auto_approve_score: 自动通过的评分阈值
    """
    if session_id not in _sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # 解析检查点类型
    checkpoint_types = []
    if checkpoints:
        for cp in checkpoints:
            try:
                checkpoint_types.append(CheckpointType(cp))
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid checkpoint type: {cp}"
                )
    
    agent = _sessions[session_id]
    agent.hitl.config.enabled = enabled
    agent.hitl.config.checkpoints = checkpoint_types
    agent.hitl.config.timeout_seconds = timeout_seconds
    agent.hitl.config.auto_approve_score = auto_approve_score
    
    return {
        "success": True,
        "session_id": session_id,
        "config": {
            "enabled": enabled,
            "checkpoints": [cp.value for cp in checkpoint_types],
            "timeout_seconds": timeout_seconds,
            "auto_approve_score": auto_approve_score,
        }
    }

