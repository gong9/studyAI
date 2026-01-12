"""
幻灯片设计师 Agent（重构版）

使用 DesignSpec 驱动的多阶段 PPT 生成：
- Phase 1: Content Analyst - 分析内容（在 ppt_master.py）
- Phase 2: Design Planner - 规划布局（在 ppt_master.py）
- Phase 3: Slide Designer - 生成 HTML 和信息图
- Phase 4: Layout QA - 检查布局质量
- Phase 5: Optimizer - 自动修复问题
"""

import json
import logging
import re
from typing import Optional, List, Dict, Any

from ...prompts.infographic_syntax import (
    get_infographic_syntax_prompt,
    get_infographic_generation_prompt,
)
from ...prompts.design_themes import (
    DesignSpec,
    LayoutDecision,
    ColorPalette,
    create_design_spec,
    infer_theme_from_kb_type,
)
from .ppt_master import (
    create_design_spec_from_content,
    smart_paginate,
)

logger = logging.getLogger(__name__)


# ==================== 子 Agent 配置 ====================

slide_designer_config = {
    "name": "slide-designer",
    "description": "幻灯片设计师，使用 DesignSpec 驱动的多阶段 PPT 生成。",
    "system_prompt": """你是一位资深的 PPT 设计师，根据设计规格书（DesignSpec）生成精美的 HTML 幻灯片。

工作流程：
1. 接收 DesignSpec（包含主题、配色、布局规划）
2. 根据规划为每页生成 HTML
3. 根据规划为需要的页面生成信息图
4. 检查质量并修复问题

设计原则：
- 严格遵循 DesignSpec 的配色方案
- 根据布局决策调整内容比例
- 确保风格一致性
""",
}


# ==================== 数据结构 ====================

class ParsedSection:
    """解析后的幻灯片页面"""
    def __init__(self, index: int, title: str, content: str):
        self.index = index
        self.title = title
        self.content = content
    
    def to_dict(self) -> dict:
        return {
            "index": self.index,
            "title": self.title,
            "content": self.content,
        }


class SlideResult:
    """幻灯片生成结果"""
    def __init__(
        self,
        index: int,
        title: str,
        html: str,
        infographic: Optional[Dict[str, Any]] = None,
        qa_issues: Optional[List[str]] = None,
    ):
        self.index = index
        self.title = title
        self.html = html
        self.infographic = infographic
        self.qa_issues = qa_issues or []
    
    def to_dict(self) -> dict:
        result = {
            "index": self.index,
            "title": self.title,
            "html": self.html,
        }
        if self.infographic:
            result["infographic"] = self.infographic
        return result


# ==================== Phase 3: HTML 生成 ====================

def get_themed_html_prompt(design_spec: DesignSpec) -> str:
    """生成带主题的 HTML prompt（演示级字体）"""
    colors = design_spec.colors
    
    return f"""你是顶级 PPT 设计师，专注于创建清晰可读的演示文稿。

## 🎯 核心原则：演示级可读性

这是演示文稿，观众需要从远处看清！字体必须足够大！

## 🎨 设计规格

### 主题: {design_spec.theme_name}

### 配色方案
- 主色: {colors.primary}
- 背景色: {colors.background}
- 主标题: {colors.text_primary}
- 正文: {colors.text_secondary}

### 字体（演示级，必须大！）
font-family: {design_spec.font_family}
- **主标题: 44px**，font-weight: 700
- **正文: 22px**，line-height: 1.8
- **列表项: 20px**，line-height: 1.75
- **副标题: 28px**，font-weight: 600

## 📐 HTML 模板

```html
<div class="slide" style="
  width: 100%;
  height: 100%;
  background: {colors.background};
  padding: 56px 72px;
  box-sizing: border-box;
  position: relative;
  font-family: {design_spec.font_family};
">
  <!-- 左侧装饰条 -->
  <div style="position: absolute; left: 0; top: 56px; bottom: 56px; width: 5px; background: {colors.primary}; border-radius: 2px;"></div>
  
  <!-- 主标题（44px！）-->
  <h1 style="margin: 0 0 28px 0; font-size: 44px; font-weight: 700; color: {colors.text_primary}; letter-spacing: -0.02em;">
    标题
  </h1>
  
  <!-- 内容区（22px！）-->
  <div style="color: {colors.text_secondary}; font-size: 22px; line-height: 1.8;">
    ...
  </div>
</div>
```

## 📝 列表样式（20px 字体）

```html
<ul style="margin: 24px 0; padding-left: 0; list-style: none;">
  <li style="position: relative; padding-left: 28px; margin-bottom: 20px; font-size: 20px; line-height: 1.75; color: {colors.text_secondary};">
    <span style="position: absolute; left: 0; top: 12px; width: 8px; height: 8px; background: {colors.primary}; border-radius: 50%;"></span>
    列表内容
  </li>
</ul>
```

## Markdown 转 HTML

- `# 标题` → `<h1 style="font-size: 44px; ...">...</h1>`
- `## 小标题` → `<h2 style="font-size: 28px; font-weight: 600; color: {colors.text_primary}; margin: 24px 0 16px;">...</h2>`
- `- 列表项` → 上面的 ul/li 结构（20px）
- `**粗体**` → `<strong style="font-weight: 600; color: {colors.text_primary};">...</strong>`
- 段落 → `<p style="margin: 0 0 20px; font-size: 22px; line-height: 1.8;">...</p>`
- 代码块 ``` → `<pre style="background: #1e1e1e; color: #d4d4d4; padding: 20px; border-radius: 8px; font-size: 16px; line-height: 1.6; overflow-x: auto; font-family: 'SF Mono', Consolas, monospace;"><code>...</code></pre>`

**重要：代码块必须保留换行符！每行代码单独一行，不要合并成一行！**

**绝对禁止在 HTML 中出现 #、##、- 等 Markdown 符号！**

## 🚫 严格禁止

1. ❌ 小于 20px 的正文字体
2. ❌ Markdown 符号
3. ❌ 额外添加的文字
4. ❌ CSS 动画

## ✅ 输出要求

- 字体必须大：标题 44px，正文 22px，列表 20px
- 必须有左侧装饰条
- 只输出 `<div class="slide" ...>...</div>`
- **完整展示所有内容**
"""


