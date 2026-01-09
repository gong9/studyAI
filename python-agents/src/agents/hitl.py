"""
Human-in-the-Loop (HITL) 机制

实现人工审核功能，支持在关键节点暂停等待用户确认。

核心概念：
1. Checkpoint: 需要人工确认的检查点
2. Decision: 用户的决策（approve/edit/reject）
3. Pending: 等待中的任务
"""

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Callable, Optional
import uuid

logger = logging.getLogger(__name__)


class CheckpointType(str, Enum):
    """检查点类型"""

    PLAN_REVIEW = "plan_review"  # 规划审核
    DRAFT_REVIEW = "draft_review"  # 手稿审核
    FINAL_APPROVAL = "final_approval"  # 最终确认


class Decision(str, Enum):
    """用户决策"""

    APPROVE = "approve"  # 通过
    EDIT = "edit"  # 需要修改
    REJECT = "reject"  # 拒绝


@dataclass
class Checkpoint:
    """检查点"""

    id: str
    type: CheckpointType
    data: dict  # 需要审核的数据
    message: str  # 给用户的消息
    created_at: datetime = field(default_factory=datetime.now)
    decision: Optional[Decision] = None
    feedback: Optional[str] = None  # 用户反馈
    edited_data: Optional[dict] = None  # 用户编辑后的数据
    resolved_at: Optional[datetime] = None


@dataclass
class HITLConfig:
    """HITL 配置"""

    enabled: bool = False
    checkpoints: list[CheckpointType] = field(default_factory=list)
    timeout_seconds: int = 3600  # 1小时超时
    auto_approve_score: int = 8  # 评分>=8自动通过


class HITLManager:
    """
    Human-in-the-Loop 管理器

    使用示例：
    ```python
    manager = HITLManager(config=HITLConfig(
        enabled=True,
        checkpoints=[CheckpointType.DRAFT_REVIEW]
    ))

    # 创建检查点并等待
    decision = await manager.create_checkpoint(
        type=CheckpointType.DRAFT_REVIEW,
        data={"markdown": draft},
        message="请审核手稿内容"
    )

    if decision.decision == Decision.EDIT:
        draft = decision.edited_data["markdown"]
    elif decision.decision == Decision.REJECT:
        raise Exception("用户拒绝了手稿")
    ```
    """

    def __init__(self, config: Optional[HITLConfig] = None):
        self.config = config or HITLConfig()
        self.pending_checkpoints: dict[str, Checkpoint] = {}
        self.history: list[Checkpoint] = []
        self._events: dict[str, asyncio.Event] = {}

    def is_checkpoint_enabled(self, checkpoint_type: CheckpointType) -> bool:
        """检查特定检查点是否启用"""
        if not self.config.enabled:
            return False
        return checkpoint_type in self.config.checkpoints

    async def create_checkpoint(
        self,
        checkpoint_type: CheckpointType,
        data: dict,
        message: str,
        auto_approve_fn: Optional[Callable[[dict], bool]] = None,
    ) -> Checkpoint:
        """
        创建检查点并等待用户决策

        Args:
            checkpoint_type: 检查点类型
            data: 需要审核的数据
            message: 给用户的消息
            auto_approve_fn: 自动批准函数，返回 True 则自动通过

        Returns:
            包含用户决策的 Checkpoint
        """
        # 如果未启用该检查点，自动通过
        if not self.is_checkpoint_enabled(checkpoint_type):
            logger.info(f"Checkpoint {checkpoint_type} not enabled, auto-approve")
            return Checkpoint(
                id=str(uuid.uuid4()),
                type=checkpoint_type,
                data=data,
                message=message,
                decision=Decision.APPROVE,
                resolved_at=datetime.now(),
            )

        # 检查是否可以自动批准
        if auto_approve_fn and auto_approve_fn(data):
            logger.info(f"Checkpoint {checkpoint_type} auto-approved by function")
            return Checkpoint(
                id=str(uuid.uuid4()),
                type=checkpoint_type,
                data=data,
                message=message,
                decision=Decision.APPROVE,
                resolved_at=datetime.now(),
            )

        # 创建检查点
        checkpoint_id = str(uuid.uuid4())
        checkpoint = Checkpoint(
            id=checkpoint_id,
            type=checkpoint_type,
            data=data,
            message=message,
        )

        self.pending_checkpoints[checkpoint_id] = checkpoint
        self._events[checkpoint_id] = asyncio.Event()

        logger.info(f"Created checkpoint {checkpoint_id}: {checkpoint_type}")

        # 等待用户决策
        try:
            await asyncio.wait_for(
                self._events[checkpoint_id].wait(),
                timeout=self.config.timeout_seconds,
            )
        except asyncio.TimeoutError:
            logger.warning(f"Checkpoint {checkpoint_id} timed out, auto-reject")
            checkpoint.decision = Decision.REJECT
            checkpoint.feedback = "Timeout"
            checkpoint.resolved_at = datetime.now()

        # 清理
        self.history.append(checkpoint)
        del self.pending_checkpoints[checkpoint_id]
        del self._events[checkpoint_id]

        return checkpoint

    def resolve_checkpoint(
        self,
        checkpoint_id: str,
        decision: Decision,
        feedback: Optional[str] = None,
        edited_data: Optional[dict] = None,
    ) -> bool:
        """
        解决检查点（用户提交决策）

        Args:
            checkpoint_id: 检查点 ID
            decision: 用户决策
            feedback: 用户反馈
            edited_data: 用户编辑后的数据（用于 EDIT 决策）

        Returns:
            是否成功
        """
        if checkpoint_id not in self.pending_checkpoints:
            logger.warning(f"Checkpoint {checkpoint_id} not found")
            return False

        checkpoint = self.pending_checkpoints[checkpoint_id]
        checkpoint.decision = decision
        checkpoint.feedback = feedback
        checkpoint.edited_data = edited_data
        checkpoint.resolved_at = datetime.now()

        # 触发事件
        self._events[checkpoint_id].set()

        logger.info(f"Resolved checkpoint {checkpoint_id}: {decision}")
        return True

    def get_pending_checkpoints(self) -> list[dict]:
        """获取所有待处理的检查点"""
        return [
            {
                "id": cp.id,
                "type": cp.type.value,
                "message": cp.message,
                "data": cp.data,
                "created_at": cp.created_at.isoformat(),
            }
            for cp in self.pending_checkpoints.values()
        ]

    def get_checkpoint_info(self, checkpoint_id: str) -> Optional[dict]:
        """获取检查点详情"""
        if checkpoint_id in self.pending_checkpoints:
            cp = self.pending_checkpoints[checkpoint_id]
            return {
                "id": cp.id,
                "type": cp.type.value,
                "message": cp.message,
                "data": cp.data,
                "created_at": cp.created_at.isoformat(),
                "status": "pending",
            }

        for cp in self.history:
            if cp.id == checkpoint_id:
                return {
                    "id": cp.id,
                    "type": cp.type.value,
                    "message": cp.message,
                    "data": cp.data,
                    "created_at": cp.created_at.isoformat(),
                    "decision": cp.decision.value if cp.decision else None,
                    "feedback": cp.feedback,
                    "resolved_at": (
                        cp.resolved_at.isoformat() if cp.resolved_at else None
                    ),
                    "status": "resolved",
                }

        return None


