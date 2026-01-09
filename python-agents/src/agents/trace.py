"""
执行追踪（Trace）模块

记录 Agent 的：
1. 执行步骤（Steps）
2. 思考过程（Reasoning）
3. 决策依据（Decisions）
4. 工具调用（Tool Calls）
5. 时间线（Timeline）
"""

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Optional
from pathlib import Path
import uuid

logger = logging.getLogger(__name__)


class StepType(str, Enum):
    """步骤类型"""

    PLANNING = "planning"  # 任务规划
    REASONING = "reasoning"  # 思考推理
    TOOL_CALL = "tool_call"  # 工具调用
    SUBAGENT = "subagent"  # 子 Agent 委托
    DECISION = "decision"  # 决策点
    OUTPUT = "output"  # 输出结果
    ERROR = "error"  # 错误
    HITL = "hitl"  # 人工审核


@dataclass
class TraceStep:
    """执行步骤"""

    id: str
    type: StepType
    name: str
    input: Optional[dict] = None
    output: Optional[dict] = None
    reasoning: Optional[str] = None  # 思考过程
    decision: Optional[str] = None  # 决策说明
    duration_ms: Optional[int] = None
    timestamp: datetime = field(default_factory=datetime.now)
    parent_id: Optional[str] = None  # 父步骤 ID（用于嵌套）
    metadata: dict = field(default_factory=dict)
    error: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "type": self.type.value,
            "name": self.name,
            "input": self.input,
            "output": self.output,
            "reasoning": self.reasoning,
            "decision": self.decision,
            "duration_ms": self.duration_ms,
            "timestamp": self.timestamp.isoformat(),
            "parent_id": self.parent_id,
            "metadata": self.metadata,
            "error": self.error,
        }


@dataclass
class Trace:
    """完整执行追踪"""

    id: str
    name: str
    input: dict
    steps: list[TraceStep] = field(default_factory=list)
    output: Optional[dict] = None
    status: str = "running"  # running | completed | failed
    start_time: datetime = field(default_factory=datetime.now)
    end_time: Optional[datetime] = None
    total_duration_ms: Optional[int] = None
    metadata: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "input": self.input,
            "steps": [s.to_dict() for s in self.steps],
            "output": self.output,
            "status": self.status,
            "start_time": self.start_time.isoformat(),
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "total_duration_ms": self.total_duration_ms,
            "metadata": self.metadata,
        }


