"""子 Agent 模块"""

from .chapter_analyzer import chapter_analyzer_config
from .manuscript_generator import manuscript_generator_config
from .reviewer_enricher import reviewer_enricher_config
from .slide_designer import slide_designer_config, render_slides
from .ppt_master import create_design_spec_from_content

__all__ = [
    "chapter_analyzer_config",
    "manuscript_generator_config",
    "reviewer_enricher_config",
    "slide_designer_config",
    "render_slides",
    "create_design_spec_from_content",
]

