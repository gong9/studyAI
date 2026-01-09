"""
审核和润色 Prompt 模板

从 src/lib/teaching/agents/manuscript-reviewer.ts 和 smart-enrich-agent.ts 迁移
"""

REVIEWER_PROMPT = """你是一位资深的教学内容审核专家。请审核以下教学手稿，并给出改进建议。

## 教学规划
章节：{chapter}
教学目标：
{goals}

核心概念：
{concepts}

## 待审核的手稿内容
{draft_content}

## 审核维度

请从以下几个维度进行审核：

### 1. 内容完整性
- 是否覆盖了所有教学目标？
- 核心概念是否都有讲解？
- 有没有遗漏重要知识点？

### 2. 逻辑清晰度
- 内容组织是否有逻辑？
- 前后衔接是否自然？
- 难度递进是否合理？

### 3. 表达准确性
- 概念解释是否准确？
- 有没有专业性错误？
- 用语是否恰当？

### 4. 内容充实度
- 每个部分是否够详细？
- 例子/案例是否充足？
- 有没有需要补充的地方？

### 5. 风格一致性
- 语言风格是否统一？
- 是否符合目标受众？

## 输出格式 (JSON)

{{
  "overall_score": 8,  // 总体评分 1-10
  "passed": true,      // 是否通过审核
  "strengths": [       // 优点
    "结构清晰，逻辑性强",
    "概念解释准确"
  ],
  "suggestions": [     // 改进建议
    {{
      "type": "content",      // 类型: content | logic | accuracy | style
      "severity": "medium",   // 严重程度: low | medium | high
      "location": "第2节",     // 问题位置
      "issue": "XX概念讲解不够详细",
      "suggestion": "建议补充XX的具体应用场景和例子"
    }}
  ],
  "missing_topics": [  // 遗漏的主题
    "XX概念的应用场景"
  ],
  "summary": "整体质量良好，建议补充XX部分的内容深度。"
}}

请直接输出 JSON，不要有其他解释文字。"""


ENRICHER_PROMPT = """你是一位资深的教学内容优化专家。请根据审核建议，对教学手稿进行润色和补充。

## 原始手稿
{draft_content}

## 审核建议
{review_suggestions}

## 补充材料（RAG 检索结果）
{supplement_content}

## 任务

请根据审核建议对手稿进行优化：

1. **补充遗漏内容**：根据 missing_topics 添加相应内容
2. **改进问题部分**：根据 suggestions 修改对应位置
3. **保持原有优点**：不要破坏原稿中做得好的部分
4. **整合补充材料**：将 RAG 检索到的内容融入到讲稿中

## 输出要求

1. 直接输出完整的优化后手稿（Markdown 格式）
2. 保持原有的分页标记 `---`
3. 新增内容要自然融入，不要生硬拼接
4. 保持语言风格一致

请直接输出优化后的完整 Markdown 内容，不要有额外解释。"""


CHAPTER_ANALYZER_PROMPT = """你是一位资深教师，正在备课前阅读教材。请根据以下教材内容，提取该章节的核心知识点和摘要。

## 章节标题
{chapter_title}

## 教材相关内容
{content}

## 任务

### 1. 提取知识点
请识别并提取以下类型的知识点：
- **concept（概念）**：核心定义、基本概念
- **formula（公式）**：重要公式、计算方法
- **example（例题）**：典型例题、应用案例
- **pitfall（易错点）**：学生容易犯的错误、需要注意的地方
- **method（方法）**：解题方法、思路技巧

### 2. 生成摘要
用 200-400 字概括这个章节的核心内容，包括：
- 本节主要讲什么
- 核心知识点有哪些
- 学完应该掌握什么

## 输出格式 (JSON)
{{
  "key_points": [
    {{
      "type": "concept",
      "title": "知识点标题",
      "content": "具体内容描述（50-100字）",
      "importance": "high"
    }}
  ],
  "summary": "章节摘要内容..."
}}

## 注意事项
1. 只提取教材中明确提到的内容，不要编造
2. 每种类型的知识点不超过 5 个
3. 标记最重要的 2-3 个知识点为 "high" 重要性
4. 如果教材内容不足，可以少提取一些，但不要编造

请直接输出 JSON，不要有其他文字。"""


def format_reviewer_prompt(
    chapter: str = "",
    goals: list[str] = None,
    concepts: list[str] = None,
    draft_content: str = "",
    plan: dict = None,
) -> str:
    """格式化审核 Prompt"""
    # 如果传入 plan，从 plan 中提取信息
    if plan:
        chapter = plan.get("chapter", chapter)
        goals = plan.get("teaching_goals", goals or [])
        concepts = plan.get("key_concepts", concepts or [])
    
    goals_str = "\n".join(f"- {g}" for g in (goals or []))
    concepts_str = "、".join(concepts or [])
    
    return REVIEWER_PROMPT.format(
        chapter=chapter or "未命名章节",
        goals=goals_str or "（暂无）",
        concepts=concepts_str or "（暂无）",
        draft_content=draft_content,
    )


def format_review_prompt(
    draft_content: str,
    plan: dict,
) -> str:
    """格式化审核 Prompt（新接口）"""
    return format_reviewer_prompt(
        draft_content=draft_content,
        plan=plan,
    )


def format_enricher_prompt(
    draft_content: str,
    review_suggestions: str = "",
    supplement_content: str = "",
    review: dict = None,
) -> str:
    """格式化润色 Prompt"""
    # 如果传入 review dict，格式化为字符串
    if review and not review_suggestions:
        suggestions = review.get("suggestions", [])
        missing = review.get("missing_topics", [])
        
        parts = []
        if suggestions:
            parts.append("### 修改建议：")
            for s in suggestions:
                parts.append(f"- [{s.get('severity', 'medium')}] {s.get('location', '')}: {s.get('issue', '')}")
                parts.append(f"  建议: {s.get('suggestion', '')}")
        if missing:
            parts.append("\n### 遗漏主题：")
            parts.extend(f"- {m}" for m in missing)
        
        review_suggestions = "\n".join(parts)
    
    return ENRICHER_PROMPT.format(
        draft_content=draft_content,
        review_suggestions=review_suggestions or "（无审核建议）",
        supplement_content=supplement_content or "（无补充材料）",
    )


def format_enrich_prompt(
    draft_content: str,
    review: dict,
    supplement: str = "",
) -> str:
    """格式化润色 Prompt（新接口）"""
    return format_enricher_prompt(
        draft_content=draft_content,
        review=review,
        supplement_content=supplement,
    )


def format_analyzer_prompt(
    chapter_title: str,
    content: str,
) -> str:
    """格式化章节分析 Prompt"""
    return CHAPTER_ANALYZER_PROMPT.format(
        chapter_title=chapter_title,
        content=content,
    )

