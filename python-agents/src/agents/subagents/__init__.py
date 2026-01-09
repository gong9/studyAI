"""子 Agent 模块"""

from .chapter_analyzer import chapter_analyzer_config
from .manuscript_generator import manuscript_generator_config
from .reviewer_enricher import reviewer_enricher_config

__all__ = [
    "chapter_analyzer_config",
    "manuscript_generator_config",
    "reviewer_enricher_config",
]

