"""
PPT 设计主题配置

提供多种专业配色方案，让 PPT 不再千篇一律。
根据内容主题动态选择最合适的设计风格。
"""

from typing import Dict, List, Any
from dataclasses import dataclass, field


# ==================== 数据结构 ====================

@dataclass
class ColorPalette:
    """配色方案"""
    primary: str       # 主色
    secondary: str     # 辅助色
    accent: str        # 强调色
    background: str    # 背景色
    text_primary: str  # 主文字
    text_secondary: str  # 次要文字
    border: str        # 边框/分割线


@dataclass
class LayoutDecision:
    """单页布局决策"""
    page_index: int
    layout_mode: str           # full_text, text_with_infographic, hero_image
    infographic_position: str  # none, right, bottom, inline
    infographic_size: str      # none, small, medium, large
    infographic_type: str      # 信息图类型建议
    content_ratio: float       # 内容区域占比 (0-1)
    reason: str


@dataclass 
class DesignSpec:
    """
    设计规格书 - PPT 设计的完整规划
    
    这是 DeepAgent 各阶段传递的核心数据结构：
    - Phase 1 (Content Analyst) 确定 theme
    - Phase 2 (Design Planner) 填充完整 DesignSpec
    - Phase 3 (Slide Designer) 根据 DesignSpec 生成 HTML
    - Phase 4 (Layout QA) 根据 DesignSpec 检查质量
    """
    # 主题信息
    theme: str                          # business, tech, education, creative, legal
    theme_name: str                     # 主题中文名
    
    # 配色方案
    colors: ColorPalette
    
    # 字体
    font_family: str
    title_font_size: str
    body_font_size: str
    
    # 内容分析结果
    total_pages: int
    audience: str                       # 受众描述
    tone: str                           # 调性: formal, casual, professional
    key_pages: List[int] = field(default_factory=list)  # 关键页面索引
    
    # 每页布局决策
    layout_decisions: List[LayoutDecision] = field(default_factory=list)
    
    def to_dict(self) -> dict:
        """转换为字典"""
        return {
            "theme": self.theme,
            "theme_name": self.theme_name,
            "colors": {
                "primary": self.colors.primary,
                "secondary": self.colors.secondary,
                "accent": self.colors.accent,
                "background": self.colors.background,
                "text_primary": self.colors.text_primary,
                "text_secondary": self.colors.text_secondary,
                "border": self.colors.border,
            },
            "font_family": self.font_family,
            "title_font_size": self.title_font_size,
            "body_font_size": self.body_font_size,
            "total_pages": self.total_pages,
            "audience": self.audience,
            "tone": self.tone,
            "key_pages": self.key_pages,
            "layout_decisions": [
                {
                    "page_index": d.page_index,
                    "layout_mode": d.layout_mode,
                    "infographic_position": d.infographic_position,
                    "infographic_size": d.infographic_size,
                    "infographic_type": d.infographic_type,
                    "content_ratio": d.content_ratio,
                    "reason": d.reason,
                }
                for d in self.layout_decisions
            ],
        }


# ==================== 预定义主题（高级低饱和度配色）====================