async def generate_html_slide_v2(
    section: ParsedSection,
    design_spec: DesignSpec,
    llm_client,
) -> str:
    """
    Phase 3.1: 根据 DesignSpec 生成单页 HTML
    """
    # 获取该页的布局决策
    layout = None
    for d in design_spec.layout_decisions:
        if d.page_index == section.index:
            layout = d
            break
    
    is_first = section.index == 0
    is_last = section.index == design_spec.total_pages - 1
    
    # 计算内容区域宽度（如果有信息图在右侧）
    content_width = "100%"
    if layout and layout.infographic_position == "right":
        content_width = f"{int(layout.content_ratio * 100)}%"
    
    prompt = f"""{get_themed_html_prompt(design_spec)}

## 页面信息
- 页码：第 {section.index + 1} 页 / 共 {design_spec.total_pages} 页
- 是否封面页：{'是' if is_first else '否'}
- 是否结尾页：{'是' if is_last else '否'}
- 内容区域宽度：{content_width}

## 待转换的 Markdown 内容
```markdown
{section.content}
```

现在请将上面的 Markdown 转换为 HTML，直接输出 <div class="slide">...</div>："""

    response = await llm_client.ainvoke(prompt)
    html = response.content if hasattr(response, 'content') else str(response)
    
    # 清理 markdown 代码块标记
    html = re.sub(r'^```html?\n?', '', html.strip(), flags=re.IGNORECASE)
    html = re.sub(r'\n?```$', '', html.strip())
    
    # 验证 HTML 结果
    if not html or '<div' not in html.lower():
        raise ValueError(f"HTML 生成失败：第 {section.index + 1} 页生成结果无效")
    
    return html


async def generate_infographic_v2(
    section: ParsedSection,
    layout: LayoutDecision,
    llm_client,
) -> Optional[Dict[str, Any]]:
    """
    Phase 3.2: 根据布局决策生成信息图
    """
    if layout.infographic_position == "none":
        return None
    
    logger.info(f"[SlideDesigner] Generating infographic for page {section.index + 1}")
    
    # 根据信息图类型建议模板
    template_type = _suggest_template_v2(layout.infographic_type)
    
    # 使用带有严格内容限制的 Prompt（最多3条目，label最多4字，desc最多10字）
    prompt = get_infographic_generation_prompt(
        content=section.content,
        template_type=template_type
    )

    try:
        response = await llm_client.ainvoke(prompt)
        syntax = response.content if hasattr(response, 'content') else str(response)
        
        # 清理
        syntax = re.sub(r'^```(plain|text)?\n?', '', syntax.strip(), flags=re.IGNORECASE)
        syntax = re.sub(r'\n?```$', '', syntax.strip())
        
        # 验证语法
        if not syntax.startswith('infographic '):
            logger.warning(f"[SlideDesigner] Invalid infographic syntax, skipping")
            return None
        
        return {
            "syntax": syntax,
            "position": layout.infographic_position,
            "size": layout.infographic_size,
        }
        
    except Exception as e:
        logger.error(f"[SlideDesigner] Infographic generation failed: {e}")
        return None


