"""
教学规划 Prompt 模板

从 src/lib/teaching/agents/teaching-planner.ts 迁移
"""

# 场景配置
SCENE_CONFIGS = {
    "k12_teaching": {
        "name": "K12 教学",
        "description": "面向中小学生的课堂教学",
        "audience": "学生",
        "style": "生动有趣、循序渐进、多用例子、注重互动",
    },
    "tech_training": {
        "name": "技术培训",
        "description": "面向开发者的技术分享",
        "audience": "开发者/技术人员",
        "style": "逻辑清晰、由浅入深、重视原理、配合代码示例",
    },
    "product_launch": {
        "name": "产品发布",
        "description": "产品介绍和发布演示",
        "audience": "潜在用户/客户",
        "style": "突出价值、展示亮点、引导行动",
    },
    "business_report": {
        "name": "商业汇报",
        "description": "商业分析和决策汇报",
        "audience": "管理层/决策者",
        "style": "数据驱动、结论先行、重点突出",
    },
    "company_training": {
        "name": "企业制度培训",
        "description": "公司规章制度培训",
        "audience": "员工",
        "style": "通俗易懂、重点突出、结合案例",
    },
    "legal_training": {
        "name": "普法讲座",
        "description": "法律知识普及",
        "audience": "普通群众",
        "style": "通俗易懂、生活化案例、实用指导",
    },
    "general": {
        "name": "通用演示",
        "description": "通用演示文稿",
        "audience": "通用",
        "style": "清晰有条理、重点突出",
    },
}


TEACHING_PLANNER_PROMPT = """你是一位资深的培训规划专家。请阅读以下章节内容，根据内容本身的结构来规划讲解。

## 章节信息
标题：{chapter_title}
场景：{scene_name}（{scene_description}）
受众：{audience}
风格要求：{style}

## 章节内容
{chapter_content}

## 任务
1. **理解内容结构**：这章讲了什么？分几个部分？每部分的核心是什么？
2. **识别重点**：哪些是必须讲的核心概念？哪些是辅助说明？
3. **按内容组织**：根据内容本身的逻辑来划分讲解单元，不要强套固定模板
4. **适当扩展**：可以补充开场引入和结尾总结，但主体部分要忠于原文结构

## 输出格式 (JSON)
{{
  "chapter": "章节名称",
  "summary": "一句话概括这章讲什么",
  "teaching_goals": ["学完能掌握xxx", "学完能理解xxx"],
  "key_concepts": ["核心概念1", "核心概念2"],
  "sections": [
    {{
      "title": "段落/小节标题（来自原文或自拟）",
      "key_points": ["这部分要讲的要点1", "要点2"],
      "duration_minutes": 5,
      "notes": "讲解建议（可选）"
    }}
  ],
  "total_duration_minutes": 30,
  "notes": "整体讲解建议"
}}

## 重要原则
1. **忠于原文结构**：如果原文有明确的章节划分（如 1.1、1.2 或 小节标题），就按那个来
2. **不强套模板**：不需要必须有"背景介绍"、"架构讲解"等固定环节，按内容需要来
3. **灵活划分**：一个 section 可以是一个概念、一个例子、一个对比，取决于内容
4. **合理时间**：根据内容复杂度分配时间，重要的多讲，简单的少讲
5. **保持完整**：确保原文的核心内容都覆盖到

请直接输出 JSON，不要有其他解释文字。"""


def get_scene_config(scene_type: str) -> dict:
    """获取场景配置"""
    return SCENE_CONFIGS.get(scene_type, SCENE_CONFIGS["general"])


def format_planner_prompt(
    chapter_title: str,
    chapter_content: str,
    scene_type: str = "general",
) -> str:
    """格式化规划 Prompt"""
    config = get_scene_config(scene_type)
    
    return TEACHING_PLANNER_PROMPT.format(
        chapter_title=chapter_title,
        scene_name=config["name"],
        scene_description=config["description"],
        audience=config["audience"],
        style=config["style"],
        chapter_content=chapter_content,
    )

