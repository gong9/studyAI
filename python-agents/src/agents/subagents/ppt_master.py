"""
PPT Master Agent

PPT 生成的总控 Agent，编排多个子阶段：
- Phase 0: Smart Paginator - 智能分页（用户无需手动 ---）
- Phase 1: Content Analyst - 分析内容，确定设计调性
- Phase 2: Design Planner - 生成 DesignSpec，规划布局
- Phase 3: Slide Designer - 根据 DesignSpec 生成 HTML
- Phase 4: Layout QA - 检查布局问题
- Phase 5: Optimizer - 自动修复问题
"""

import json
import logging
import re
from typing import List, Dict, Any, Optional

from ...prompts.design_themes import (
    DesignSpec,
    LayoutDecision,
    ColorPalette,
    create_design_spec,
    get_theme,
    infer_theme_from_kb_type,
    calculate_infographic_size,
    suggest_infographic_position,
    THEMES,
)

logger = logging.getLogger(__name__)


# ==================== Phase 0: Smart Paginator ====================

SMART_PAGINATOR_PROMPT = """你是 PPT 分页专家，需要将手稿智能分割成多个幻灯片页面。

## 分页原则

1. **内容量控制**：
   - 每页内容量：200-400 字符最佳
   - 绝对不超过 600 字符（否则会溢出）
   - 内容少于 100 字符的可以考虑合并

2. **逻辑完整性**：
   - 不要在句子中间断开
   - 不要在段落中间断开
   - 一个完整的知识点应在同一页

3. **结构识别**：
   - 一级标题 `#` 必须是新页面的开始
   - 二级标题 `##` 通常需要分页
   - 连续的列表项（3-5 个）尽量保持在同一页
   - 超过 5 个列表项需要拆分

4. **特殊页面**：
   - 首页（标题页）保持简洁，只有标题和副标题
   - 尾页（总结页）保持简洁

## 输入手稿

{content}

## 输出格式

直接输出分页后的 Markdown，用 `---` 分隔每页。
不要添加任何解释，只输出分页后的内容。

分页后的 Markdown："""


async def smart_paginate(content: str, llm_client) -> str:
    """
    Phase 0: 智能分页
    
    将纯 Markdown 手稿智能分割成多个幻灯片页面。
    如果内容已经有 --- 分页标记，则跳过处理。
    
    Args:
        content: 原始 Markdown 内容
        llm_client: LLM 客户端
        
    Returns:
        带有 --- 分页标记的 Markdown 内容
        
    Raises:
        ValueError: 如果分页失败
    """
    # 检查是否已有分页标记
    if '\n---\n' in content or content.count('---') >= 2:
        logger.info("[SmartPaginator] Content already has pagination, skipping")
        return content
    
    # 检查内容是否太短，不需要分页
    if len(content.strip()) < 300:
        logger.info("[SmartPaginator] Content too short, no pagination needed")
        return content
    
    logger.info(f"[SmartPaginator] Starting smart pagination for {len(content)} chars...")
    
    prompt = SMART_PAGINATOR_PROMPT.format(content=content)
    
    response = await llm_client.ainvoke(prompt)
    paginated = response.content if hasattr(response, 'content') else str(response)
    
    # 清理可能的 markdown 代码块标记
    paginated = paginated.strip()
    if paginated.startswith('```'):
        paginated = re.sub(r'^```\w*\n?', '', paginated)
        paginated = re.sub(r'\n?```$', '', paginated)
    
    # 验证分页结果
    page_count = paginated.count('---') + 1
    if page_count < 2:
        raise ValueError(f"智能分页失败：输出只有 {page_count} 页，预期至少 2 页")
    
    logger.info(f"[SmartPaginator] Pagination complete: {page_count} pages")
    
    return paginated.strip()


# ==================== Phase 1: Content Analyst ====================

CONTENT_ANALYST_PROMPT = """你是一位资深的 PPT 设计总监，需要分析以下内容并确定设计方向。

## 任务

分析手稿内容，确定：
1. 最适合的设计主题
2. 目标受众
3. 整体调性
4. 关键页面（需要重点设计的页面）

## 可选主题

- business: 商务专业 - 简洁大方，适合正式场合
- tech: 科技感 - 深色背景，适合技术分享
- education: 教育培训 - 活泼友好，适合课堂教学
- legal: 法律政务 - 严肃权威，适合普法培训
- creative: 创意设计 - 大胆创新，适合创意展示
- minimal: 极简白 - 极度简洁，突出内容

## 手稿内容

{content}

## 知识库类型提示

{kb_type_hint}

## 输出格式（JSON）

```json
{{
  "theme": "business",
  "audience": "企业管理人员",
  "tone": "formal",
  "key_pages": [0, 3, 7],
  "analysis": "这是一份关于XXX的培训材料，适合使用商务风格..."
}}
```

请直接输出 JSON："""


