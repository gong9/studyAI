"""
评书讲稿生成子 Agent

生成评书风格的讲稿：
- 口语化、生动有趣
- 有节奏感、抑扬顿挫
- 善用悬念和铺垫
- 适当加入评论和见解
"""

import json
import logging
import re
from typing import Optional

logger = logging.getLogger(__name__)

# 子 Agent 配置
storyteller_config = {
    "name": "storyteller",
    "description": "生成评书风格的讲稿，口语化、生动有趣、有节奏感",
    "system_prompt": """你是一位说书艺术家，像单田芳一样讲故事，让人欲罢不能。

## 评书风格特点

1. **口语化**：不是朗读，是"说"故事
   - 用"话说"、"且说"、"却说"开头
   - 多用短句，有节奏感
   - 可以有语气词："嘿"、"哎"、"得了"

2. **生动有趣**：让人听得津津有味
   - 描写细节，让画面感强
   - 适当夸张，增加戏剧性
   - 人物对话要有个性

3. **悬念铺垫**：勾着听众往下听
   - 开头要抓人
   - 中间要有起伏
   - 结尾要留悬念

4. **个人见解**：不只是讲故事
   - 可以点评人物
   - 可以分析局势
   - 让听众有代入感

## 常用句式

开场：
- "话说那 XXX..."
- "上回说到 XXX，这回咱们接着说..."
- "列位看官，今天咱们讲讲..."

过渡：
- "再说那 XXX..."
- "却说另一边..."
- "这边按下不表，单说..."

高潮：
- "这可不得了了！"
- "要说这 XXX，那可真是..."
- "正在这千钧一发之际..."

结尾：
- "欲知后事如何，且听下回分解。"
- "究竟 XXX 能否 YYY？咱们下回再说。"

## 输出格式

直接输出 Markdown 格式的评书讲稿：
- 用 ## 标注段落
- 自然分段，适合朗读
- 结尾必须有悬念收尾

## 注意事项

1. 不是照搬原文，是用自己的话重新演绎
2. 要有说书人的特色，像在现场讲一样
3. 长度适中，约 2000-3000 字（8-12分钟）
4. 如果有上回结尾，要做好衔接
""",
}


async def generate_episode_script(
    episode_number: int,
    episode_plan: dict,
    episode_content: str,
    book_overview: dict,
    previous_ending: Optional[str],
    llm_client,
) -> str:
    """
    生成单回评书讲稿
    
    Args:
        episode_number: 回目编号
        episode_plan: 本回规划
        episode_content: 本回涉及的原文内容
        book_overview: 全书视角（用于铺垫）
        previous_ending: 上一回结尾（用于衔接）
        llm_client: LLM 客户端
        
    Returns:
        评书讲稿（Markdown）
    """
    episode_title = episode_plan.get('title', f'第{episode_number}回')
    logger.info(f"[Storyteller] Generating script for: {episode_title}")
    
    # 格式化输入
    plan_text = _format_episode_plan(episode_plan)
    overview_text = _format_book_overview(book_overview)
    
    # 计算原文长度，用于提示
    content_length = len(episode_content)
    
    # 构建 prompt
    prompt = f"""请根据以下信息，生成一回评书讲稿。

## 回目信息
{plan_text}

## 全书背景（用于铺垫伏笔）
{overview_text}

## 上回结尾（需衔接）
{previous_ending or "（这是第一回，无需衔接）"}

## 本回原文内容（约{content_length}字，必须充分演绎）
{episode_content[:15000]}

---

## 重要要求

1. **长度要求**：原文有{content_length}字，讲稿长度**不得少于原文**，要充分展开、不要缩减！评书是演绎，会加入描写、点评、对话，只会更长不会更短。
2. **必须基于原文**：将上面的"本回原文内容"用评书风格重新演绎，保留所有重要情节和细节
3. **评书风格**：
   - 用"话说"、"且说"开头
   - 多用短句，有节奏感
   - 细节描写要丰富，让听众有画面感
   - 人物对话要生动，可以适当发挥
   - 可以加入说书人的点评和见解
4. **结构**：开头承接 → 中间展开（情节起伏）→ 结尾留悬念
5. **结尾悬念**："{episode_plan.get('cliffhanger', '欲知后事如何，且听下回分解。')}"

直接输出 Markdown 讲稿，不要有其他说明。"""

    try:
        response = await llm_client.ainvoke(prompt)
        script = response.content if hasattr(response, 'content') else str(response)
        
        # 清理格式
        script = _clean_script(script)
        
        logger.info(f"[Storyteller] Generated script: {len(script)} chars")
        
        return script
        
    except Exception as e:
        logger.error(f"[Storyteller] Failed to generate: {e}")
        return _default_script(episode_title)


def _format_episode_plan(plan: dict) -> str:
    """格式化回目规划"""
    return f"""回目：{plan.get('title', '')}
概要：{plan.get('summary', '')}
高潮：{plan.get('climax', '')}
悬念：{plan.get('cliffhanger', '')}
情感基调：{plan.get('emotion', '')}
铺垫提示：{', '.join(plan.get('foreshadowing', []))}"""


def _format_book_overview(overview: dict) -> str:
    """格式化全书视角（简化）"""
    if not overview:
        return "（无全书背景信息）"
    
    theme = overview.get('theme', '')
    protagonists = [p.get('name', '') for p in overview.get('characters', {}).get('protagonists', [])]
    hints = overview.get('foreshadowing_hints', [])[:3]
    hint_text = ', '.join([h.get('hint', '') for h in hints])
    
    return f"""主旨：{theme}
主角：{', '.join(protagonists)}
可铺垫的伏笔：{hint_text}"""


def _clean_script(script: str) -> str:
    """清理讲稿格式"""
    # 移除可能的代码块标记
    script = script.replace('```markdown', '').replace('```', '')
    return script.strip()


def _default_script(title: str) -> str:
    """返回默认讲稿"""
    return f"""## {title}

话说这一回，故事精彩非凡...

（讲稿生成失败，请重试）

欲知后事如何，且听下回分解。
"""


def extract_ending(script: str, char_count: int = 200) -> str:
    """
    提取讲稿结尾，用于下一回衔接
    
    Args:
        script: 讲稿内容
        char_count: 提取字数
        
    Returns:
        结尾内容
    """
    if not script:
        return ""
    
    # 取最后 N 个字符
    ending = script[-char_count:] if len(script) > char_count else script
    
    # 尝试从段落开头截取
    last_para = ending.rfind('\n\n')
    if last_para > 0:
        ending = ending[last_para:].strip()
    
    return ending

