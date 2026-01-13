"""
实时流式 PPT 渲染 API

使用 SSE 实时发送 AI 思考过程
"""

import asyncio
import json
import logging
from typing import AsyncGenerator
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..agents.trace import TraceManager, StepType

logger = logging.getLogger(__name__)
router = APIRouter()


class StreamRenderRequest(BaseModel):
    slidev_md: str
    kb_type: str = "tech"
    enable_decoration: bool = True
    enable_qa: bool = True
    session_id: str | None = None


class SSETracer(TraceManager):
    """
    支持 SSE 实时推送的 Tracer
    
    每次记录事件时，同时推送到 SSE 队列
    """
    
    def __init__(self):
        super().__init__()
        self.event_queue: asyncio.Queue = asyncio.Queue()
        self._closed = False
    
    async def send_event(self, event_type: str, data: dict):
        """发送 SSE 事件"""
        if not self._closed:
            await self.event_queue.put({
                "type": event_type,
                **data
            })
    
    def add_reasoning(self, trace_id: str, reasoning: str, name: str = "reasoning", metadata=None) -> str:
        """添加思考过程并发送 SSE"""
        # 直接记录，不调用 start_step（避免重复事件）
        from ..agents.trace import TraceStep, StepType
        import uuid
        from datetime import datetime
        
        step_id = str(uuid.uuid4())
        step = TraceStep(
            id=step_id,
            type=StepType.REASONING,
            name=name,
            reasoning=reasoning,
            metadata=metadata or {},
        )
        if trace_id in self.traces:
            self.traces[trace_id].steps.append(step)
        
        # 发送 SSE 事件（只发送内容，不发送类型标签）
        asyncio.create_task(self.send_event("thinking", {
            "content": reasoning,
        }))
        return step_id
    
    def add_decision(self, trace_id: str, decision: str, name: str = "decision", context=None) -> str:
        """添加决策并发送 SSE"""
        from ..agents.trace import TraceStep, StepType
        import uuid
        
        step_id = str(uuid.uuid4())
        step = TraceStep(
            id=step_id,
            type=StepType.DECISION,
            name=name,
            input=context,
        )
        step.decision = decision
        if trace_id in self.traces:
            self.traces[trace_id].steps.append(step)
        
        # 发送 SSE 事件（只发送内容）
        asyncio.create_task(self.send_event("planning", {
            "content": decision,
        }))
        return step_id
    
    def start_step(self, trace_id, step_type, name, input_data=None, reasoning=None, parent_id=None, metadata=None) -> str:
        """开始步骤并发送 SSE"""
        step_id = super().start_step(trace_id, step_type, name, input_data, reasoning, parent_id, metadata)
        # 只为非 reasoning/decision 类型发送执行事件
        step_type_value = step_type.value if hasattr(step_type, 'value') else str(step_type)
        if step_type_value not in ('reasoning', 'decision'):
            asyncio.create_task(self.send_event("executing", {
                "content": name,
            }))
        return step_id
    
    def end_step(self, trace_id, step_id, output=None, error=None, decision=None):
        """结束步骤"""
        super().end_step(trace_id, step_id, output, error, decision)
    
    async def close(self):
        """关闭队列"""
        self._closed = True
        await self.event_queue.put(None)  # 发送结束信号


async def sse_generator(
    tracer: SSETracer,
    render_task: asyncio.Task,
    trace_id: str,
) -> AsyncGenerator[str, None]:
    """
    SSE 事件生成器
    
    同时监听 tracer 队列和渲染任务
    """
    try:
        while True:
            # 检查渲染任务是否完成
            if render_task.done():
                # 先清空队列中剩余的事件
                while not tracer.event_queue.empty():
                    try:
                        event = tracer.event_queue.get_nowait()
                        if event:
                            yield f"data: {json.dumps(event)}\n\n"
                    except:
                        break
                
                # 获取结果或异常
                try:
                    result = render_task.result()
                    # 不通过 SSE 发送 slides 数据（太大），只发送计数信息
                    yield f"data: {json.dumps({'type': 'complete', 'message': '✨ PPT 生成完成', 'total_count': result.get('total_count', 0), 'decorated_count': result.get('decorated_count', 0), 'trace_id': trace_id})}\n\n"
                    # 直接返回完整结果供调用者使用
                    yield f"data: {json.dumps({'type': 'result', 'data': result})}\n\n"
                except Exception as e:
                    logger.error(f"Render task failed: {e}", exc_info=True)
                    yield f"data: {json.dumps({'type': 'error', 'message': 'PPT 生成失败', 'error': str(e)})}\n\n"
                break
            
            # 尝试从队列获取事件（超时 0.5 秒）
            try:
                event = await asyncio.wait_for(tracer.event_queue.get(), timeout=0.5)
                if event is None:  # 结束信号
                    break
                yield f"data: {json.dumps(event)}\n\n"
            except asyncio.TimeoutError:
                # 发送心跳保持连接
                yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
                continue
                
    except Exception as e:
        logger.error(f"SSE generator error: {e}", exc_info=True)
        yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
    finally:
        await tracer.close()


@router.post("/render-slides/stream")
async def render_slides_stream(request: StreamRenderRequest):
    """
    流式 PPT 渲染
    
    使用 SSE 实时推送 AI 思考过程
    """
    from ..agents.teaching_agent import TeachingAgent
    from ..agents.subagents.slide_designer import render_slides
    
    # 创建支持 SSE 的 tracer
    sse_tracer = SSETracer()
    
    # 创建 agent（使用 SSE tracer）
    agent = TeachingAgent()
    agent.tracer = sse_tracer
    
    # 开始 trace
    trace_id = sse_tracer.start_trace(
        name="render_slides",
        input_data={
            "kb_type": request.kb_type,
            "content_length": len(request.slidev_md),
        }
    )
    
    # 发送开始事件
    await sse_tracer.send_event("start", {
        "message": "🚀 启动 SlideDesigner Agent",
        "trace_id": trace_id,
    })
    
    async def do_render():
        """执行渲染任务"""
        try:
            result = await render_slides(
                slidev_md=request.slidev_md,
                llm_client=agent.llm,
                kb_type=request.kb_type,
                enable_decoration=request.enable_decoration,
                enable_qa=request.enable_qa,
                tracer=sse_tracer,
                trace_id=trace_id,
            )
            sse_tracer.end_trace(trace_id, output={"success": True}, status="completed")
            return result
        except Exception as e:
            sse_tracer.end_trace(trace_id, status="failed")
            raise
    
    # 启动渲染任务（不等待）
    render_task = asyncio.create_task(do_render())
    
    # 返回 SSE 流
    return StreamingResponse(
        sse_generator(sse_tracer, render_task, trace_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )

