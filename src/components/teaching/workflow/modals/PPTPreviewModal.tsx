'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Presentation, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

// 设计稿尺寸 (16:9)
const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 720;

interface PPTPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  manuscriptId: string | null;
  title?: string;
}

export function PPTPreviewModal({
  open,
  onOpenChange,
  manuscriptId,
  title = 'PPT预览',
}: PPTPreviewModalProps) {
  const [loading, setLoading] = useState(true);
  const [slides, setSlides] = useState<string[]>([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [error, setError] = useState('');
  const [scale, setScale] = useState(0.5);
  const containerRef = useRef<HTMLDivElement>(null);

  // 计算缩放比例 - 大屏可视化核心逻辑
  const calcScale = useCallback(() => {
    if (!containerRef.current) return;
    
    const containerRect = containerRef.current.getBoundingClientRect();
    const containerWidth = containerRect.width - 100; // 左右导航按钮空间
    const containerHeight = containerRect.height - 20;
    
    // 计算缩放比例，取较小值保证完整显示
    const scaleX = containerWidth / DESIGN_WIDTH;
    const scaleY = containerHeight / DESIGN_HEIGHT;
    const newScale = Math.min(scaleX, scaleY);
    
    setScale(newScale > 0 ? newScale : 0.5);
  }, []);

  // 监听容器大小变化
  useEffect(() => {
    if (!open || slides.length === 0) return;
    
    // 初始计算
    const timer = setTimeout(calcScale, 100);
    
    // 监听窗口变化
    window.addEventListener('resize', calcScale);
    
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', calcScale);
    };
  }, [open, slides.length, calcScale]);

  useEffect(() => {
    if (open && manuscriptId) {
      fetchSlides();
    }
  }, [open, manuscriptId]);

  useEffect(() => {
    if (!open) {
      setSlides([]);
      setCurrentSlide(0);
      setError('');
      setLoading(true);
    }
  }, [open]);

  const fetchSlides = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/teaching/manuscript/${manuscriptId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.htmlSlides) {
          let slidesData = data.htmlSlides;
          
          if (typeof slidesData === 'string') {
            try {
              slidesData = JSON.parse(slidesData);
            } catch (e) {
              console.error('[PPTPreview] Failed to parse htmlSlides:', e);
              setError('幻灯片数据格式错误');
              return;
            }
          }
          
          if (Array.isArray(slidesData)) {
            const htmlArray = slidesData.map((slide: any) => {
              if (typeof slide === 'string') return slide;
              return slide.html || '';
            }).filter(Boolean);
            
            setSlides(htmlArray);
          } else {
            setError('幻灯片数据格式错误');
          }
        } else if (data.slidevMd) {
          setError('PPT 正在渲染中，请稍后再试');
        } else {
          setError('暂无 PPT 内容');
        }
      } else {
        setError('获取 PPT 失败');
      }
    } catch (err) {
      console.error('[PPTPreview] Error:', err);
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  };

  const goToSlide = (index: number) => {
    if (index >= 0 && index < slides.length) {
      setCurrentSlide(index);
    }
  };

  // 键盘导航
  useEffect(() => {
    if (!open || slides.length === 0) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goToSlide(currentSlide - 1);
      if (e.key === 'ArrowRight') goToSlide(currentSlide + 1);
      if (e.key === 'Escape') onOpenChange(false);
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, slides.length, currentSlide]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
      <div className="bg-zinc-900 rounded-2xl shadow-2xl w-[95vw] max-w-6xl h-[90vh] flex flex-col overflow-hidden">
        {/* 头部 */}
        <header className="flex-shrink-0 bg-zinc-800 text-white px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Presentation className="w-5 h-5 text-zinc-400" />
            <h2 className="text-base font-medium">{title}</h2>
            {slides.length > 0 && (
              <span className="text-sm text-zinc-500">
                {currentSlide + 1} / {slides.length}
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-zinc-400 hover:text-white hover:bg-zinc-700"
          >
            <X className="w-5 h-5" />
          </Button>
        </header>

        {/* 主内容区 - 大屏可视化容器 */}
        <div 
          ref={containerRef}
          className="flex-1 flex items-center justify-center relative bg-zinc-900"
        >
          {loading ? (
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="w-12 h-12 animate-spin text-zinc-600" />
              <p className="text-zinc-500">加载中...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-4 text-zinc-500">
              <Presentation className="w-16 h-16 opacity-20" />
              <p>{error}</p>
            </div>
          ) : slides.length > 0 ? (
            <>
              {/* iframe 方式 - 完美隔离缩放 */}
              <div
                style={{
                  width: DESIGN_WIDTH * scale,
                  height: DESIGN_HEIGHT * scale,
                  borderRadius: '8px',
                  overflow: 'hidden',
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                }}
              >
                <iframe
                  srcDoc={`
                    <!DOCTYPE html>
                    <html>
                    <head>
                      <meta charset="utf-8">
                      <style>
                        * { margin: 0; padding: 0; box-sizing: border-box; }
                        html, body { 
                          width: ${DESIGN_WIDTH}px; 
                          height: ${DESIGN_HEIGHT}px; 
                          overflow: hidden;
                          background: white;
                        }
                        body {
                          /* 内容整体缩小 85%，确保不超出 */
                          zoom: 0.85;
                          -moz-transform: scale(0.85);
                          -moz-transform-origin: 0 0;
                        }
                        .slide {
                          width: 100% !important;
                          height: auto !important;
                          min-height: 100% !important;
                          padding: 40px 56px !important;
                        }
                      </style>
                    </head>
                    <body>${slides[currentSlide]}</body>
                    </html>
                  `}
                  style={{
                    width: DESIGN_WIDTH,
                    height: DESIGN_HEIGHT,
                    border: 'none',
                    transform: `scale(${scale})`,
                    transformOrigin: 'top left',
                  }}
                  title={`Slide ${currentSlide + 1}`}
                />
              </div>

              {/* 左导航 */}
              <button
                onClick={() => goToSlide(currentSlide - 1)}
                disabled={currentSlide === 0}
                className="absolute left-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white disabled:opacity-20 disabled:cursor-not-allowed transition-all"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>

              {/* 右导航 */}
              <button
                onClick={() => goToSlide(currentSlide + 1)}
                disabled={currentSlide === slides.length - 1}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white disabled:opacity-20 disabled:cursor-not-allowed transition-all"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center gap-4 text-zinc-500">
              <Presentation className="w-16 h-16 opacity-20" />
              <p>暂无幻灯片</p>
            </div>
          )}
        </div>

        {/* 底部页码导航 */}
        {slides.length > 1 && !loading && (
          <div className="flex-shrink-0 bg-zinc-800 px-4 py-2.5 overflow-x-auto">
            <div className="flex gap-1.5 justify-center">
              {slides.map((_, index) => (
                <button
                  key={index}
                  onClick={() => goToSlide(index)}
                  className={`flex-shrink-0 w-10 h-7 rounded text-xs font-medium transition-all ${
                    index === currentSlide
                      ? 'bg-white text-zinc-900'
                      : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600'
                  }`}
                >
                  {index + 1}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default PPTPreviewModal;