# ==================== 便捷函数 ====================


def should_auto_approve_review(data: dict) -> bool:
    """
    判断是否自动批准审核

    如果审核评分 >= 8 且没有严重问题，自动通过
    """
    review = data.get("review", {})
    score = review.get("overall_score", 0)

    if score >= 8:
        suggestions = review.get("suggestions", [])
        high_severity = [s for s in suggestions if s.get("severity") == "high"]
        if not high_severity:
            return True

    return False


def create_plan_checkpoint_message(plan: dict) -> str:
    """创建规划审核的消息"""
    chapter = plan.get("chapter", "未知章节")
    sections_count = len(plan.get("sections", []))
    duration = plan.get("total_duration_minutes", 30)

    return f"""请审核教学规划：

章节：{chapter}
节数：{sections_count} 节
时长：{duration} 分钟

教学目标：
{chr(10).join('- ' + g for g in plan.get('teaching_goals', []))}

核心概念：
{', '.join(plan.get('key_concepts', []))}

请选择：
- 通过：继续生成手稿
- 修改：修改规划内容
- 拒绝：取消生成"""


def create_draft_checkpoint_message(draft: str, review: dict) -> str:
    """创建手稿审核的消息"""
    score = review.get("overall_score", 0)
    passed = review.get("passed", False)

    strengths = "\n".join(f"✓ {s}" for s in review.get("strengths", []))
    suggestions = "\n".join(
        f"• [{s.get('severity', 'medium')}] {s.get('issue', '')}"
        for s in review.get("suggestions", [])
    )

    return f"""请审核手稿内容：

评分：{score}/10 {'(通过)' if passed else '(建议修改)'}

优点：
{strengths or '（暂无）'}

改进建议：
{suggestions or '（暂无）'}

请选择：
- 通过：接受当前手稿
- 修改：编辑手稿内容
- 拒绝：重新生成"""
