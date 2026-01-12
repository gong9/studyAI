/**
 * HTML 幻灯片渲染器
 * 
 * 使用 iframe 渲染 AI 生成的 HTML 代码，确保 100vh 正确工作
 * 支持信息图装饰（在 iframe 外层渲染）
 */

'use client';

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { InfographicRenderer, type InfographicData } from './InfographicRenderer';

export interface HtmlSlide {
  index: number;
  title: string;
  html: string;
  infographic?: InfographicData;
}

interface HtmlSlideRendererProps {
  slide: HtmlSlide;
  isFullscreen?: boolean;
  className?: string;
}

// 根据信息图尺寸计算布局比例
// 注意：左侧内容需要足够空间，否则文字会重叠
const getLayoutRatios = (size: string, position: string) => {
  if (position === 'right') {
    // 右侧信息图：给内容区域更多空间，避免文字挤压
    switch (size) {
      case 'small': return { content: '70%', infographic: '30%' };
      case 'large': return { content: '60%', infographic: '40%' };
      default: return { content: '65%', infographic: '35%' }; // 内容占65%
    }
  } else {
    // bottom - 上下布局，空间相对充足
    switch (size) {
      case 'small': return { content: '65%', infographic: '35%' };
      case 'large': return { content: '50%', infographic: '50%' };
      default: return { content: '55%', infographic: '45%' };
    }
  }
};

export const HtmlSlideRenderer: React.FC<HtmlSlideRendererProps> = ({
  slide,
  isFullscreen = false,
  className,
}) => {
  const hasInfographic = !!slide.infographic;
  const infographicPosition = slide.infographic?.position || 'bottom';

  // 构建完整的 HTML 文档
  const iframeSrc = useMemo(() => {
    // 修复 100vh 问题：替换为 100%
    const fixedHtml = slide.html
      .replace(/100vh/g, '100%')
      .replace(/height:\s*100vh/gi, 'height: 100%')
      .replace(/min-height:\s*100vh/gi, 'min-height: 100%');
    
    const fullHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { 
      width: 100%; 
      height: 100%; 
      overflow: hidden;
      background: #FAFBFC;
    }
    /* 确保幻灯片填满整个容器 */
    .slide, [class*="slide"] {
      width: 100% !important;
      height: 100% !important;
      min-height: 100% !important;
    }
    /* 防止文字重叠：确保所有文本元素正确换行 */
    p, li, span, div, h1, h2, h3, h4, h5, h6 {
      word-wrap: break-word !important;
      word-break: break-word !important;
      overflow-wrap: break-word !important;
      white-space: normal !important;
    }
    /* 修复加粗文字重叠问题 */
    strong, b {
      position: static !important;
      display: inline !important;
      float: none !important;
      margin: 0 2px !important;
      padding: 0 !important;
      letter-spacing: 0 !important;
      text-shadow: none !important;
    }
    /* 修复带下划线装饰的文字 - 确保不会和其他文字重叠 */
    [style*="border-bottom"], [style*="text-decoration"], [style*="underline"] {
      position: static !important;
      display: inline !important;
      float: none !important;
      margin-right: 4px !important;
    }
    /* 确保所有文字正常渲染，无异常间距 */
    * {
      letter-spacing: normal !important;
      text-rendering: optimizeLegibility !important;
    }
  </style>
</head>
<body>
  ${fixedHtml}
</body>
</html>`;
    return `data:text/html;charset=utf-8,${encodeURIComponent(fullHtml)}`;
  }, [slide.html]);

  // 没有信息图的情况：直接渲染 iframe
  if (!hasInfographic) {
    return (
      <div
        className={cn(
          'w-full h-full overflow-hidden',
          className
        )}
      >
        <iframe
          src={iframeSrc}
          className="w-full h-full border-0"
          title={slide.title}
          sandbox="allow-same-origin"
        />
      </div>
    );
  }

  // 有信息图的情况：根据位置和尺寸动态计算布局
  const infographicSize = slide.infographic?.size || 'medium';
  const ratios = getLayoutRatios(infographicSize, infographicPosition);

  if (infographicPosition === 'right') {
    return (
      <div
        className={cn(
          'w-full h-full overflow-hidden flex',
          className
        )}
      >
        {/* 左侧：主内容区域 */}
        <div style={{ width: ratios.content }} className="h-full">
          <iframe
            src={iframeSrc}
            className="w-full h-full border-0"
            title={slide.title}
            sandbox="allow-same-origin"
          />
        </div>
        {/* 右侧：信息图区域 - 信息图自动填充 */}
        <div 
          style={{ width: ratios.infographic }} 
          className="h-full p-4 bg-white/5"
        >
          <InfographicRenderer 
            infographic={slide.infographic!}
            fillContainer={true}
          />
        </div>
      </div>
    );
  }

  if (infographicPosition === 'bottom') {
    return (
      <div
        className={cn(
          'w-full h-full overflow-hidden flex flex-col',
          className
        )}
      >
        {/* 上方：主内容区域 */}
        <div style={{ height: ratios.content }}>
          <iframe
            src={iframeSrc}
            className="w-full h-full border-0"
            title={slide.title}
            sandbox="allow-same-origin"
          />
        </div>
        {/* 下方：信息图区域 - 信息图自动填充 */}
        <div 
          style={{ height: ratios.infographic }} 
          className="w-full p-4 bg-white/5"
        >
          <InfographicRenderer 
            infographic={slide.infographic!}
            fillContainer={true}
          />
        </div>
      </div>
    );
  }

  // inline 或其他位置：默认在下方，使用固定高度
  return (
    <div
      className={cn(
        'w-full h-full overflow-hidden flex flex-col',
        className
      )}
    >
      <div className="flex-1">
        <iframe
          src={iframeSrc}
          className="w-full h-full border-0"
          title={slide.title}
          sandbox="allow-same-origin"
        />
      </div>
      <div className="h-[35%] w-full p-4 bg-white/5">
        <InfographicRenderer infographic={slide.infographic!} fillContainer={true} />
      </div>
    </div>
  );
};

export default HtmlSlideRenderer;