async def analyze_content(
    content: str,
    llm_client,
    kb_type: str = "tech"
) -> Dict[str, Any]:
    """
    Phase 1: 内容分析
    
    分析内容确定设计调性，输出主题、受众、调性等信息
    """
    logger.info("[ContentAnalyst] Analyzing content...")
    
    # 知识库类型提示
    kb_hint = f"知识库类型为 {kb_type}，可参考但不必完全遵循"
    
    prompt = CONTENT_ANALYST_PROMPT.format(
        content=content[:3000],  # 限制长度
        kb_type_hint=kb_hint,
    )
    
    response = await llm_client.ainvoke(prompt)
    response_text = response.content if hasattr(response, 'content') else str(response)
    
    # 解析 JSON
    result = _parse_json_response(response_text)
    
    if not result:
        raise ValueError(f"内容分析失败：无法解析 LLM 响应。原始响应: {response_text[:200]}")
    
    logger.info(f"[ContentAnalyst] Theme: {result.get('theme')}, Audience: {result.get('audience')}")
    return result


# ==================== Phase 2: Design Planner ====================

DESIGN_PLANNER_PROMPT = """你是一位专业的 PPT 布局规划师，需要为每一页规划最佳布局。

## 任务

根据内容分析结果和每页内容，规划：
1. 每页的布局模式
2. 是否需要信息图
3. 信息图的位置和尺寸
4. 信息图的类型建议

## 设计主题

{theme_info}

## 布局模式说明

- full_text: 纯文字页面，不需要信息图
- text_with_infographic: 图文混排，需要信息图辅助
- hero_image: 以信息图为主，文字为辅

## 信息图位置

- none: 不需要信息图
- right: 放在右侧（适合内容较短的页面）
- bottom: 放在下方（适合内容较长的页面）

## 信息图尺寸

- small: 小尺寸（内容多时使用）
- medium: 中等尺寸
- large: 大尺寸（内容少时使用）

## 信息图类型

- sequence: 流程/步骤
- compare: 对比
- hierarchy: 层级
- list: 列表
- chart: 图表
- none: 不需要

## 页面内容

{pages_content}

## 规划原则

1. 控制信息图比例在 30-40%，不是每页都需要
2. 封面页和结尾页通常不需要信息图
3. 纯叙述内容使用 full_text
4. 有结构化数据（步骤、对比、列表）时考虑信息图
5. 内容少的页面可以用大信息图填充
6. 内容多的页面用小信息图或不用

## 输出格式（JSON）

```json
{{
  "decisions": [
    {{
      "page_index": 0,
      "layout_mode": "full_text",
      "infographic_position": "none",
      "infographic_size": "none",
      "infographic_type": "none",
      "content_ratio": 1.0,
      "reason": "封面页，保持简洁"
    }},
    {{
      "page_index": 1,
      "layout_mode": "text_with_infographic",
      "infographic_position": "bottom",
      "infographic_size": "medium",
      "infographic_type": "sequence",
      "content_ratio": 0.6,
      "reason": "流程说明，适合用步骤图"
    }}
  ]
}}
```

请直接输出 JSON："""


async def plan_design(
    sections: List[Dict[str, Any]],
    content_analysis: Dict[str, Any],
    llm_client,
) -> List[LayoutDecision]:
    """
    Phase 2: 设计规划
    
    根据内容分析结果，为每页规划布局
    """
    logger.info(f"[DesignPlanner] Planning layout for {len(sections)} pages...")
    
    # 构建主题信息
    theme = content_analysis.get("theme", "business")
    theme_config = get_theme(theme)
    theme_info = f"""
主题: {theme_config['name']}
调性: {content_analysis.get('tone', 'professional')}
受众: {content_analysis.get('audience', '通用受众')}
"""
    
    # 构建页面内容描述
    pages_content = []
    for s in sections:
        content = s.get("content", "")
        content_preview = content[:300] + "..." if len(content) > 300 else content
        has_list = bool(re.search(r'^\s*[-*]\s', content, re.MULTILINE))
        has_numbers = bool(re.search(r'^\s*\d+[.、]\s', content, re.MULTILINE))
        
        pages_content.append(f"""
### 第 {s.get('index', 0) + 1} 页：{s.get('title', '')}
内容长度: {len(content)} 字符
有列表: {'是' if has_list else '否'}
有编号: {'是' if has_numbers else '否'}
预览: {content_preview}
""")
    
    prompt = DESIGN_PLANNER_PROMPT.format(
        theme_info=theme_info,
        pages_content="\n".join(pages_content),
    )
    
    response = await llm_client.ainvoke(prompt)
    response_text = response.content if hasattr(response, 'content') else str(response)
    
    # 解析 JSON
    result = _parse_json_response(response_text)
    
    if not result or "decisions" not in result:
        raise ValueError(f"布局规划失败：无法解析 LLM 响应。原始响应: {response_text[:200]}")
    
    decisions = []
    for d in result["decisions"]:
        decisions.append(LayoutDecision(
            page_index=d.get("page_index", 0),
            layout_mode=d.get("layout_mode", "full_text"),
            infographic_position=d.get("infographic_position", "none"),
            infographic_size=d.get("infographic_size", "none"),
            infographic_type=d.get("infographic_type", "none"),
            content_ratio=d.get("content_ratio", 1.0),
            reason=d.get("reason", ""),
        ))
    
    # 确保覆盖所有页面（LLM 可能没有为所有页面生成决策）
    covered_indices = {d.page_index for d in decisions}
    for i, s in enumerate(sections):
        if i not in covered_indices:
            decisions.append(_create_default_decision(i, s))
    
    decisions.sort(key=lambda x: x.page_index)
    
    infographic_count = sum(1 for d in decisions if d.infographic_position != "none")
    logger.info(f"[DesignPlanner] Planned {infographic_count}/{len(sections)} pages with infographics")
    
    return decisions


