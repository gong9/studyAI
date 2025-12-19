'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { 
  ChevronLeft, ChevronRight, BookOpen, Calculator, 
  Image as ImageIcon, ListChecks, Code, FileText,
  Play, Pause
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// Types from DSL Schema
interface SlideElement {
  kind: 'text' | 'formula' | 'diagram' | 'image' | 'exercise' | 'list' | 'code';
  content?: string;
  latex?: string;
  items?: string[];
  question?: string;
  options?: string[];
  answer?: string;
  diagramType?: string;
  params?: any;
  caption?: string;
  style?: string;
  display?: string;
  ordered?: boolean;
  language?: string;
}

interface Slide {
  id: string;
  type: string;
  title: string;
  elements: SlideElement[];
  notes?: string;
}

interface CoursewareDSL {
  version: string;
  meta: {
    title: string;
    grade?: string;
    subject?: string;
    chapter?: string;
    objectives?: string[];
  };
  slides: Slide[];
}

interface CoursewarePreviewProps {
  dsl: CoursewareDSL;
  className?: string;
}

// Slide type colors
const SLIDE_TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  intro: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  concept: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  definition: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  example: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  diagram: { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200' },
  exercise: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
  summary: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
  transition: { bg: 'bg-zinc-50', text: 'text-zinc-700', border: 'border-zinc-200' },
  custom: { bg: 'bg-zinc-50', text: 'text-zinc-700', border: 'border-zinc-200' },
};

/**
 * 课件预览组件
 * 支持幻灯片浏览、元素渲染
 */