THEMES: Dict[str, Dict[str, Any]] = {
    # 默认主题：靛蓝紫（Indigo）- 高级感首选
    "business": {
        "name": "商务靛蓝",
        "description": "高级感靛蓝紫配色，简洁优雅，适合正式商务场合",
        "colors": ColorPalette(
            primary="#4F46E5",      # 靛蓝紫 - 高级点缀色
            secondary="#6366F1",    # 浅靛蓝
            accent="#F59E0B",       # 琥珀强调
            background="#FAFBFC",   # 微冷白背景
            text_primary="#1A1D21", # 90% 黑 - 主标题
            text_secondary="#4A5568",  # 中性灰 - 正文
            border="#E2E8F0",       # 淡灰边框
        ),
        "font_family": "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif",
        "title_font_size": "44px",  # 演示级大字体
        "body_font_size": "22px",   # 演示级正文
        "tone": "formal",
    },
    
    # 海洋蓝主题 - 适合科技/互联网
    "tech": {
        "name": "科技海蓝",
        "description": "明亮海蓝配色，现代科技感，适合技术分享",
        "colors": ColorPalette(
            primary="#0EA5E9",      # 明亮蓝
            secondary="#38BDF8",    # 浅天蓝
            accent="#10B981",       # 翠绿强调
            background="#F8FAFC",   # 极浅蓝白
            text_primary="#0F172A", # 深蓝灰
            text_secondary="#475569",  # 中性蓝灰
            border="#E2E8F0",
        ),
        "font_family": "Inter, -apple-system, 'PingFang SC', sans-serif",
        "title_font_size": "44px",  # 演示级大字体
        "body_font_size": "22px",   # 演示级正文
        "tone": "professional",
    },
    
    # 翠绿主题 - 适合教育/环保
    "education": {
        "name": "教育翠绿",
        "description": "清新翠绿配色，活泼友好，适合教育培训",
        "colors": ColorPalette(
            primary="#10B981",      # 翠绿
            secondary="#34D399",    # 浅翠绿
            accent="#F59E0B",       # 琥珀强调
            background="#F9FAFB",   # 纯净白
            text_primary="#1F2937", # 深灰
            text_secondary="#4B5563",  # 中灰
            border="#E5E7EB",
        ),
        "font_family": "-apple-system, 'PingFang SC', sans-serif",
        "title_font_size": "44px",  # 演示级大字体
        "body_font_size": "22px",   # 演示级正文
        "tone": "casual",
    },
    
    # 紫罗兰主题 - 适合法律/政务
    "legal": {
        "name": "法政紫罗兰",
        "description": "沉稳紫罗兰配色，严肃权威，适合法律政务",
        "colors": ColorPalette(
            primary="#7C3AED",      # 紫罗兰
            secondary="#8B5CF6",    # 浅紫
            accent="#EC4899",       # 粉色强调
            background="#FAFAFA",   # 暖白
            text_primary="#18181B", # 接近黑
            text_secondary="#52525B",  # 中性灰
            border="#E4E4E7",
        ),
        "font_family": "-apple-system, 'PingFang SC', 'SimSun', serif",
        "title_font_size": "44px",  # 演示级大字体
        "body_font_size": "22px",   # 演示级正文
        "tone": "formal",
    },
    
    # 珊瑚橙主题 - 适合创意/营销
    "creative": {
        "name": "创意珊瑚",
        "description": "活力珊瑚橙配色，热情大胆，适合创意展示",
        "colors": ColorPalette(
            primary="#F97316",      # 珊瑚橙
            secondary="#FB923C",    # 浅橙
            accent="#EF4444",       # 红色强调
            background="#FFFBF5",   # 暖白
            text_primary="#1C1917", # 暖黑
            text_secondary="#57534E",  # 暖灰
            border="#E7E5E4",
        ),
        "font_family": "-apple-system, 'PingFang SC', sans-serif",
        "title_font_size": "44px",  # 演示级大字体
        "body_font_size": "22px",   # 演示级正文
        "tone": "casual",
    },
    
    # 极简石墨主题 - 纯净专业
    "minimal": {
        "name": "极简石墨",
        "description": "极简石墨配色，专注内容，适合正式演示",
        "colors": ColorPalette(
            primary="#374151",      # 石墨灰
            secondary="#6B7280",    # 中灰
            accent="#3B82F6",       # 蓝色点缀
            background="#FFFFFF",   # 纯白
            text_primary="#111827", # 接近黑
            text_secondary="#6B7280",  # 中灰
            border="#F3F4F6",
        ),
        "font_family": "-apple-system, 'Helvetica Neue', 'PingFang SC', sans-serif",
        "title_font_size": "44px",  # 演示级大字体
        "body_font_size": "22px",   # 演示级正文
        "tone": "professional",
    },
    
    # 深空主题 - 暗色模式（可选）
    "dark": {
        "name": "深空暗色",
        "description": "沉稳深空配色，高级暗色模式",
        "colors": ColorPalette(
            primary="#60A5FA",      # 亮蓝
            secondary="#93C5FD",    # 浅蓝
            accent="#FBBF24",       # 金色强调
            background="#0F172A",   # 深蓝黑
            text_primary="#F1F5F9", # 浅白
            text_secondary="#94A3B8",  # 银灰
            border="#334155",
        ),
        "font_family": "Inter, -apple-system, 'PingFang SC', sans-serif",
        "title_font_size": "44px",  # 演示级大字体
        "body_font_size": "22px",   # 演示级正文
        "tone": "professional",
    },
}


# ==================== 辅助函数 ====================

def get_theme(theme_name: str) -> Dict[str, Any]:
    """获取主题配置"""
    return THEMES.get(theme_name, THEMES["business"])


def get_theme_colors(theme_name: str) -> ColorPalette:
    """获取主题配色"""
    theme = get_theme(theme_name)
    return theme["colors"]


def create_design_spec(
    theme: str,
    total_pages: int,
    audience: str = "通用受众",
    layout_decisions: List[LayoutDecision] = None,
) -> DesignSpec:
    """
    创建设计规格书
    """
    theme_config = get_theme(theme)
    
    return DesignSpec(
        theme=theme,
        theme_name=theme_config["name"],
        colors=theme_config["colors"],
        font_family=theme_config["font_family"],
        title_font_size=theme_config["title_font_size"],
        body_font_size=theme_config["body_font_size"],
        total_pages=total_pages,
        audience=audience,
        tone=theme_config["tone"],
        key_pages=[0, total_pages - 1],  # 默认首尾为关键页面
        layout_decisions=layout_decisions or [],
    )


def calculate_infographic_size(content_length: int) -> str:
    """
    根据内容长度计算信息图尺寸
    
    逻辑：内容越少，信息图越大（填充空间）；内容越多，信息图越小（避免挤压）
    """
    if content_length < 200:
        return "large"
    elif content_length < 400:
        return "medium"
    else:
        return "small"


def suggest_infographic_position(content_length: int, has_list: bool) -> str:
    """
    建议信息图位置
    
    - 内容短：放右边（并排）
    - 内容长或有列表：放下面
    """
    if content_length < 300 and not has_list:
        return "right"
    else:
        return "bottom"


def get_kb_type_to_theme_mapping() -> Dict[str, str]:
    """知识库类型到主题的映射"""
    return {
        "tech": "tech",
        "k12": "education",
        "teaching": "education",
        "policy": "business",
        "legal": "legal",
        "paper": "minimal",
    }


def infer_theme_from_kb_type(kb_type: str) -> str:
    """根据知识库类型推断主题"""
    mapping = get_kb_type_to_theme_mapping()
    return mapping.get(kb_type, "business")

