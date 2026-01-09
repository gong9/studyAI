"""Prompt 模板模块"""

from .teaching_planner import TEACHING_PLANNER_PROMPT, SCENE_CONFIGS
from .manuscript_generator import get_manuscript_prompt, MANUSCRIPT_PROMPTS
from .reviewer import REVIEWER_PROMPT, ENRICHER_PROMPT

__all__ = [
    "TEACHING_PLANNER_PROMPT",
    "SCENE_CONFIGS",
    "get_manuscript_prompt",
    "MANUSCRIPT_PROMPTS",
    "REVIEWER_PROMPT",
    "ENRICHER_PROMPT",
]

