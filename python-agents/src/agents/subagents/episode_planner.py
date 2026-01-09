"""
分集规划子 Agent

基于全书视角和各章摘要，规划评书回目：
- 每回的内容范围
- 每回的高潮点
- 每回的悬念（cliffhanger）
- 铺垫提示
"""

import json
import logging
import re
from typing import List

logger = logging.getLogger(__name__)

# 子 Agent 配置
episode_planner_config = {
    "name": "episode_planner",
    "description": "基于全书视角规划评书回目，确定每回范围、高潮点和悬念",
    "system_prompt": """你是一位资深的评书艺术家，像单田芳一样善于把握故事节奏。

你的任务是将一本书规划成评书回目，让听众欲罢不能。

## 分集原则

1. **每回要有起承转合**：开头承接上回，中间展开情节，结尾留悬念
2. **悬念是关键**：每回结尾必须有让人想继续听的悬念（"欲知后事如何..."）
3. **不在高潮中间硬切**：让高潮完整呈现，然后在转折处收尾
4. **内容量相对均匀**：每回时长控制在 8-12 分钟
5. **情绪有起伏**：紧张与舒缓交替，避免一直紧绷

## 输出格式 (JSON)

{
  "book_title": "书名",
  "total_episodes": 35,
  "estimated_total_duration_minutes": 350,
  
  "episodes": [
    {
      "episode_number": 1,
      "title": "第一回：朱元璋的逆袭之路",
      "chapter_range": {
        "start_chapter": 1,
        "end_chapter": 1,
        "content_note": "第一章全部"
      },
      "summary": "本回概要（50字以内）",
      "opening": "开场提示（如何引入）",
      "climax": "本回高潮点",
      "cliffhanger": "欲知后事如何...（具体的悬念内容）",
      "foreshadowing": ["本回可以铺垫的伏笔"],
      "emotion": "本回情感基调",
      "estimated_duration_minutes": 10
    }
  ],
  
  "pacing_notes": "整体节奏把控建议"
}

## 注意事项
1. 回目标题要有评书味，吸引人
2. 悬念要具体，不能太笼统
3. 前几回特别重要，要抓住听众
4. 大高潮要给足篇幅
5. 结局要有仪式感
""",
}


async def plan_episodes(
    book_title: str,
    book_overview: dict,
    chapter_summaries: List[dict],
    target_duration_minutes: int,
    llm_client,
) -> dict:
    """
    规划评书回目
    
    Args:
        book_title: 书名
        book_overview: 全书视角
        chapter_summaries: 各章摘要
        target_duration_minutes: 目标每回时长
        llm_client: LLM 客户端
        
    Returns:
        分集规划字典
    """
    logger.info(f"[EpisodePlanner] Planning episodes for: {book_title}, "
               f"{len(chapter_summaries)} chapters, target {target_duration_minutes}min/episode")
    
    # 格式化输入
    overview_text = _format_overview(book_overview)
    summaries_text = _format_summaries(chapter_summaries)
    
    # 构建 prompt
    prompt = f"""请根据以下全书信息，规划评书回目。

## 书名
{book_title}

## 目标每回时长
约 {target_duration_minutes} 分钟

## 全书视角
{overview_text}

## 各章摘要
{summaries_text}

请按照要求的 JSON 格式输出分集规划。直接输出 JSON，不要有其他内容。"""

    try:
        response = await llm_client.ainvoke(prompt)
        text = response.content if hasattr(response, 'content') else str(response)
        
        # 解析 JSON，传入章节数量用于分配 chapter_range
        chapter_count = len(chapter_summaries)
        result = _parse_plan_result(text, book_title, chapter_count)
        
        logger.info(f"[EpisodePlanner] Planned {result.get('total_episodes', 0)} episodes")
        
        return result
        
    except Exception as e:
        logger.error(f"[EpisodePlanner] Failed to plan: {e}")
        return _default_result(book_title, len(chapter_summaries))


def _format_overview(overview: dict) -> str:
    """格式化全书视角"""
    theme = overview.get('theme', '')
    protagonists = [p.get('name', '') for p in overview.get('characters', {}).get('protagonists', [])]
    events = [e.get('event', '') for e in overview.get('event_timeline', [])[:10]]
    
    return f"""主旨: {theme}
主角: {', '.join(protagonists)}
关键事件: {', '.join(events)}
创作建议: {overview.get('storytelling_notes', '')}"""


def _format_summaries(summaries: List[dict]) -> str:
    """格式化章节摘要（简化版，避免太长）"""
    formatted = []
    for i, s in enumerate(summaries, 1):
        title = s.get('chapter_title', f'第{i}章')
        
        # story_summary 可能是字符串或列表
        summary_raw = s.get('story_summary', '')
        if isinstance(summary_raw, list):
            summary = ', '.join(str(item) for item in summary_raw[:5])  # 只取前5项
        elif isinstance(summary_raw, str):
            summary = summary_raw[:100]
        else:
            summary = str(summary_raw)[:100] if summary_raw else ''
        
        suspense = s.get('suspense', '') or ''
        formatted.append(f"第{i}章 {title}: {summary}... [悬念: {suspense}]")
    
    return '\n'.join(formatted)


def _parse_plan_result(text: str, book_title: str, chapter_count: int = 41) -> dict:
    """解析分集规划结果"""
    try:
        json_match = re.search(r'\{[\s\S]*\}', text)
        if json_match:
            result = json.loads(json_match.group())
            result.setdefault('book_title', book_title)
            result.setdefault('total_episodes', len(result.get('episodes', [])))
            result.setdefault('episodes', [])
            result.setdefault('pacing_notes', '')
            
            episodes = result.get('episodes', [])
            episode_count = len(episodes)
            
            # 计算每回大约覆盖多少章节
            chapters_per_episode = max(1, chapter_count / episode_count) if episode_count > 0 else 1
            
            # 确保每个 episode 有必要字段
            for i, ep in enumerate(episodes):
                ep.setdefault('episode_number', i + 1)
                ep.setdefault('title', f'第{i+1}回')
                ep.setdefault('summary', '')
                ep.setdefault('climax', '')
                ep.setdefault('cliffhanger', '')
                ep.setdefault('estimated_duration_minutes', 10)
                
                # 如果没有 chapter_range，自动分配
                if 'chapter_range' not in ep:
                    start_ch = int(i * chapters_per_episode) + 1
                    end_ch = int((i + 1) * chapters_per_episode)
                    end_ch = min(end_ch, chapter_count)  # 不超过总章节数
                    ep['chapter_range'] = {
                        'start_chapter': start_ch,
                        'end_chapter': end_ch,
                        'content_note': f'第{start_ch}章到第{end_ch}章'
                    }
            
            return result
    except Exception as e:
        logger.error(f"[EpisodePlanner] JSON parse error: {e}")
    
    return _default_result(book_title, chapter_count)


def _default_result(book_title: str, chapter_count: int) -> dict:
    """返回默认结果"""
    # 简单按章节数估算回数
    episode_count = max(chapter_count, 10)
    episodes = []
    for i in range(1, episode_count + 1):
        episodes.append({
            "episode_number": i,
            "title": f"第{i}回",
            "chapter_range": {"start_chapter": i, "end_chapter": i},
            "summary": "",
            "climax": "",
            "cliffhanger": "",
            "estimated_duration_minutes": 10,
        })
    
    return {
        "book_title": book_title,
        "total_episodes": episode_count,
        "episodes": episodes,
        "pacing_notes": "",
    }