export function CoursewarePreview({ dsl, className }: CoursewarePreviewProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const slides = dsl.slides || [];
  const totalSlides = slides.length;

  const goToSlide = (index: number) => {
    if (index >= 0 && index < totalSlides) {
      setCurrentSlide(index);
    }
  };

  const nextSlide = () => goToSlide(currentSlide + 1);
  const prevSlide = () => goToSlide(currentSlide - 1);

  // Auto play
  React.useEffect(() => {
    if (!isPlaying) return;
    
    const timer = setInterval(() => {
      setCurrentSlide(prev => {
        if (prev >= totalSlides - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 5000);

    return () => clearInterval(timer);
  }, [isPlaying, totalSlides]);

  if (totalSlides === 0) {
    return (
      <div className={cn("flex items-center justify-center p-8 bg-zinc-50 rounded-lg", className)}>
        <p className="text-zinc-500">暂无幻灯片内容</p>
      </div>
    );
  }

  const slide = slides[currentSlide];
  const typeStyle = SLIDE_TYPE_COLORS[slide.type] || SLIDE_TYPE_COLORS.custom;

  return (
    <div className={cn("flex flex-col", className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b bg-white rounded-t-lg">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-zinc-500" />
          <span className="text-sm font-medium text-zinc-700">{dsl.meta.title}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsPlaying(!isPlaying)}
            className="h-8 w-8"
          >
            {isPlaying ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4" />
            )}
          </Button>
          <span className="text-sm text-zinc-500">
            {currentSlide + 1} / {totalSlides}
          </span>
        </div>
      </div>

      {/* Slide Content */}
      <div className={cn(
        "flex-1 min-h-[400px] p-6 border-x",
        typeStyle.bg
      )}>
        {/* Slide Type Badge */}
        <div className="flex items-center gap-2 mb-4">
          <span className={cn(
            "px-2 py-1 text-xs font-medium rounded border",
            typeStyle.bg, typeStyle.text, typeStyle.border
          )}>
            {slide.type}
          </span>
        </div>

        {/* Slide Title */}
        <h2 className="text-xl font-bold text-zinc-800 mb-6">{slide.title}</h2>

        {/* Elements */}
        <div className="space-y-4">
          {slide.elements.map((element, i) => (
            <ElementRenderer key={i} element={element} />
          ))}
        </div>

        {/* Notes */}
        {slide.notes && (
          <div className="mt-6 pt-4 border-t border-zinc-200">
            <p className="text-sm text-zinc-500 italic">
              📝 {slide.notes}
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between p-3 border rounded-b-lg bg-white">
        <Button
          variant="outline"
          size="sm"
          onClick={prevSlide}
          disabled={currentSlide === 0}
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          上一张
        </Button>

        {/* Slide indicators */}
        <div className="flex gap-1.5">
          {slides.slice(
            Math.max(0, currentSlide - 3),
            Math.min(totalSlides, currentSlide + 4)
          ).map((s, i) => {
            const actualIndex = Math.max(0, currentSlide - 3) + i;
            return (
              <button
                key={s.id}
                onClick={() => goToSlide(actualIndex)}
                className={cn(
                  "w-2 h-2 rounded-full transition-all",
                  actualIndex === currentSlide
                    ? "w-6 bg-emerald-500"
                    : "bg-zinc-300 hover:bg-zinc-400"
                )}
              />
            );
          })}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={nextSlide}
          disabled={currentSlide === totalSlides - 1}
        >
          下一张
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

/**
 * 元素渲染器
 */
function ElementRenderer({ element }: { element: SlideElement }) {
  switch (element.kind) {
    case 'text':
      return (
        <div className={cn(
          "text-zinc-700",
          element.style === 'highlight' && "bg-yellow-100 p-3 rounded-lg border-l-4 border-yellow-400",
          element.style === 'quote' && "pl-4 border-l-4 border-zinc-300 italic text-zinc-600"
        )}>
          <p className="whitespace-pre-wrap">{element.content}</p>
        </div>
      );

    case 'formula':
      return (
        <div className={cn(
          "flex items-center gap-2",
          element.display === 'block' && "justify-center py-4"
        )}>
          <Calculator className="w-4 h-4 text-emerald-600" />
          <code className="px-3 py-2 bg-zinc-100 rounded-lg font-mono text-sm">
            {element.latex}
          </code>
        </div>
      );

    case 'diagram':
      return (
        <div className="p-4 bg-white rounded-lg border border-zinc-200">
          <div className="flex items-center gap-2 mb-2">
            <ImageIcon className="w-4 h-4 text-cyan-600" />
            <span className="text-sm font-medium text-zinc-600">
              图表: {element.diagramType}
            </span>
          </div>
          <div className="h-32 bg-zinc-50 rounded flex items-center justify-center text-zinc-400">
            [图表占位符: {element.diagramType}]
          </div>
          {element.caption && (
            <p className="text-xs text-zinc-500 text-center mt-2">{element.caption}</p>
          )}
        </div>
      );

    case 'list':
      const ListTag = element.ordered ? 'ol' : 'ul';
      return (
        <ListTag className={cn(
          "pl-6 space-y-2",
          element.ordered ? "list-decimal" : "list-disc"
        )}>
          {element.items?.map((item, i) => (
            <li key={i} className="text-zinc-700">{item}</li>
          ))}
        </ListTag>
      );

    case 'exercise':
      return (
        <div className="p-4 bg-white rounded-lg border border-rose-200">
          <div className="flex items-center gap-2 mb-3">
            <ListChecks className="w-4 h-4 text-rose-600" />
            <span className="text-sm font-medium text-rose-700">练习题</span>
          </div>
          <p className="text-zinc-800 mb-3">{element.question}</p>
          {element.options && (
            <div className="space-y-2 mb-3">
              {element.options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-6 h-6 flex items-center justify-center bg-zinc-100 rounded text-xs font-medium">
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="text-zinc-700">{opt}</span>
                </div>
              ))}
            </div>
          )}
          {element.answer && (
            <details className="mt-2">
              <summary className="text-sm text-rose-600 cursor-pointer">查看答案</summary>
              <p className="mt-2 text-sm text-zinc-600 bg-rose-50 p-2 rounded">
                {element.answer}
              </p>
            </details>
          )}
        </div>
      );

    case 'code':
      return (
        <div className="p-4 bg-zinc-900 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Code className="w-4 h-4 text-zinc-400" />
            <span className="text-xs text-zinc-500">{element.language}</span>
          </div>
          <pre className="text-sm text-zinc-100 font-mono overflow-x-auto">
            {element.content}
          </pre>
        </div>
      );

    case 'image':
      return (
        <div className="text-center">
          <div className="inline-block p-2 bg-zinc-100 rounded-lg">
            <ImageIcon className="w-16 h-16 text-zinc-400" />
          </div>
          {element.caption && (
            <p className="text-xs text-zinc-500 mt-2">{element.caption}</p>
          )}
        </div>
      );

    default:
      return (
        <div className="p-3 bg-zinc-100 rounded text-sm text-zinc-500">
          未知元素类型: {element.kind}
        </div>
      );
  }
}

export default CoursewarePreview;

