"""
Prompt 模板测试

验证从 TypeScript 迁移的 Prompt 模板格式正确。
"""

import pytest


def test_teaching_planner_prompt():
    """测试教学规划 Prompt 格式化"""
    from src.prompts.teaching_planner import format_planner_prompt, SCENE_CONFIGS
    
    prompt = format_planner_prompt(
        chapter_title="第一章：线性方程组",
        chapter_content="这是章节内容...",
        scene_type="k12_teaching",
    )
    
    # 验证包含关键信息
    assert "第一章：线性方程组" in prompt
    assert "这是章节内容..." in prompt
    assert "K12 教学" in prompt
    assert "生动有趣" in prompt


def test_scene_configs():
    """测试场景配置"""
    from src.prompts.teaching_planner import SCENE_CONFIGS, get_scene_config
    
    # 验证所有场景都有必要字段
    required_fields = ["name", "description", "audience", "style"]
    
    for scene_type, config in SCENE_CONFIGS.items():
        for field in required_fields:
            assert field in config, f"Scene {scene_type} missing field {field}"
    
    # 测试默认回退
    config = get_scene_config("unknown_scene")
    assert config == SCENE_CONFIGS["general"]


def test_manuscript_prompts():
    """测试手稿生成 Prompt"""
    from src.prompts.manuscript_generator import (
        MANUSCRIPT_PROMPTS,
        get_manuscript_prompt,
        format_manuscript_prompt,
    )
    
    # 验证所有场景都有 Prompt
    expected_scenes = ["k12_teaching", "tech_training", "company_training", "legal_training", "general"]
    
    for scene in expected_scenes:
        assert scene in MANUSCRIPT_PROMPTS
        prompt = get_manuscript_prompt(scene)
        assert len(prompt) > 100
    
    # 测试格式化
    formatted = format_manuscript_prompt(
        scene_type="tech_training",
        chapter="React Hooks",
        goals=["理解 useState", "掌握 useEffect"],
        concepts=["状态管理", "副作用"],
    )
    
    assert "React Hooks" in formatted
    assert "理解 useState" in formatted


def test_reviewer_prompts():
    """测试审核 Prompt"""
    from src.prompts.reviewer import (
        format_reviewer_prompt,
        format_enricher_prompt,
        format_analyzer_prompt,
    )
    
    # 测试审核 Prompt
    review_prompt = format_reviewer_prompt(
        chapter="测试章节",
        goals=["目标1", "目标2"],
        concepts=["概念1", "概念2"],
        draft_content="这是草稿内容...",
    )
    
    assert "测试章节" in review_prompt
    assert "目标1" in review_prompt
    assert "概念1" in review_prompt
    
    # 测试润色 Prompt
    enrich_prompt = format_enricher_prompt(
        draft_content="原始内容",
        review_suggestions='{"suggestions": []}',
        supplement_content="补充内容",
    )
    
    assert "原始内容" in enrich_prompt
    assert "补充内容" in enrich_prompt
    
    # 测试分析 Prompt
    analyze_prompt = format_analyzer_prompt(
        chapter_title="分析章节",
        content="章节内容",
    )
    
    assert "分析章节" in analyze_prompt

