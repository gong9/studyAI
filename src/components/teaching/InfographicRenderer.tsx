'use client';

/**
 * InfographicRenderer 组件
 * 
 * 响应式版本：利用 SVG viewBox 实现自动缩放，解决文本折叠问题
 * 
 * 核心原理：
 * 1. 用标准参考尺寸渲染信息图，让 AntV Infographic 计算内容布局
 * 2. 渲染完成后，修改 SVG 属性让它根据 viewBox 自适应容器
 * 3. SVG 原生支持响应式缩放，无需重新渲染
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';

// Infographic 类型定义
export interface InfographicData {
  syntax: string;
  position: 'right' | 'bottom' | 'inline' | 'none';
  size: 'small' | 'medium' | 'large' | 'auto';
  renderedSvg?: string; // 预渲染的 SVG 字符串（用于导出视频）
}

interface InfographicRendererProps {
  infographic: InfographicData;
  className?: string;
  fillContainer?: boolean;
  // 渲染完成后的回调，返回 SVG 字符串（用于保存预渲染结果）
  onRendered?: (svgHtml: string) => void;
  // 用于自动保存预渲染 SVG
  manuscriptId?: string;
  slideIndex?: number;
}

// 根据位置选择最佳的参考渲染尺寸
// 关键：尺寸要足够大，让 AntV Infographic 有充足空间布局文字，避免重叠
// 渲染后 SVG 会自动缩放到容器大小
const getReferenceSize = (position: string) => {
  switch (position) {
    case 'right':
      // 右侧位置：竖向布局
      // 使用较大尺寸确保文字不重叠，宽度要够宽让标题和描述有空间
      return { width: 800, height: 1000 };
    case 'bottom':
      // 底部位置：横向布局
      return { width: 1400, height: 600 };
    default:
      return { width: 1200, height: 800 };
  }
};

export function InfographicRenderer({ 
  infographic, 
  className,
  fillContainer = true,
  onRendered,
  manuscriptId,
  slideIndex,
}: InfographicRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false); // 控制显示时机，避免闪动
  const infographicInstanceRef = useRef<any>(null);
  const hasSavedRef = useRef(false); // 避免重复保存

  // 如果有预渲染的 SVG，直接显示（无需等待）
  if (infographic.renderedSvg) {
    return (
      <div
        className={cn(
          'w-full h-full flex items-center justify-center',
          className
        )}
        aria-label="信息图"
        style={{ overflow: 'hidden' }}
        dangerouslySetInnerHTML={{ __html: infographic.renderedSvg }}
      />
    );
  }

  // 保存预渲染的 SVG 到后端
  const saveSvgToBackend = useCallback(async (svgHtml: string) => {
    if (!manuscriptId || slideIndex === undefined || hasSavedRef.current) return;
    
    hasSavedRef.current = true;
    try {
      await fetch('/api/teaching/infographic/prerender', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manuscriptId,
          slideIndex,
          renderedSvg: svgHtml,
        }),
      });
      console.log(`[InfographicRenderer] Saved SVG for slide ${slideIndex}`);
    } catch (err) {
      console.error('[InfographicRenderer] Failed to save SVG:', err);
      hasSavedRef.current = false; // 允许重试
    }
  }, [manuscriptId, slideIndex]);

  // 渲染信息图（只在语法变化时重新渲染）
  const renderInfographic = useCallback(async () => {
    if (!containerRef.current || !infographic.syntax) return;

    // 开始渲染前隐藏，避免闪动
    setIsReady(false);

    try {
      const { Infographic } = await import('@antv/infographic');

      // 清理旧实例
      if (infographicInstanceRef.current) {
        try { infographicInstanceRef.current.destroy(); } catch {}
      }

      // 清空容器
      containerRef.current.innerHTML = '';

      // 获取参考尺寸（根据位置优化）
      const refSize = getReferenceSize(infographic.position);

      // 阶段1: 用参考尺寸渲染，让 Infographic 计算内容的 viewBox
      infographicInstanceRef.current = new Infographic({
        container: containerRef.current,
        width: refSize.width,
        height: refSize.height,
        padding: [16, 16, 16, 16], // 添加内边距避免内容贴边
      });

      // 渲染信息图
      infographicInstanceRef.current.render(infographic.syntax);

      // 阶段2: 渲染完成后，修改 SVG 属性实现响应式
      // 使用 setTimeout 确保 DOM 更新完成
      setTimeout(() => {
        if (!containerRef.current) return;
        
        const svg = containerRef.current.querySelector('svg');
        if (svg) {
          // 确保 viewBox 存在（Infographic 应该已经设置了）
          const viewBox = svg.getAttribute('viewBox');
          if (!viewBox) {
            // 如果没有 viewBox，根据当前尺寸创建一个
            const width = svg.getAttribute('width') || refSize.width;
            const height = svg.getAttribute('height') || refSize.height;
            svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
          }

          // 移除固定尺寸，让 SVG 响应式缩放
          svg.removeAttribute('width');
          svg.removeAttribute('height');
          
          // 设置响应式样式
          svg.style.width = '100%';
          svg.style.height = '100%';
          svg.style.maxWidth = '100%';
          svg.style.maxHeight = '100%';
          
          // preserveAspectRatio: 保持宽高比，居中显示
          // xMidYMid: 水平和垂直都居中
          // meet: 确保整个内容都可见（不裁剪）
          svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
          
          const svgHtml = svg.outerHTML;
          
          // 回调：返回渲染后的 SVG（用于预渲染保存）
          if (onRendered) {
            onRendered(svgHtml);
          }
          
          // 自动保存到后端（如果提供了 manuscriptId 和 slideIndex）
          saveSvgToBackend(svgHtml);
          
          // SVG 修改完成，显示内容
          setIsReady(true);
        }
      }, 50);

      setError(null);
    } catch (err: any) {
      console.error('[InfographicRenderer] Render failed:', err);
      setError(err.message || '信息图渲染失败');
      setIsReady(true); // 出错也要显示（显示错误状态）
    }
  }, [infographic.syntax, infographic.position, onRendered, saveSvgToBackend]);

  // 只在语法变化时重新渲染（不再监听容器尺寸变化）
  useEffect(() => {
    hasSavedRef.current = false; // 重置保存状态
    renderInfographic();

    return () => {
      if (infographicInstanceRef.current) {
        try { infographicInstanceRef.current.destroy(); } catch {}
      }
    };
  }, [renderInfographic]);

  if (error) {
    return (
      <div className={cn('flex items-center justify-center text-gray-400 text-sm', className)}>
        信息图加载失败
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'w-full h-full flex items-center justify-center',
        className
      )}
      aria-label="信息图"
      style={{
        overflow: 'hidden',
        // 关键：在 SVG 修改完成前隐藏，避免闪动
        opacity: isReady ? 1 : 0,
        transition: 'opacity 0.15s ease-in-out',
      }}
    />
  );
}

/**
 * 带容器的信息图渲染器
 */
