"""
兼容性模块

提供 deepagents 相关的兼容性函数。
"""

from typing import Any, Callable, Optional


def create_subagent_config(
    name: str,
    description: str,
    system_prompt: str,
    tools: Optional[list[Callable]] = None,
    model: Optional[str] = None,
) -> dict[str, Any]:
    """
    创建子 Agent 配置
    
    兼容 deepagents 的 subagent 配置格式。
    
    Args:
        name: 子 Agent 名称
        description: 描述（用于主 Agent 选择何时委托）
        system_prompt: 系统提示词
        tools: 可用工具列表
        model: 使用的模型（可选，默认使用主 Agent 模型）
        
    Returns:
        deepagents 格式的子 Agent 配置
    """
    config = {
        "name": name,
        "description": description,
        "system_prompt": system_prompt,
    }
    
    if tools:
        config["tools"] = tools
        
    if model:
        config["model"] = model
        
    return config

