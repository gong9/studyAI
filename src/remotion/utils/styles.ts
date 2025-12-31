/**
 * 幻灯片样式工具
 */

import type { SlideStyle, BackgroundConfig } from '@/lib/teaching/remotion/types';

// ==================== 主题配色 ====================

export const THEME_COLORS: Record<SlideStyle, {
  background: string;
  text: string;
  accent: string;
  muted: string;
  border: string;
}> = {
  dark: {
    background: '#18181b',
    text: '#fafafa',
    accent: '#3b82f6',
    muted: '#a1a1aa',
    border: '#3f3f46',
  },
  light: {
    background: '#ffffff',
    text: '#18181b',
    accent: '#2563eb',
    muted: '#71717a',
    border: '#e4e4e7',
  },
  gradient: {
    background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%)',
    text: '#ffffff',
    accent: '#a5b4fc',
    muted: '#c7d2fe',
    border: '#4338ca',
  },
  minimal: {
    background: '#fafafa',
    text: '#09090b',
    accent: '#18181b',
    muted: '#71717a',
    border: '#d4d4d8',
  },
  vibrant: {
    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
    text: '#f8fafc',
    accent: '#f472b6',
    muted: '#94a3b8',
    border: '#334155',
  },
};

// ==================== 背景样式 ====================

export function getBackgroundStyle(
  style: SlideStyle,
  config?: BackgroundConfig
): React.CSSProperties {
  const theme = THEME_COLORS[style];
  
  if (!config || config.type === 'solid') {
    const bg = theme.background;
    // 检查是否是渐变
    if (bg.includes('gradient')) {
      return { background: bg };
    }
    return { backgroundColor: config?.color || bg };
  }

  if (config.type === 'gradient') {
    const direction = config.gradientDirection || 'to-br';
    const directionMap: Record<string, string> = {
      'to-r': 'to right',
      'to-b': 'to bottom',
      'to-br': 'to bottom right',
      'to-bl': 'to bottom left',
    };
    return {
      background: `linear-gradient(${directionMap[direction]}, ${config.gradientFrom || '#1e1b4b'}, ${config.gradientTo || '#4338ca'})`,
    };
  }

  if (config.type === 'image' && config.imageUrl) {
    return {
      backgroundImage: `url(${config.imageUrl})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }

  if (config.type === 'pattern') {
    const patternStyles: Record<string, string> = {
      dots: `radial-gradient(circle, ${theme.border} 1px, transparent 1px)`,
      grid: `linear-gradient(${theme.border} 1px, transparent 1px), linear-gradient(90deg, ${theme.border} 1px, transparent 1px)`,
      lines: `repeating-linear-gradient(45deg, ${theme.border} 0, ${theme.border} 1px, transparent 0, transparent 50%)`,
    };
    return {
      backgroundColor: theme.background,
      backgroundImage: patternStyles[config.pattern || 'dots'],
      backgroundSize: config.pattern === 'dots' ? '20px 20px' : '40px 40px',
    };
  }

  return { backgroundColor: theme.background };
}

// ==================== 字体样式 ====================

export const FONT_STYLES = {
  // 标题字体
  title: {
    fontFamily: '"PingFang SC", "Microsoft YaHei", -apple-system, BlinkMacSystemFont, sans-serif',
    fontWeight: 700,
  },
  // 正文字体
  body: {
    fontFamily: '"PingFang SC", "Microsoft YaHei", -apple-system, BlinkMacSystemFont, sans-serif',
    fontWeight: 400,
  },
  // 代码字体
  code: {
    fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", Consolas, monospace',
    fontWeight: 400,
  },
};

// ==================== 尺寸常量 ====================

export const SIZES = {
  // 内边距
  padding: {
    slide: 80,
    content: 40,
  },
  // 字体大小
  fontSize: {
    title: 72,
    subtitle: 36,
    heading: 48,
    body: 32,
    small: 24,
    code: 24,
  },
  // 间距
  spacing: {
    titleMargin: 48,
    itemGap: 24,
    sectionGap: 64,
  },
};