# ==================== Phase 4: Layout QA ====================

QA_PROMPT = """你是一位 PPT 质量检查专家，请检查以下幻灯片是否存在问题。

## 检查项目

1. **内容完整性**：原始 Markdown 中的关键内容（标题、要点、数据）是否都在 HTML 中体现
2. **Prompt 泄露**：HTML 中是否包含类似 "重要提醒"、"Markdown 转换"、"输出格式" 等提示词内容
3. **Markdown 残留**：是否有 # ## - ** 等 Markdown 符号未转换
4. **布局问题**：内容是否溢出、布局是否合理
5. **风格一致**：颜色、字体是否符合设计规格

## 原始 Markdown 内容

```markdown
{original_content}
```

## 生成的 HTML

```html
{html}
```

## 信息图

位置: {infographic_position}
尺寸: {infographic_size}

## 输出格式（JSON）

```json
{{
  "has_issues": true,
  "issues": [
    {{
      "type": "content_missing",
      "description": "原始内容中的 'XXX' 未在 HTML 中体现",
      "severity": "high"
    }},
    {{
      "type": "prompt_leak",
      "description": "HTML 中包含 '重要提醒' 等提示词",
      "severity": "high"
    }}
  ],
  "suggestions": [
    "补充遗漏的内容",
    "删除 HTML 中的提示词内容"
  ]
}}
```

如果没有问题，返回：
```json
{{
  "has_issues": false,
  "issues": [],
  "suggestions": []
}}
```

请检查并输出 JSON："""


async def check_slide_quality(
    slide: SlideResult,
    original_content: str,
    design_spec: DesignSpec,
    llm_client,
) -> Dict[str, Any]:
    """
    Phase 4: 检查单页幻灯片质量
    
    Args:
        slide: 生成的幻灯片结果
        original_content: 原始 Markdown 内容（用于内容完整性检查）
        design_spec: 设计规格书
        llm_client: LLM 客户端
    """
    infographic_position = "none"
    infographic_size = "none"
    
    if slide.infographic:
        infographic_position = slide.infographic.get("position", "none")
        infographic_size = slide.infographic.get("size", "medium")
    
    prompt = QA_PROMPT.format(
        original_content=original_content[:1000],  # 限制长度
        html=slide.html[:2000],  # 限制长度
        infographic_position=infographic_position,
        infographic_size=infographic_size,
    )
    
    try:
        response = await llm_client.ainvoke(prompt)
        response_text = response.content if hasattr(response, 'content') else str(response)
        
        result = _parse_json_response(response_text)
        
        if result:
            return result
        else:
            # 简单规则检查
            return _rule_based_qa(slide, original_content)
            
    except Exception as e:
        logger.error(f"[LayoutQA] Check failed for page {slide.index}: {e}")
        return _rule_based_qa(slide, original_content)


def _rule_based_qa(slide: SlideResult, original_content: str = "") -> Dict[str, Any]:
    """基于规则的简单 QA 检查"""
    issues = []
    suggestions = []
    
    html = slide.html
    
    # 1. 检查内容完整性（关键词匹配）
    if original_content:
        # 提取原始内容中的关键词（标题、粗体内容）
        key_terms = []
        # 提取标题
        title_matches = re.findall(r'^#+\s*(.+)$', original_content, re.MULTILINE)
        key_terms.extend(title_matches)
        # 提取粗体内容
        bold_matches = re.findall(r'\*\*([^*]+)\*\*', original_content)
        key_terms.extend(bold_matches)
        
        # 检查关键词是否在 HTML 中出现
        missing_terms = []
        for term in key_terms[:5]:  # 只检查前 5 个关键词
            term_clean = term.strip()
            if len(term_clean) > 2 and term_clean not in html:
                missing_terms.append(term_clean)
        
        if missing_terms:
            issues.append({
                "type": "content_missing",
                "description": f"原始内容中的关键词未在 HTML 中体现: {', '.join(missing_terms[:3])}",
                "severity": "high",
            })
            suggestions.append("确保所有关键内容都被渲染到 HTML 中")
    
    # 2. 检查 Prompt 泄露
    leak_keywords = ["重要提醒", "Markdown 转换", "待转换的", "输出格式", "请直接输出"]
    for keyword in leak_keywords:
        if keyword in html:
            issues.append({
                "type": "prompt_leak",
                "description": f"HTML 中包含提示词 '{keyword}'",
                "severity": "high",
            })
            suggestions.append(f"删除 HTML 中的 '{keyword}' 内容")
    
    # 3. 检查 Markdown 残留
    md_patterns = [
        (r'(?<!\w)#{1,3}\s', "标题符号 #"),
        (r'^\s*[-*]\s', "列表符号 -"),
        (r'\*\*[^*]+\*\*', "粗体符号 **"),
    ]
    for pattern, desc in md_patterns:
        if re.search(pattern, html, re.MULTILINE):
            issues.append({
                "type": "markdown_residue",
                "description": f"HTML 中包含 {desc}",
                "severity": "medium",
            })
            suggestions.append(f"将 {desc} 转换为对应的 HTML 标签")
    
    return {
        "has_issues": len(issues) > 0,
        "issues": issues,
        "suggestions": suggestions,
    }


