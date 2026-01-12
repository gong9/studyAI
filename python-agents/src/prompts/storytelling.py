"""
讲书场景的 Prompt 模板
"""

# 故事提取 Prompt
STORY_EXTRACTOR_PROMPT = """你是一位资深的文学分析专家。

请分析以下章节内容，提取故事核心元素。

## 章节标题
{chapter_title}

## 章节内容
{chapter_content}

## 输出格式 (JSON)

{{
  "chapter_title": "章节标题",
  "story_summary": "本章故事概要（100-200字）",
  "characters": [
    {{"name": "人物名", "role": "主角/配角/反派", "description": "简介"}}
  ],
  "events": [
    {{"title": "事件名", "description": "事件描述", "importance": "high/medium/low"}}
  ],
  "conflicts": ["冲突点1", "冲突点2"],
  "climax": "本章高潮（如有）",
  "suspense": "本章结尾的悬念（如有）",
  "emotion": "整体情绪基调",
  "timeline": "时间背景"
}}

请直接输出 JSON。"""


# 全书综合 Prompt
BOOK_SYNTHESIZER_PROMPT = """你是一位资深的文学评论家和评书艺术家。

请根据以下各章节摘要，形成对全书的整体理解。

## 书名
{book_title}

## 各章摘要
{summaries}

## 输出格式 (JSON)

{{
  "title": "书名",
  "theme": "核心主旨",
  "genre": "类型",
  
  "characters": {{
    "protagonists": [
      {{"name": "主角名", "arc": "人物弧光", "peak_chapters": [1, 5, 10]}}
    ],
    "antagonists": [...],
    "key_supporting": [...],
    "relationships": [
      {{"from": "人物A", "to": "人物B", "type": "关系类型"}}
    ]
  }},
  
  "event_timeline": [
    {{"chapter": 3, "event": "事件名", "importance": "high", "type": "climax"}}
  ],
  
  "emotional_curve": [
    {{"chapter_range": [1, 3], "tone": "励志/紧张"}}
  ],
  
  "foreshadowing_hints": [
    {{"at_chapter": 1, "hint": "伏笔内容", "payoff_chapter": 8}}
  ],
  
  "storytelling_notes": "评书创作建议"
}}

请直接输出 JSON。"""


# 分集规划 Prompt
EPISODE_PLANNER_PROMPT = """你是一位资深的评书艺术家，像单田芳一样善于把握故事节奏。

请根据以下信息，规划评书回目。

## 书名
{book_title}

## 目标每回时长
约 {target_duration} 分钟

## 全书视角
{overview}

## 各章摘要
{summaries}

## 输出格式 (JSON)

{{
  "book_title": "书名",
  "total_episodes": 35,
  
  "episodes": [
    {{
      "episode_number": 1,
      "title": "第一回：标题",
      "chapter_range": {{"start_chapter": 1, "end_chapter": 1}},
      "summary": "本回概要",
      "climax": "高潮点",
      "cliffhanger": "悬念",
      "emotion": "情感基调",
      "estimated_duration_minutes": 10
    }}
  ],
  
  "pacing_notes": "节奏建议"
}}

请直接输出 JSON。"""


# 评书讲稿 Prompt
STORYTELLER_PROMPT = """你是一位说书艺术家，像单田芳一样讲故事。

## 回目信息
{episode_plan}

## 全书背景
{book_overview}

## 上回结尾
{previous_ending}

## 本回原文内容
{episode_content}

---

请用评书风格演绎成一回精彩的讲稿。

风格要求：
1. 口语化，像在现场讲
2. 有节奏感，抑扬顿挫
3. 善用悬念和铺垫
4. 结尾必须留悬念

直接输出 Markdown 讲稿。"""

