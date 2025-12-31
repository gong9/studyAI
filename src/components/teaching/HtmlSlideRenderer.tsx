/**
 * HTML 幻灯片渲染器
 * 
 * 使用 iframe 渲染 AI 生成的 HTML 代码，确保 100vh 正确工作
 */

'use client';

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';

export interface HtmlSlide {
  index: number;
  title: string;
  html: string;
}

interface HtmlSlideRendererProps {
  slide: HtmlSlide;
  isFullscreen?: boolean;
  className?: string;
}

export const HtmlSlideRenderer: React.FC<HtmlSlideRendererProps> = ({
  slide,
  isFullscreen = false,
  className,
}) => {
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
      background: #0f0f23;
    }
    /* 确保幻灯片填满整个容器 */
    .slide, [class*="slide"] {
      width: 100% !important;
      height: 100% !important;
      min-height: 100% !important;
    }
  </style>
</head>
<body>
  ${fixedHtml}
</body>
</html>`;
    return `data:text/html;charset=utf-8,${encodeURIComponent(fullHtml)}`;
  }, [slide.html]);

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
};

export default HtmlSlideRenderer;