# ==================== Phase 5: Optimizer ====================

async def fix_slide_issues(
    slide: SlideResult,
    qa_result: Dict[str, Any],
    design_spec: DesignSpec,
    llm_client,
) -> SlideResult:
    """
    Phase 5: 根据 QA 结果修复问题
    """
    if not qa_result.get("has_issues", False):
        return slide
    
    issues = qa_result.get("issues", [])
    high_severity = any(i.get("severity") == "high" for i in issues)
    
    if not high_severity:
        # 低严重度问题，尝试简单修复
        fixed_html = _simple_fix(slide.html)
        slide.html = fixed_html
        slide.qa_issues = [i.get("description", "") for i in issues]
        return slide
    
    # 高严重度问题，需要重新生成
    logger.info(f"[Optimizer] Regenerating page {slide.index + 1} due to high severity issues")
    
    # 构建修复 prompt
    fix_prompt = f"""之前生成的 HTML 存在问题，请重新生成。

## 问题列表
{json.dumps(issues, ensure_ascii=False, indent=2)}

## 修复建议
{json.dumps(qa_result.get('suggestions', []), ensure_ascii=False, indent=2)}

## 原始 HTML（有问题的，请完整保留所有内容！）
```html
{slide.html}
```

请生成修复后的 HTML，确保：
1. 不包含任何提示词内容
2. 不包含 Markdown 符号
3. 只输出纯净的 <div class="slide">...</div>

修复后的 HTML："""

    try:
        response = await llm_client.ainvoke(fix_prompt)
        fixed_html = response.content if hasattr(response, 'content') else str(response)
        
        # 清理
        fixed_html = re.sub(r'^```html?\n?', '', fixed_html.strip(), flags=re.IGNORECASE)
        fixed_html = re.sub(r'\n?```$', '', fixed_html.strip())
        
        slide.html = fixed_html
        slide.qa_issues = [f"已修复: {i.get('description', '')}" for i in issues]
        
    except Exception as e:
        logger.error(f"[Optimizer] Fix failed for page {slide.index}: {e}")
        # 使用简单修复作为后备
        slide.html = _simple_fix(slide.html)
        slide.qa_issues = [i.get("description", "") for i in issues]
    
    return slide


def _simple_fix(html: str) -> str:
    """简单的规则修复"""
    # 移除常见的 prompt 泄露内容
    leak_patterns = [
        r'重要提醒[：:][^<]*',
        r'Markdown 转换[^<]*',
        r'待转换的[^<]*',
        r'请直接输出[^<]*',
        r'输出格式[^<]*',
    ]
    
    for pattern in leak_patterns:
        html = re.sub(pattern, '', html, flags=re.IGNORECASE)
    
    # 转换 Markdown 符号
    html = re.sub(r'(?<!\w)#+\s*([^<\n]+)', r'<h2>\1</h2>', html)
    html = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', html)
    
    return html


# ==================== 主入口 ====================

def parse_markdown_sections(content: str) -> List[ParsedSection]:
    """
    解析 Markdown 内容，按 --- 分隔成多个页面
    """
    # 支持多种分隔符格式
    sections = re.split(r'\n-{3,}\n|\n-{3,}$|^-{3,}\n', content)
    
    # 跳过 frontmatter
    if sections and (sections[0].strip().startswith('---') or 'theme:' in sections[0]):
        sections = sections[1:]
    
    parsed = []
    for idx, section in enumerate(sections):
        trimmed = section.strip()
        if not trimmed:
            continue
        
        # 提取标题
        title = f"第 {idx + 1} 页"
        for line in trimmed.split('\n'):
            line = line.strip()
            if line.startswith('# ') or line.startswith('## '):
                title = re.sub(r'^#+\s*', '', line)
                break
        
        parsed.append(ParsedSection(len(parsed), title, trimmed))
    
    return parsed


