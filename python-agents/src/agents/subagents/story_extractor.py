"""
故事提取子 Agent

从单章内容中提取故事元素：人物、事件、冲突、情感等。
"""

import json
import logging
import re
from typing import Optional

logger = logging.getLogger(__name__)

# 子 Agent 配置
story_extractor_config = {
    "name": "story_extractor",
    "description": "从章节内容中提取故事核心元素，包括人物、事件、冲突、情感等",
    "system_prompt": """你是一位资深的文学分析专家，擅长从文本中提取故事核心元素。

你的任务是分析章节内容，提取以下信息：
1. 故事概要：本章讲了什么故事
2. 人物：出场人物及其角色
3. 事件：发生了哪些重要事件
4. 冲突：存在哪些矛盾冲突
5. 高潮：本章的高潮点（如有）
6. 悬念：本章结尾的悬念（如有）
7. 情感基调：整体情绪氛围
8. 时间线：时代背景

## 输出格式 (JSON)

{
  "chapter_title": "章节标题",
  "story_summary": "本章故事概要（100-200字）",
  "characters": [
    {"name": "人物名", "role": "主角/配角/反派", "description": "简介"}
  ],
  "events": [
    {"title": "事件名", "description": "事件描述", "importance": "high/medium/low"}
  ],
  "conflicts": ["冲突点1", "冲突点2"],
  "climax": "本章高潮（如有）",
  "suspense": "本章结尾的悬念（如有）",
  "emotion": "整体情绪基调（紧张/悲壮/轻松/励志/...）",
  "timeline": "时间背景（如：洪武三年）"
}

## 注意事项
1. 故事概要要精炼但完整，抓住核心情节
2. 人物只列出本章重要人物，不要遗漏主要角色
3. 事件按重要性排序，高重要性的事件会影响后续分集
4. 悬念是评书分集的关键，要准确识别
5. 如果某项没有，可以返回 null 或空数组
""",
}


async def extract_story(
    chapter_title: str,
    chapter_content: str,
    llm_client,
) -> dict:
    """
    从章节内容中提取故事元素
    
    Args:
        chapter_title: 章节标题
        chapter_content: 章节内容
        llm_client: LLM 客户端
        
    Returns:
        故事元素字典
    """
    logger.info(f"[StoryExtractor] Extracting story from: {chapter_title}")
    
    # 构建 prompt
    prompt = f"""请分析以下章节内容，提取故事核心元素。

## 章节标题
{chapter_title}

## 章节内容
{chapter_content[:15000]}  

请按照要求的 JSON 格式输出分析结果。直接输出 JSON，不要有其他内容。"""

    try:
        response = await llm_client.ainvoke(prompt)
        text = response.content if hasattr(response, 'content') else str(response)
        
        # 解析 JSON
        result = _parse_story_result(text, chapter_title)
        
        logger.info(f"[StoryExtractor] Extracted {len(result.get('characters', []))} characters, "
                   f"{len(result.get('events', []))} events")
        
        return result
        
    except Exception as e:
        logger.error(f"[StoryExtractor] Failed to extract story: {e}")
        return _default_result(chapter_title)


def _parse_story_result(text: str, chapter_title: str) -> dict:
    """解析 LLM 返回的故事提取结果"""
    try:
        # 尝试提取 JSON
        json_match = re.search(r'\{[\s\S]*\}', text)
        if json_match:
            raw = json.loads(json_match.group())
            
            # 兼容中英文字段名
            result = {
                'chapter_title': raw.get('chapter_title') or raw.get('章节标题') or chapter_title,
                'story_summary': raw.get('story_summary') or raw.get('故事概要') or raw.get('故事核心元素', {}).get('主题', ''),
                'characters': _parse_characters(raw),
                'events': _parse_events(raw),
                'conflicts': raw.get('conflicts') or raw.get('冲突') or raw.get('故事核心元素', {}).get('冲突', []),
                'climax': raw.get('climax') or raw.get('高潮') or raw.get('故事核心元素', {}).get('高潮'),
                'suspense': raw.get('suspense') or raw.get('悬念') or raw.get('故事核心元素', {}).get('悬念'),
                'emotion': raw.get('emotion') or raw.get('情感基调') or raw.get('故事核心元素', {}).get('主题', '平淡'),
                'timeline': raw.get('timeline') or raw.get('时间背景') or raw.get('故事核心元素', {}).get('时间背景'),
            }
            return result
    except Exception as e:
        logger.error(f"[StoryExtractor] JSON parse error: {e}")
    
    return _default_result(chapter_title)


def _parse_characters(raw: dict) -> list:
    """解析人物列表，兼容多种格式"""
    # 英文字段
    if 'characters' in raw and raw['characters']:
        return raw['characters']
    
    # 中文字段 - 列表格式
    if '故事核心元素' in raw:
        chars = raw['故事核心元素'].get('主要人物', [])
        if chars:
            # 转换为统一格式
            return [{'name': c, 'role': '角色', 'description': ''} if isinstance(c, str) else c for c in chars]
    
    if '人物' in raw:
        chars = raw['人物']
        if chars:
            return [{'name': c, 'role': '角色', 'description': ''} if isinstance(c, str) else c for c in chars]
    
    return []


def _parse_events(raw: dict) -> list:
    """解析事件列表，兼容多种格式"""
    # 英文字段
    if 'events' in raw and raw['events']:
        return raw['events']
    
    # 中文字段
    if '故事核心元素' in raw:
        events = raw['故事核心元素'].get('关键事件', [])
        if events:
            return [{'title': e, 'description': e, 'importance': 'medium'} if isinstance(e, str) else e for e in events]
    
    if '事件' in raw:
        events = raw['事件']
        if events:
            return [{'title': e, 'description': e, 'importance': 'medium'} if isinstance(e, str) else e for e in events]
    
    return []


def _default_result(chapter_title: str) -> dict:
    """返回默认结果"""
    return {
        "chapter_title": chapter_title,
        "story_summary": "",
        "characters": [],
        "events": [],
        "conflicts": [],
        "climax": None,
        "suspense": None,
        "emotion": "平淡",
        "timeline": None,
    }

