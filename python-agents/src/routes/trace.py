"""
执行追踪 API 路由

提供查看 Agent 执行步骤和思考过程的 API。
"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import PlainTextResponse

from ..agents.trace import get_tracer

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/list")
async def list_traces(limit: int = Query(default=20, le=100)):
    """列出所有追踪"""
    tracer = get_tracer()
    traces = list(tracer.traces.values())
    
    # 按开始时间倒序
    traces.sort(key=lambda t: t.start_time, reverse=True)
    
    return {
        "traces": [
            {
                "id": t.id,
                "name": t.name,
                "status": t.status,
                "start_time": t.start_time.isoformat(),
                "end_time": t.end_time.isoformat() if t.end_time else None,
                "duration_ms": t.total_duration_ms,
                "steps_count": len(t.steps),
            }
            for t in traces[:limit]
        ],
        "total": len(traces),
    }


@router.get("/{trace_id}")
async def get_trace(trace_id: str):
    """获取追踪详情"""
    tracer = get_tracer()
    trace = tracer.get_trace(trace_id)
    
    if not trace:
        # 尝试从文件加载
        loaded = tracer.load_trace(trace_id)
        if loaded:
            return loaded
        raise HTTPException(status_code=404, detail="Trace not found")
    
    return trace.to_dict()


@router.get("/{trace_id}/steps")
async def get_trace_steps(trace_id: str):
    """获取追踪的所有步骤"""
    tracer = get_tracer()
    trace = tracer.get_trace(trace_id)
    
    if not trace:
        raise HTTPException(status_code=404, detail="Trace not found")
    
    return {
        "trace_id": trace_id,
        "steps": [s.to_dict() for s in trace.steps],
        "count": len(trace.steps),
    }


@router.get("/{trace_id}/reasoning")
async def get_trace_reasoning(trace_id: str):
    """获取追踪中的所有思考过程"""
    tracer = get_tracer()
    trace = tracer.get_trace(trace_id)
    
    if not trace:
        raise HTTPException(status_code=404, detail="Trace not found")
    
    reasoning_steps = [
        {
            "step_name": s.name,
            "reasoning": s.reasoning,
            "decision": s.decision,
            "timestamp": s.timestamp.isoformat(),
        }
        for s in trace.steps
        if s.reasoning or s.decision
    ]
    
    return {
        "trace_id": trace_id,
        "reasoning": reasoning_steps,
        "count": len(reasoning_steps),
    }


@router.get("/{trace_id}/export")
async def export_trace(
    trace_id: str,
    format: str = Query(default="json", pattern="^(json|markdown|timeline)$"),
):
    """
    导出追踪数据
    
    支持格式：
    - json: JSON 格式
    - markdown: Markdown 文档
    - timeline: 时间线文本
    """
    tracer = get_tracer()
    exported = tracer.export_trace(trace_id, format)
    
    if not exported:
        raise HTTPException(status_code=404, detail="Trace not found")
    
    if format == "json":
        return {"data": exported}
    else:
        return PlainTextResponse(content=exported, media_type="text/plain")


@router.get("/{trace_id}/timeline")
async def get_trace_timeline(trace_id: str):
    """获取追踪的时间线视图"""
    tracer = get_tracer()
    trace = tracer.get_trace(trace_id)
    
    if not trace:
        raise HTTPException(status_code=404, detail="Trace not found")
    
    timeline = []
    
    # 开始事件
    timeline.append({
        "time": trace.start_time.isoformat(),
        "type": "start",
        "message": f"开始执行: {trace.name}",
    })
    
    # 步骤事件
    for step in trace.steps:
        event = {
            "time": step.timestamp.isoformat(),
            "type": step.type.value,
            "name": step.name,
            "duration_ms": step.duration_ms,
        }
        
        if step.reasoning:
            event["reasoning"] = step.reasoning
        if step.decision:
            event["decision"] = step.decision
        if step.error:
            event["error"] = step.error
        
        timeline.append(event)
    
    # 结束事件
    if trace.end_time:
        timeline.append({
            "time": trace.end_time.isoformat(),
            "type": "end",
            "message": f"执行完成: {trace.status}",
            "total_duration_ms": trace.total_duration_ms,
        })
    
    return {
        "trace_id": trace_id,
        "name": trace.name,
        "status": trace.status,
        "timeline": timeline,
    }


@router.delete("/{trace_id}")
async def delete_trace(trace_id: str):
    """删除追踪"""
    tracer = get_tracer()
    
    if trace_id in tracer.traces:
        del tracer.traces[trace_id]
        return {"message": "Trace deleted"}
    
    raise HTTPException(status_code=404, detail="Trace not found")