interface SlideInfographicProps {
  infographic?: InfographicData;
  slideHtml: string;
}

export function SlideWithInfographic({ infographic, slideHtml }: SlideInfographicProps) {
  if (!infographic) {
    return (
      <div
        className="slide-content w-full h-full"
        dangerouslySetInnerHTML={{ __html: slideHtml }}
      />
    );
  }

  if (infographic.position === 'right') {
    return (
      <div className="slide-content w-full h-full flex">
        <div className="flex-1 h-full" dangerouslySetInnerHTML={{ __html: slideHtml }} />
        <div className="w-[35%] h-full p-4">
          <InfographicRenderer infographic={infographic} fillContainer={true} />
        </div>
      </div>
    );
  }

  if (infographic.position === 'bottom') {
    return (
      <div className="slide-content w-full h-full flex flex-col">
        <div className="flex-1" dangerouslySetInnerHTML={{ __html: slideHtml }} />
        <div className="h-[35%] w-full p-4">
          <InfographicRenderer infographic={infographic} fillContainer={true} />
        </div>
      </div>
    );
  }

  return (
    <div className="slide-content w-full h-full flex flex-col">
      <div className="flex-1" dangerouslySetInnerHTML={{ __html: slideHtml }} />
      <div className="h-[30%] w-full p-4">
        <InfographicRenderer infographic={infographic} fillContainer={true} />
      </div>
    </div>
  );
}

export default InfographicRenderer;
