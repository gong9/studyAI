"""
审核润色子 Agent

负责审核手稿质量并进行智能润色。
"""

import json
import logging
import re
from typing import Optional

from ...prompts.reviewer import format_reviewer_prompt, format_enricher_prompt
from ...tools.rag_client import search_chapter_material

logger = logging.getLogger(__name__)


# 子 Agent 配置（用于 deepagents）
reviewer_enricher_config = {
    "name": "reviewer-enricher",
    "description": "审核手稿质量并进行智能润色。先审核内容完整性、逻辑性、准确性，然后根据建议补充和优化。",
    "system_prompt": """你是一位资深的教学内容审核和优化专家。

你的任务分两步：
1. **审核**：评估手稿的内容完整性、逻辑清晰度、表达准确性
2. **润色**：根据审核建议，使用 rag_search 检索补充材料，优化手稿

审核输出 JSON 格式：
{
  "overall_score": 8,
  "passed": true,
  "suggestions": [...],
  "missing_topics": [...]
}

润色输出完整的优化后 Markdown 手稿。
""",
}


async def review_manuscript(
    draft_content: str,
    plan: dict,
    llm_client,  # LangChain ChatModel
) -> dict:
    """
    审核手稿
    
    Args:
        draft_content: 待审核的手稿内容
        plan: 教学规划
        llm_client: LLM 客户端
        
    Returns:
        审核结果
    """
    logger.info(f"Reviewing manuscript for: {plan.get('chapter', 'Unknown')}")
    
    # 构建审核 Prompt
    prompt = format_reviewer_prompt(
        chapter=plan.get("chapter", ""),
        goals=plan.get("teaching_goals", []),
        concepts=plan.get("key_concepts", []),
        draft_content=draft_content,
    )
    
    try:
        response = await llm_client.ainvoke(prompt)
        response_text = response.content if hasattr(response, 'content') else str(response)
        
        # 解析审核结果
        result = _parse_review_result(response_text)
        logger.info(f"Review score: {result.get('overall_score', 'N/A')}")
        
        return result
        
    except Exception as e:
        logger.error(f"Review failed: {e}")
        return {
            "overall_score": 0,
            "passed": False,
            "error": str(e),
        }


async def enrich_manuscript(
    knowledge_base_id: str,
    draft_content: str,
    review_result: dict,
    llm_client,  # LangChain ChatModel
) -> str:
    """
    根据审核建议润色手稿
    
    Args:
        knowledge_base_id: 知识库 ID
        draft_content: 原始手稿内容
        review_result: 审核结果
        llm_client: LLM 客户端
        
    Returns:
        润色后的手稿内容
    """
    logger.info("Enriching manuscript based on review")
    
    # 1. 提取需要补充的主题
    missing_topics = review_result.get("missing_topics", [])
    suggestions = review_result.get("suggestions", [])
    
    # 2. 通过 RAG 检索补充内容
    supplement_content = ""
    if missing_topics or suggestions:
        keywords = _extract_keywords(missing_topics, suggestions)
        if keywords:
            supplement_content = await _fetch_supplement_content(
                knowledge_base_id, keywords
            )
    
    # 3. 格式化审核建议
    review_suggestions_str = json.dumps(review_result, ensure_ascii=False, indent=2)
    
    # 4. 构建润色 Prompt
    prompt = format_enricher_prompt(
        draft_content=draft_content,
        review_suggestions=review_suggestions_str,
        supplement_content=supplement_content,
    )
    
    try:
        response = await llm_client.ainvoke(prompt)
        enriched = response.content if hasattr(response, 'content') else str(response)
        
        # 清理输出
        enriched = _clean_markdown(enriched)
        
        logger.info(f"Enriched manuscript: {len(enriched)} chars")
        return enriched
        
    except Exception as e:
        logger.error(f"Enrichment failed: {e}")
        # 失败时返回原稿
        return draft_content


async def review_and_enrich(
    knowledge_base_id: str,
    draft_content: str,
    plan: dict,
    llm_client,  # LangChain ChatModel
) -> dict:
    """
    审核并润色手稿（一站式接口）
    
    Args:
        knowledge_base_id: 知识库 ID
        draft_content: 待审核的手稿内容
        plan: 教学规划
        llm_client: LLM 客户端
        
    Returns:
        包含审核结果和润色后内容的字典
    """
    # 1. 审核
    review_result = await review_manuscript(draft_content, plan, llm_client)
    
    # 2. 如果审核通过且分数较高，可以跳过润色
    if review_result.get("passed") and review_result.get("overall_score", 0) >= 9:
        logger.info("Review passed with high score, skipping enrichment")
        return {
            "review_result": review_result,
            "enriched_content": draft_content,
            "skipped_enrichment": True,
        }
    
    # 3. 润色
    enriched_content = await enrich_manuscript(
        knowledge_base_id, draft_content, review_result, llm_client
    )
    
    return {
        "review_result": review_result,
        "enriched_content": enriched_content,
        "skipped_enrichment": False,
    }


def _parse_review_result(text: str) -> dict:
    """解析审核结果"""
    try:
        json_match = re.search(r'\{[\s\S]*\}', text)
        if not json_match:
            raise ValueError("No JSON found in response")
        
        parsed = json.loads(json_match.group())
        
        return {
            "overall_score": parsed.get("overall_score", 0),
            "passed": parsed.get("passed", False),
            "strengths": parsed.get("strengths", []),
            "suggestions": parsed.get("suggestions", []),
            "missing_topics": parsed.get("missing_topics", []),
            "summary": parsed.get("summary", ""),
        }
        
    except Exception as e:
        logger.error(f"Failed to parse review result: {e}")
        return {
            "overall_score": 0,
            "passed": False,
            "error": str(e),
        }


def _extract_keywords(missing_topics: list, suggestions: list) -> list[str]:
    """从审核建议中提取关键词"""
    keywords = []
    
    # 从遗漏主题中提取
    keywords.extend(missing_topics)
    
    # 从建议中提取
    for s in suggestions:
        if isinstance(s, dict):
            issue = s.get("issue", "")
            suggestion = s.get("suggestion", "")
            # 简单提取关键词（可以用更复杂的方法）
            if issue:
                keywords.append(issue)
            if suggestion:
                keywords.append(suggestion)
    
    return keywords[:5]  # 限制数量


async def _fetch_supplement_content(
    knowledge_base_id: str,
    keywords: list[str],
) -> str:
    """检索补充内容"""
    all_content = []
    
    for keyword in keywords:
        try:
            content = await search_chapter_material(
                knowledge_base_id,
                keyword,
                queries=[keyword],
            )
            if content:
                all_content.append(content)
        except Exception as e:
            logger.warning(f"Failed to fetch supplement for '{keyword}': {e}")
            continue
    
    if not all_content:
        return ""
    
    combined = "\n\n---\n\n".join(all_content)
    
    # 限制长度
    max_length = 4000
    if len(combined) > max_length:
        combined = combined[:max_length] + "\n\n[内容已截断...]"
    
    return combined


def _clean_markdown(text: str) -> str:
    """清理 Markdown 输出"""
    cleaned = text.strip()
    
    if cleaned.startswith("```markdown"):
        cleaned = cleaned[len("```markdown"):]
    elif cleaned.startswith("```md"):
        cleaned = cleaned[len("```md"):]
    elif cleaned.startswith("```"):
        cleaned = cleaned[3:]
    
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    
    return cleaned.strip()

