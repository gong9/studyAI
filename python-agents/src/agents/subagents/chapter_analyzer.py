"""
章节分析子 Agent

负责分析章节内容，提取知识点和摘要。
"""

import json
import logging
from typing import Optional

from ..._compat import create_subagent_config
from ...prompts.reviewer import CHAPTER_ANALYZER_PROMPT
from ...tools.rag_client import search_chapter_material

logger = logging.getLogger(__name__)


# 子 Agent 配置（用于 deepagents）
chapter_analyzer_config = {
    "name": "chapter-analyzer",
    "description": "分析章节内容，通过 RAG 检索提取知识点和摘要。适用于需要理解教材内容、提取核心概念的场景。",
    "system_prompt": """你是一位资深教师，擅长阅读和分析教材内容。

你的任务是：
1. 使用 rag_search 工具检索与章节相关的教材内容
2. 分析检索到的内容，提取核心知识点
3. 生成章节摘要

输出格式必须是 JSON：
{
  "key_points": [
    {"type": "concept", "title": "...", "content": "...", "importance": "high"}
  ],
  "summary": "章节摘要..."
}

知识点类型包括：concept（概念）、formula（公式）、example（例题）、pitfall（易错点）、method（方法）
""",
}


async def analyze_chapter(
    knowledge_base_id: str,
    chapter_title: str,
    llm_client,  # LangChain ChatModel
) -> dict:
    """
    分析章节内容，提取知识点和摘要
    
    Args:
        knowledge_base_id: 知识库 ID
        chapter_title: 章节标题
        llm_client: LLM 客户端
        
    Returns:
        分析结果，包含 key_points 和 summary
    """
    logger.info(f"Analyzing chapter: {chapter_title}")
    
    # 1. 检索章节相关内容
    material_content = await search_chapter_material(knowledge_base_id, chapter_title)
    
    if not material_content or len(material_content) < 100:
        logger.warning("Insufficient material content")
        return {
            "key_points": [],
            "summary": "",
            "error": "教材内容不足，无法分析",
        }
    
    logger.debug(f"Retrieved {len(material_content)} chars of material")
    
    # 2. 构建 Prompt
    prompt = CHAPTER_ANALYZER_PROMPT.format(
        chapter_title=chapter_title,
        content=material_content,
    )
    
    # 3. 调用 LLM
    try:
        response = await llm_client.ainvoke(prompt)
        response_text = response.content if hasattr(response, 'content') else str(response)
        
        # 4. 解析结果
        result = _parse_analysis_result(response_text)
        logger.info(f"Extracted {len(result.get('key_points', []))} key points")
        
        return result
        
    except Exception as e:
        logger.error(f"Chapter analysis failed: {e}")
        return {
            "key_points": [],
            "summary": "",
            "error": str(e),
        }


def _parse_analysis_result(text: str) -> dict:
    """解析分析结果"""
    try:
        # 尝试提取 JSON
        import re
        json_match = re.search(r'\{[\s\S]*\}', text)
        if not json_match:
            raise ValueError("No JSON found in response")
        
        parsed = json.loads(json_match.group())
        
        # 验证和清理 key_points
        key_points = []
        for kp in parsed.get("key_points", []):
            if kp.get("type") and kp.get("title") and kp.get("content"):
                key_points.append({
                    "type": _validate_type(kp["type"]),
                    "title": str(kp["title"])[:100],
                    "content": str(kp["content"])[:500],
                    "importance": _validate_importance(kp.get("importance", "medium")),
                })
        
        summary = str(parsed.get("summary", ""))[:1000]
        
        return {
            "key_points": key_points,
            "summary": summary,
        }
        
    except Exception as e:
        logger.error(f"Failed to parse analysis result: {e}")
        return {"key_points": [], "summary": ""}


def _validate_type(type_str: str) -> str:
    """验证知识点类型"""
    valid_types = ["concept", "formula", "example", "pitfall", "method"]
    return type_str if type_str in valid_types else "concept"


def _validate_importance(importance: str) -> str:
    """验证重要性等级"""
    valid_levels = ["high", "medium", "low"]
    return importance if importance in valid_levels else "medium"

