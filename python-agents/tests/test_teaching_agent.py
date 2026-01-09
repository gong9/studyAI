"""
Teaching Agent 测试

测试主 Agent 的功能。
"""

import pytest


def test_plan_parsing():
    """测试教学规划 JSON 解析"""
    from src.agents.teaching_agent import TeachingAgent
    
    # 模拟 LLM 返回的 JSON
    sample_response = '''
    这是教学规划：
    
    ```json
    {
      "chapter": "第一章",
      "summary": "测试摘要",
      "teaching_goals": ["目标1", "目标2"],
      "key_concepts": ["概念1"],
      "sections": [
        {
          "title": "引入",
          "key_points": ["要点1"],
          "duration_minutes": 5
        }
      ],
      "total_duration_minutes": 30,
      "notes": "注意事项"
    }
    ```
    '''
    
    # 创建 Agent 实例需要 LLM，这里只测试解析逻辑
    import json
    import re
    
    json_match = re.search(r'\{[\s\S]*\}', sample_response)
    assert json_match is not None
    
    json_str = json_match.group().replace('```json', '').replace('```', '')
    parsed = json.loads(json_str)
    
    assert parsed["chapter"] == "第一章"
    assert len(parsed["sections"]) == 1
    assert parsed["sections"][0]["title"] == "引入"


def test_scene_type_mapping():
    """测试场景类型映射"""
    from src.prompts.teaching_planner import get_scene_config
    
    # 测试各种场景类型
    test_cases = [
        ("k12_teaching", "K12 教学"),
        ("tech_training", "技术培训"),
        ("company_training", "企业制度培训"),
        ("legal_training", "普法讲座"),
        ("general", "通用演示"),
    ]
    
    for scene_type, expected_name in test_cases:
        config = get_scene_config(scene_type)
        assert config["name"] == expected_name


def test_key_points_formatting():
    """测试知识点格式化"""
    from src.agents.subagents.manuscript_generator import _format_key_points
    
    key_points = [
        {"type": "concept", "title": "概念1", "content": "描述1", "importance": "high"},
        {"type": "formula", "title": "公式1", "content": "描述2", "importance": "medium"},
    ]
    
    formatted = _format_key_points(key_points)
    
    assert "概念" in formatted
    assert "公式" in formatted
    assert "【重要】" in formatted
    assert "概念1" in formatted


def test_sections_formatting():
    """测试节次格式化"""
    from src.agents.subagents.manuscript_generator import _format_sections
    
    sections = [
        {"type": "intro", "title": "引入", "duration_minutes": 5, "key_points": ["要点1"]},
        {"type": "content", "title": "主体", "duration_minutes": 20, "key_points": []},
    ]
    
    formatted = _format_sections(sections)
    
    assert "引入" in formatted
    assert "主体" in formatted
    assert "5分钟" in formatted
    assert "要点1" in formatted


def test_markdown_cleaning():
    """测试 Markdown 清理"""
    from src.agents.subagents.manuscript_generator import _clean_markdown
    
    test_cases = [
        ("```markdown\n内容\n```", "内容"),
        ("```md\n内容\n```", "内容"),
        ("```\n内容\n```", "内容"),
        ("正常内容", "正常内容"),
    ]
    
    for input_text, expected in test_cases:
        result = _clean_markdown(input_text)
        assert result == expected