async def render_slides(
    slidev_md: str,
    llm_client,
    kb_type: str = "tech",
    enable_decoration: bool = True,
    enable_qa: bool = True,
) -> Dict[str, Any]:
    """
    主入口：渲染幻灯片（使用完整的多阶段架构）
    
    Phase 0: 智能分页（如果需要）
    Phase 1 & 2: 内容分析 + 设计规划 → DesignSpec
    Phase 3: 逐页设计 → HTML + 信息图
    Phase 4: 质量检查
    Phase 5: 自动修复
    """
    logger.info("[SlideDesigner] Starting slide rendering with DesignSpec...")
    
    # Phase 0: 智能分页（如果内容没有 --- 分页标记）
    paginated_content = await smart_paginate(slidev_md, llm_client)
    
    # 解析内容
    sections = parse_markdown_sections(paginated_content)
    if not sections:
        raise ValueError("没有可解析的幻灯片内容")
    
    logger.info(f"[SlideDesigner] Parsed {len(sections)} slides")
    
    # Phase 1 & 2: 创建 DesignSpec
    sections_dict = [s.to_dict() for s in sections]
    design_spec = await create_design_spec_from_content(
        content=paginated_content,  # 使用分页后的内容
        sections=sections_dict,
        llm_client=llm_client,
        kb_type=kb_type,
    )
    
    logger.info(f"[SlideDesigner] DesignSpec created: theme={design_spec.theme}")
    
    # Phase 3: 逐页设计
    slides = []
    for section in sections:
        logger.info(f"[SlideDesigner] Phase 3: Designing slide {section.index + 1}/{len(sections)}")
        
        # 获取该页的布局决策
        layout = None
        for d in design_spec.layout_decisions:
            if d.page_index == section.index:
                layout = d
                break
        
        # 生成 HTML
        html = await generate_html_slide_v2(section, design_spec, llm_client)
        
        # 生成信息图（如果需要）
        infographic = None
        if enable_decoration and layout and layout.infographic_position != "none":
            infographic = await generate_infographic_v2(section, layout, llm_client)
        
        slides.append(SlideResult(
            index=section.index,
            title=section.title,
            html=html,
            infographic=infographic,
        ))
    
    # Phase 4 & 5: 质量检查和修复
    if enable_qa:
        logger.info("[SlideDesigner] Phase 4 & 5: Quality check and optimization...")
        
        for i, slide in enumerate(slides):
            # 获取对应的原始 Markdown 内容
            original_content = sections[i].content if i < len(sections) else ""
            qa_result = await check_slide_quality(slide, original_content, design_spec, llm_client)
            
            if qa_result.get("has_issues", False):
                logger.info(f"[SlideDesigner] Page {slide.index + 1} has issues, fixing...")
                slides[i] = await fix_slide_issues(slide, qa_result, design_spec, llm_client)
    
    # 统计结果
    decorated_count = sum(1 for s in slides if s.infographic)
    fixed_count = sum(1 for s in slides if s.qa_issues)
    
    logger.info(f"[SlideDesigner] Complete: {len(slides)} slides, {decorated_count} with infographics, {fixed_count} fixed")
    
    # 构建返回结果
    result = {
        "slides": [s.to_dict() for s in slides],
        "total_count": len(slides),
        "decorated_count": decorated_count,
        "paginated_md": paginated_content,  # 分页后的 Markdown，用于前端解析
        "design_spec": design_spec.to_dict(),
        "qa_summary": {
            "checked": enable_qa,
            "fixed_count": fixed_count,
        },
    }
    
    return result


# ==================== 辅助函数 ====================

def _parse_json_response(text: str) -> Optional[dict]:
    """解析 LLM 返回的 JSON"""
    json_match = re.search(r'```json?\s*([\s\S]*?)```', text, re.IGNORECASE)
    if json_match:
        text = json_match.group(1)
    
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        try:
            text = re.sub(r'^[^{]*', '', text)
            text = re.sub(r'[^}]*$', '', text)
            return json.loads(text)
        except:
            return None


def _suggest_template_v2(infographic_type: str) -> str:
    """根据信息图类型建议模板"""
    suggestions = {
        "sequence": "sequence-snake-steps-simple 或 sequence-timeline-simple",
        "compare": "compare-binary-horizontal-underline-text-vs",
        "hierarchy": "hierarchy-tree-tech-style-capsule-item",
        "chart": "chart-pie-plain-text 或 chart-bar-plain-text",
        "list": "list-row-horizontal-icon-arrow",
        "none": "",
    }
    return suggestions.get(infographic_type, "list-row-horizontal-icon-arrow")
