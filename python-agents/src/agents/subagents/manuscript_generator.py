"""
手稿生成子 Agent

负责根据教学规划生成 Markdown 格式的教学手稿。
"""

import logging
from typing import Optional

from ...prompts.manuscript_generator import format_manuscript_prompt, get_manuscript_prompt
from ...tools.rag_client import search_chapter_material

logger = logging.getLogger(__name__)


# 子 Agent 配置（用于 deepagents）
manuscript_generator_config = {
    "name": "manuscript-generator",
    "description": "根据教学规划和知识点生成 Markdown 格式的教学手稿。适用于需要生成完整讲稿的场景。",
    "system_prompt": """你是一位资深教师，擅长撰写教学讲稿。

你的任务是：
1. 理解教学规划（章节、目标、节次安排）
2. 使用 rag_search 工具检索相关教材内容
3. 生成详尽、完整的 Markdown 格式教学讲稿

输出要求：
- 使用 Markdown 格式
- 每个节次用 `---` 分隔
- 内容要充实，每节至少 150-300 字
- 不要引用图片，用文字详细描述
""",
}


async def generate_manuscript(
    knowledge_base_id: str,
    plan: dict,
    llm_client,  # LangChain ChatModel
    chapter_key_points: Optional[list] = None,
    chapter_summary: Optional[str] = None,
    chapter_content: Optional[str] = None,
) -> str:
    """
    生成教学手稿
    
    Args:
        knowledge_base_id: 知识库 ID
        plan: 教学规划
        llm_client: LLM 客户端
        chapter_key_points: 章节重点
        chapter_summary: 章节摘要
        chapter_content: 章节内容（备选）
        
    Returns:
        Markdown 格式的教学手稿
    """
    logger.info(f"Generating manuscript for: {plan.get('chapter', 'Unknown')}")
    
    # 1. 格式化章节重点
    key_points_str = _format_key_points(chapter_key_points)
    
    # 2. 通过 RAG 检索相关教材内容
    rag_content = await _fetch_section_materials(knowledge_base_id, plan)
    
    # 如果 RAG 内容不足，使用传入的 chapter_content 作为备选
    if len(rag_content) < 500 and chapter_content:
        rag_content = chapter_content
    
    # 3. 获取场景类型
    scene_type = plan.get("scene_type") or plan.get("sceneType") or "general"
    
    # 4. 获取约束条件
    constraints = plan.get("constraints", {})
    grade = constraints.get("grade", "通用")
    subject = constraints.get("subject", "通用")
    duration = constraints.get("duration", "30min")
    
    # 5. 格式化节次安排
    sections_str = _format_sections(plan.get("sections", []))
    
    # 6. 构建 Prompt
    prompt = format_manuscript_prompt(
        scene_type=scene_type,
        chapter=plan.get("chapter", ""),
        grade=grade,
        subject=subject,
        duration=duration,
        goals=plan.get("teaching_goals", []),
        concepts=plan.get("key_concepts", []),
        sections=sections_str,
        key_points=key_points_str,
        summary=chapter_summary or "",
        rag_content=rag_content,
    )
    
    # 7. 调用 LLM
    try:
        response = await llm_client.ainvoke(prompt)
        markdown = response.content if hasattr(response, 'content') else str(response)
        
        # 清理可能的代码块包装
        markdown = _clean_markdown(markdown)
        
        logger.info(f"Generated manuscript with {len(markdown)} chars")
        return markdown
        
    except Exception as e:
        logger.error(f"Manuscript generation failed: {e}")
        raise


async def _fetch_section_materials(knowledge_base_id: str, plan: dict) -> str:
    """通过 RAG 检索每个节次的相关教材内容"""
    all_content = []
    seen_content = set()
    
    sections = plan.get("sections", [])
    
    # 对每个节次进行检索
    for section in sections:
        title = section.get("title", "")
        key_points = section.get("key_points", [])
        
        # 构造查询
        query_parts = [title]
        if key_points:
            query_parts.extend(key_points[:3])
        query = " ".join(query_parts)
        
        try:
            content = await search_chapter_material(
                knowledge_base_id,
                query,
                queries=[query],
            )
            
            if content:
                # 去重
                content_key = content[:80]
                if content_key not in seen_content:
                    seen_content.add(content_key)
                    all_content.append(f"【{title}相关】\n{content}")
                    
        except Exception as e:
            logger.warning(f"Failed to fetch material for section '{title}': {e}")
            continue
    
    # 再做一次整体检索
    chapter = plan.get("chapter", "")
    concepts = plan.get("key_concepts", [])[:3]
    overall_query = f"{chapter} {' '.join(concepts)}"
    
    try:
        overall_content = await search_chapter_material(
            knowledge_base_id,
            overall_query,
            queries=[overall_query],
        )
        
        if overall_content:
            content_key = overall_content[:80]
            if content_key not in seen_content:
                all_content.append(f"【章节概述相关】\n{overall_content}")
                
    except Exception as e:
        logger.warning(f"Failed to fetch overall material: {e}")
    
    return "\n\n---\n\n".join(all_content)


def _format_key_points(key_points: Optional[list]) -> str:
    """格式化章节重点"""
    if not key_points:
        return ""
    
    type_labels = {
        "concept": "📚 概念",
        "formula": "📐 公式",
        "example": "📝 例题",
        "pitfall": "⚠️ 易错点",
        "method": "💡 方法",
    }
    
    formatted = []
    for kp in key_points:
        type_label = type_labels.get(kp.get("type", ""), kp.get("type", ""))
        importance = "【重要】" if kp.get("importance") == "high" else ""
        title = kp.get("title", "")
        content = kp.get("content", "")
        formatted.append(f"- {type_label}{importance}：{title}\n  {content}")
    
    return "\n\n".join(formatted)


def _format_sections(sections: list) -> str:
    """格式化节次安排"""
    formatted = []
    for i, s in enumerate(sections):
        section_type = s.get("type", "")
        title = s.get("title", "")
        duration = s.get("duration_minutes")
        key_points = s.get("key_points", [])
        
        duration_str = f"（{duration}分钟）" if duration else ""
        points_str = f"\n   要点: {'、'.join(key_points)}" if key_points else ""
        
        formatted.append(f"{i+1}. [{section_type}] {title}{duration_str}{points_str}")
    
    return "\n".join(formatted)


def _clean_markdown(text: str) -> str:
    """清理 Markdown 输出"""
    cleaned = text.strip()
    
    # 移除开头的代码块标记
    if cleaned.startswith("```markdown"):
        cleaned = cleaned[len("```markdown"):]
    elif cleaned.startswith("```md"):
        cleaned = cleaned[len("```md"):]
    elif cleaned.startswith("```"):
        cleaned = cleaned[3:]
    
    # 移除结尾的代码块标记
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    
    return cleaned.strip()

