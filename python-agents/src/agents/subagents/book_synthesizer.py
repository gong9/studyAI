"""
全书综合子 Agent

汇总所有章节摘要，形成"全书视角"：
- 核心主旨
- 人物图谱
- 事件主线
- 高潮/转折点
- 情感节奏曲线
"""

import json
import logging
import re
from typing import List

logger = logging.getLogger(__name__)

# 子 Agent 配置
book_synthesizer_config = {
    "name": "book_synthesizer",
    "description": "汇总全书章节摘要，形成全书视角，包括人物图谱、事件主线、情感节奏等",
    "system_prompt": """你是一位资深的文学评论家和评书艺术家，擅长从宏观角度把握一本书的脉络。

你的任务是根据所有章节的故事摘要，形成对全书的整体理解，为后续评书创作提供指导。

## 输出格式 (JSON)

{
  "title": "书名",
  "theme": "核心主旨（一句话概括全书讲了什么）",
  "genre": "类型（历史/武侠/言情/...）",
  
  "characters": {
    "protagonists": [
      {"name": "主角名", "arc": "人物弧光（如：从乞丐到皇帝）", "peak_chapters": [1, 5, 10]}
    ],
    "antagonists": [
      {"name": "反派名", "arc": "人物发展", "peak_chapters": [3, 8]}
    ],
    "key_supporting": [
      {"name": "重要配角", "role": "角色作用"}
    ],
    "relationships": [
      {"from": "人物A", "to": "人物B", "type": "关系类型（父子/君臣/情侣/对手）"}
    ]
  },
  
  "event_timeline": [
    {
      "chapter": 3,
      "event": "重大事件名称",
      "importance": "high/medium",
      "type": "climax/milestone/turning_point/foreshadowing"
    }
  ],
  
  "emotional_curve": [
    {"chapter_range": [1, 3], "tone": "励志/紧张/悲壮/轻松/..."},
    {"chapter_range": [4, 6], "tone": "..."}
  ],
  
  "foreshadowing_hints": [
    {"at_chapter": 1, "hint": "伏笔内容", "payoff_chapter": 8}
  ],
  
  "storytelling_notes": "对评书创作的整体建议"
}

## 注意事项
1. 人物图谱要识别主次，重点关注核心人物
2. 事件主线按时间顺序，标注重要性和类型
3. 情感曲线帮助控制评书的节奏
4. 伏笔提示帮助在早期埋线
5. 这个全书视角将用于指导每一回的讲述
""",
}


async def synthesize_book(
    book_title: str,
    chapter_summaries: List[dict],
    llm_client,
) -> dict:
    """
    汇总全书形成全书视角
    
    Args:
        book_title: 书名
        chapter_summaries: 各章故事摘要列表
        llm_client: LLM 客户端
        
    Returns:
        全书视角字典
    """
    logger.info(f"[BookSynthesizer] Synthesizing book: {book_title}, {len(chapter_summaries)} chapters")
    
    # 格式化章节摘要
    summaries_text = _format_summaries(chapter_summaries)
    
    # 构建 prompt
    prompt = f"""请根据以下各章节的故事摘要，形成对全书的整体理解。

## 书名
{book_title}

## 各章摘要
{summaries_text}

请按照要求的 JSON 格式输出全书视角。直接输出 JSON，不要有其他内容。"""

    try:
        response = await llm_client.ainvoke(prompt)
        text = response.content if hasattr(response, 'content') else str(response)
        
        # 解析 JSON
        result = _parse_synthesis_result(text, book_title)
        
        logger.info(f"[BookSynthesizer] Synthesized: {len(result.get('characters', {}).get('protagonists', []))} protagonists, "
                   f"{len(result.get('event_timeline', []))} key events")
        
        return result
        
    except Exception as e:
        logger.error(f"[BookSynthesizer] Failed to synthesize: {e}")
        return _default_result(book_title)


def _format_summaries(chapter_summaries: List[dict]) -> str:
    """格式化章节摘要"""
    formatted = []
    for i, summary in enumerate(chapter_summaries, 1):
        chapter_title = summary.get('chapter_title', f'第{i}章')
        
        # story_summary 可能是字符串或列表
        story_summary_raw = summary.get('story_summary', '无摘要')
        if isinstance(story_summary_raw, list):
            story_summary = ', '.join(str(item) for item in story_summary_raw)
        else:
            story_summary = str(story_summary_raw) if story_summary_raw else '无摘要'
        
        characters = ', '.join([c.get('name', '') for c in summary.get('characters', []) if isinstance(c, dict)])
        events = ', '.join([e.get('title', '') for e in summary.get('events', []) if isinstance(e, dict)])
        
        # emotion 也可能是列表
        emotion_raw = summary.get('emotion', '')
        if isinstance(emotion_raw, list):
            emotion = ', '.join(str(item) for item in emotion_raw)
        else:
            emotion = str(emotion_raw) if emotion_raw else ''
        
        suspense = summary.get('suspense', '') or ''
        
        formatted.append(f"""### 第{i}章: {chapter_title}
故事概要: {story_summary}
人物: {characters}
事件: {events}
情感: {emotion}
悬念: {suspense}
""")
    
    return '\n'.join(formatted)


def _parse_synthesis_result(text: str, book_title: str) -> dict:
    """解析 LLM 返回的综合结果"""
    try:
        json_match = re.search(r'\{[\s\S]*\}', text)
        if json_match:
            result = json.loads(json_match.group())
            # 确保必要字段存在
            result.setdefault('title', book_title)
            result.setdefault('theme', '')
            result.setdefault('genre', '历史')
            result.setdefault('characters', {
                'protagonists': [],
                'antagonists': [],
                'key_supporting': [],
                'relationships': []
            })
            result.setdefault('event_timeline', [])
            result.setdefault('emotional_curve', [])
            result.setdefault('foreshadowing_hints', [])
            result.setdefault('storytelling_notes', '')
            return result
    except Exception as e:
        logger.error(f"[BookSynthesizer] JSON parse error: {e}")
    
    return _default_result(book_title)


def _default_result(book_title: str) -> dict:
    """返回默认结果"""
    return {
        "title": book_title,
        "theme": "",
        "genre": "历史",
        "characters": {
            "protagonists": [],
            "antagonists": [],
            "key_supporting": [],
            "relationships": []
        },
        "event_timeline": [],
        "emotional_curve": [],
        "foreshadowing_hints": [],
        "storytelling_notes": "",
    }