class TraceManager:
    """
    执行追踪管理器

    使用示例：
    ```python
    tracer = TraceManager()

    # 开始追踪
    trace_id = tracer.start_trace("full_pipeline", {"chapter": "线性方程组"})

    # 记录思考过程
    tracer.add_reasoning(trace_id, "分析章节结构，发现包含3个主要概念...")

    # 记录工具调用
    step_id = tracer.start_step(trace_id, StepType.TOOL_CALL, "rag_search", {"query": "线性方程"})
    tracer.end_step(trace_id, step_id, {"results": [...]})

    # 记录决策
    tracer.add_decision(trace_id, "规划生成完成，评分8分，决定继续生成手稿")

    # 结束追踪
    tracer.end_trace(trace_id, {"manuscript": "..."})
    ```
    """

    def __init__(self, persist_dir: Optional[Path] = None):
        self.traces: dict[str, Trace] = {}
        self.persist_dir = persist_dir
        if persist_dir:
            persist_dir.mkdir(parents=True, exist_ok=True)

    # ==================== Trace 管理 ====================

    def start_trace(
        self,
        name: str,
        input_data: dict,
        metadata: Optional[dict] = None,
    ) -> str:
        """开始新的执行追踪"""
        trace_id = str(uuid.uuid4())
        trace = Trace(
            id=trace_id,
            name=name,
            input=input_data,
            metadata=metadata or {},
        )
        self.traces[trace_id] = trace
        logger.info(f"[Trace] Started: {trace_id} - {name}")
        return trace_id

    def end_trace(
        self,
        trace_id: str,
        output: Optional[dict] = None,
        status: str = "completed",
    ) -> Optional[Trace]:
        """结束执行追踪"""
        if trace_id not in self.traces:
            return None

        trace = self.traces[trace_id]
        trace.output = output
        trace.status = status
        trace.end_time = datetime.now()
        trace.total_duration_ms = int(
            (trace.end_time - trace.start_time).total_seconds() * 1000
        )

        logger.info(
            f"[Trace] Ended: {trace_id} - {status} ({trace.total_duration_ms}ms)"
        )

        # 持久化
        if self.persist_dir:
            self._persist_trace(trace)

        return trace

    def get_trace(self, trace_id: str) -> Optional[Trace]:
        """获取追踪"""
        return self.traces.get(trace_id)

    # ==================== Step 管理 ====================

    def start_step(
        self,
        trace_id: str,
        step_type: StepType,
        name: str,
        input_data: Optional[dict] = None,
        reasoning: Optional[str] = None,
        parent_id: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> str:
        """开始新的执行步骤"""
        if trace_id not in self.traces:
            raise ValueError(f"Trace {trace_id} not found")

        step_id = str(uuid.uuid4())
        step = TraceStep(
            id=step_id,
            type=step_type,
            name=name,
            input=input_data,
            reasoning=reasoning,
            parent_id=parent_id,
            metadata=metadata or {},
        )
        self.traces[trace_id].steps.append(step)

        logger.debug(f"[Trace] Step started: {step_type.value} - {name}")
        return step_id

    def end_step(
        self,
        trace_id: str,
        step_id: str,
        output: Optional[dict] = None,
        error: Optional[str] = None,
        decision: Optional[str] = None,
    ) -> None:
        """结束执行步骤"""
        if trace_id not in self.traces:
            return

        for step in self.traces[trace_id].steps:
            if step.id == step_id:
                step.output = output
                step.error = error
                step.decision = decision
                step.duration_ms = int(
                    (datetime.now() - step.timestamp).total_seconds() * 1000
                )
                logger.debug(f"[Trace] Step ended: {step.name} ({step.duration_ms}ms)")
                break

    # ==================== 便捷方法 ====================

    def add_reasoning(
        self,
        trace_id: str,
        reasoning: str,
        name: str = "reasoning",
        metadata: Optional[dict] = None,
    ) -> str:
        """添加思考过程"""
        step_id = self.start_step(
            trace_id=trace_id,
            step_type=StepType.REASONING,
            name=name,
            reasoning=reasoning,
            metadata=metadata,
        )
        self.end_step(trace_id, step_id)
        logger.info(f"[Trace] Reasoning: {reasoning[:100]}...")
        return step_id

    def add_decision(
        self,
        trace_id: str,
        decision: str,
        name: str = "decision",
        context: Optional[dict] = None,
    ) -> str:
        """添加决策点"""
        step_id = self.start_step(
            trace_id=trace_id,
            step_type=StepType.DECISION,
            name=name,
            input_data=context,
        )
        self.end_step(trace_id, step_id, decision=decision)
        logger.info(f"[Trace] Decision: {decision}")
        return step_id

    def add_tool_call(
        self,
        trace_id: str,
        tool_name: str,
        input_data: dict,
        output: dict,
        duration_ms: Optional[int] = None,
    ) -> str:
        """添加工具调用记录"""
        step_id = self.start_step(
            trace_id=trace_id,
            step_type=StepType.TOOL_CALL,
            name=tool_name,
            input_data=input_data,
        )
        self.end_step(trace_id, step_id, output=output)
        return step_id

    def add_subagent_call(
        self,
        trace_id: str,
        agent_name: str,
        input_data: dict,
        output: dict,
        reasoning: Optional[str] = None,
    ) -> str:
        """添加子 Agent 调用记录"""
        step_id = self.start_step(
            trace_id=trace_id,
            step_type=StepType.SUBAGENT,
            name=agent_name,
            input_data=input_data,
            reasoning=reasoning,
        )
        self.end_step(trace_id, step_id, output=output)
        return step_id

    def add_error(
        self,
        trace_id: str,
        error: str,
        context: Optional[dict] = None,
    ) -> str:
        """添加错误记录"""
        step_id = self.start_step(
            trace_id=trace_id,
            step_type=StepType.ERROR,
            name="error",
            input_data=context,
        )
        self.end_step(trace_id, step_id, error=error)
        logger.error(f"[Trace] Error: {error}")
        return step_id

    # ==================== 持久化 ====================

    def _persist_trace(self, trace: Trace) -> None:
        """持久化追踪到文件"""
        if not self.persist_dir:
            return

        file_path = self.persist_dir / f"{trace.id}.json"
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(trace.to_dict(), f, ensure_ascii=False, indent=2)
        logger.debug(f"[Trace] Persisted to: {file_path}")

    def load_trace(self, trace_id: str) -> Optional[dict]:
        """从文件加载追踪"""
        if not self.persist_dir:
            return None

        file_path = self.persist_dir / f"{trace_id}.json"
        if not file_path.exists():
            return None

        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)

    # ==================== 导出 ====================

    def export_trace(self, trace_id: str, format: str = "json") -> Optional[str]:
        """
        导出追踪数据

        Args:
            trace_id: 追踪 ID
            format: 导出格式 (json | markdown | timeline)
        """
        trace = self.traces.get(trace_id)
        if not trace:
            return None

        if format == "json":
            return json.dumps(trace.to_dict(), ensure_ascii=False, indent=2)
        elif format == "markdown":
            return self._export_markdown(trace)
        elif format == "timeline":
            return self._export_timeline(trace)
        else:
            return None

    def _export_markdown(self, trace: Trace) -> str:
        """导出为 Markdown 格式"""
        lines = [
            f"# 执行追踪: {trace.name}",
            "",
            f"- **ID**: {trace.id}",
            f"- **状态**: {trace.status}",
            f"- **开始时间**: {trace.start_time.isoformat()}",
            f"- **总耗时**: {trace.total_duration_ms}ms",
            "",
            "## 输入",
            "```json",
            json.dumps(trace.input, ensure_ascii=False, indent=2),
            "```",
            "",
            "## 执行步骤",
            "",
        ]

        for i, step in enumerate(trace.steps, 1):
            lines.append(f"### {i}. [{step.type.value}] {step.name}")
            lines.append("")

            if step.reasoning:
                lines.append(f"**思考**: {step.reasoning}")
                lines.append("")

            if step.decision:
                lines.append(f"**决策**: {step.decision}")
                lines.append("")

            if step.input:
                lines.append("**输入**:")
                lines.append("```json")
                lines.append(
                    json.dumps(step.input, ensure_ascii=False, indent=2)[:500]
                )
                lines.append("```")
                lines.append("")

            if step.output:
                lines.append("**输出**:")
                lines.append("```json")
                output_str = json.dumps(step.output, ensure_ascii=False, indent=2)
                lines.append(output_str[:500] + ("..." if len(output_str) > 500 else ""))
                lines.append("```")
                lines.append("")

            if step.error:
                lines.append(f"**错误**: {step.error}")
                lines.append("")

            if step.duration_ms:
                lines.append(f"*耗时: {step.duration_ms}ms*")
                lines.append("")

        if trace.output:
            lines.append("## 最终输出")
            lines.append("```json")
            output_str = json.dumps(trace.output, ensure_ascii=False, indent=2)
            lines.append(output_str[:1000] + ("..." if len(output_str) > 1000 else ""))
            lines.append("```")

        return "\n".join(lines)

    def _export_timeline(self, trace: Trace) -> str:
        """导出为时间线格式"""
        lines = [
            f"Timeline: {trace.name}",
            "=" * 60,
            f"[{trace.start_time.strftime('%H:%M:%S')}] Started",
        ]

        for step in trace.steps:
            time_str = step.timestamp.strftime("%H:%M:%S")
            duration = f"({step.duration_ms}ms)" if step.duration_ms else ""

            icon = {
                StepType.PLANNING: "📋",
                StepType.REASONING: "🤔",
                StepType.TOOL_CALL: "🔧",
                StepType.SUBAGENT: "🤖",
                StepType.DECISION: "✅",
                StepType.OUTPUT: "📤",
                StepType.ERROR: "❌",
                StepType.HITL: "👤",
            }.get(step.type, "•")

            lines.append(f"[{time_str}] {icon} {step.type.value}: {step.name} {duration}")

            if step.reasoning:
                lines.append(f"           └─ 思考: {step.reasoning[:50]}...")

            if step.decision:
                lines.append(f"           └─ 决策: {step.decision[:50]}...")

            if step.error:
                lines.append(f"           └─ 错误: {step.error}")

        if trace.end_time:
            lines.append(f"[{trace.end_time.strftime('%H:%M:%S')}] Completed ({trace.total_duration_ms}ms)")

        lines.append("=" * 60)
        return "\n".join(lines)


# ==================== 全局实例 ====================

_tracer: Optional[TraceManager] = None


def get_tracer() -> TraceManager:
    """获取全局追踪管理器"""
    global _tracer
    if _tracer is None:
        from ..config import get_settings

        settings = get_settings()
        persist_dir = Path("/tmp/teaching-agents/traces")
        _tracer = TraceManager(persist_dir=persist_dir)
    return _tracer