def _create_default_decision(index: int, section: Dict[str, Any]) -> LayoutDecision:
    """创建默认布局决策"""
    content = section.get("content", "")
    content_length = len(content)
    has_list = bool(re.search(r'^\s*[-*]\s', content, re.MULTILINE))
    
    # 简单规则：首尾页不加信息图，中间页根据内容判断
    is_first_or_last = index == 0
    
    if is_first_or_last or content_length > 600:
        return LayoutDecision(
            page_index=index,
            layout_mode="full_text",
            infographic_position="none",
            infographic_size="none",
            infographic_type="none",
            content_ratio=1.0,
            reason="默认不添加信息图",
        )
    
    # 有列表或内容适中时考虑添加信息图
    if has_list or content_length < 400:
        size = calculate_infographic_size(content_length)
        position = suggest_infographic_position(content_length, has_list)
        
        return LayoutDecision(
            page_index=index,
            layout_mode="text_with_infographic",
            infographic_position=position,
            infographic_size=size,
            infographic_type="list",
            content_ratio=0.6 if position == "right" else 0.65,
            reason="内容适合添加信息图",
        )
    
    return LayoutDecision(
        page_index=index,
        layout_mode="full_text",
        infographic_position="none",
        infographic_size="none",
        infographic_type="none",
        content_ratio=1.0,
        reason="内容较长，不添加信息图",
    )


# ==================== 辅助函数 ====================

def _parse_json_response(text: str) -> Optional[dict]:
    """解析 LLM 返回的 JSON"""
    # 尝试提取 JSON 块
    json_match = re.search(r'```json?\s*([\s\S]*?)```', text, re.IGNORECASE)
    if json_match:
        text = json_match.group(1)
    
    # 尝试解析
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        # 尝试修复常见问题
        try:
            # 移除可能的前后缀
            text = re.sub(r'^[^{]*', '', text)
            text = re.sub(r'[^}]*$', '', text)
            return json.loads(text)
        except:
            return None


# ==================== 主入口 ====================

async def create_design_spec_from_content(
    content: str,
    sections: List[Dict[str, Any]],
    llm_client,
    kb_type: str = "tech",
) -> DesignSpec:
    """
    执行 Phase 1 和 Phase 2，生成完整的 DesignSpec
    
    Args:
        content: 完整的 Markdown 内容
        sections: 解析后的页面列表
        llm_client: LLM 客户端
        kb_type: 知识库类型
        
    Returns:
        DesignSpec: 完整的设计规格书
    """
    logger.info("[PPTMaster] Creating DesignSpec...")
    
    # Phase 1: 内容分析
    content_analysis = await analyze_content(content, llm_client, kb_type)
    
    # Phase 2: 设计规划
    layout_decisions = await plan_design(sections, content_analysis, llm_client)
    
    # 构建 DesignSpec
    theme = content_analysis.get("theme", "business")
    theme_config = get_theme(theme)
    
    design_spec = DesignSpec(
        theme=theme,
        theme_name=theme_config["name"],
        colors=theme_config["colors"],
        font_family=theme_config["font_family"],
        title_font_size=theme_config["title_font_size"],
        body_font_size=theme_config["body_font_size"],
        total_pages=len(sections),
        audience=content_analysis.get("audience", "通用受众"),
        tone=content_analysis.get("tone", "professional"),
        key_pages=content_analysis.get("key_pages", [0, len(sections) - 1]),
        layout_decisions=layout_decisions,
    )
    
    logger.info(f"[PPTMaster] DesignSpec created: theme={theme}, pages={len(sections)}")
    
    return design_spec

