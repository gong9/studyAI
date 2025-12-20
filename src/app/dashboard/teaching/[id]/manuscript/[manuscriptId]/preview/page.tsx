'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { 
  ArrowLeft, Download, Loader2, ChevronLeft, ChevronRight,
  FileText, Presentation, Image as ImageIcon, PlayCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import katex from 'katex';
import 'katex/dist/katex.min.css';

// 预加载图片
function preloadImages(urls: string[]): Promise<void[]> {
  return Promise.all(
    urls.map(url => new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => resolve(); // 即使失败也继续
      img.src = url;
    }))
  );
}

// 从 Markdown 中提取图片 URL
function extractImageUrls(markdown: string): string[] {
  const regex = /!\[[^\]]*\]\(([^)]+)\)/g;
  const urls: string[] = [];
  let match;
  while ((match = regex.exec(markdown)) !== null) {
    urls.push(match[1]);
  }
  return urls;
}

// 渲染 LaTeX 公式
function renderLatex(text: string): string {
  // 块级公式 $$...$$
  text = text.replace(/\$\$([^$]+)\$\$/g, (match, latex) => {
    try {
      return `<div class="my-3 overflow-x-auto">${katex.renderToString(latex.trim(), { 
        displayMode: true, 
        throwOnError: false,
        output: 'html'
      })}</div>`;
    } catch (e) {
      return `<code class="text-red-500">${latex}</code>`;
    }
  });

  // 行内公式 $...$（包括没有$包围的 \frac）
  text = text.replace(/\$([^$]+)\$/g, (match, latex) => {
    try {
      return katex.renderToString(latex.trim(), { 
        throwOnError: false,
        output: 'html'
      });
    } catch (e) {
      return `<code class="text-red-500">${latex}</code>`;
    }
  });

  // 处理裸露的 \frac{}{} 等 LaTeX 命令
  text = text.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, (match, num, den) => {
    try {
      return katex.renderToString(`\\frac{${num}}{${den}}`, { 
        throwOnError: false,
        output: 'html'
      });
    } catch (e) {
      return `<span class="font-mono">${num}/${den}</span>`;
    }
  });

  return text;
}

// 简单的 Markdown 解析（支持常用语法）
function parseMarkdown(md: string): string {
  // 移除 frontmatter
  let content = md.replace(/^---[\s\S]*?---\n*/m, '');
  
  // 移除 LLM 可能生成的所有 HTML 标签（包括带属性的）
  // 例如: <p class="text-gray-700">...</p>, <br/>, <div class="...">等
  content = content.replace(/<br\s*\/?>/gi, '\n');
  // 移除所有HTML开始和结束标签（包括带class等属性的）
  content = content.replace(/<\/?[a-z][a-z0-9]*(?:\s+[^>]*)?\s*\/?>/gi, '');
  
  // 移除所有重复的连续标题（无论是 H1 还是 H2）
  const lines = content.split('\n');
  const filteredLines: string[] = [];
  let lastTitle = '';
  
  for (const line of lines) {
    // 提取标题内容（去掉 # 符号）
    const titleMatch = line.match(/^#+\s+(.+)$/);
    if (titleMatch) {
      const titleContent = titleMatch[1].trim();
      // 如果和上一个标题相同，跳过
      if (titleContent === lastTitle) {
        continue;
      }
      lastTitle = titleContent;
    }
    filteredLines.push(line);
  }
  
  content = filteredLines.join('\n');
  
  // 处理 Markdown 表格
  const tableRegex = /(\|[^\n]+\|\n)+/g;
  content = content.replace(tableRegex, (tableBlock) => {
    const tableLines = tableBlock.trim().split('\n').filter(line => line.trim());
    
    if (tableLines.length < 2) return tableBlock;
    
    // 检查是否是有效的表格（第二行是分隔行）
    const separatorLine = tableLines[1];
    if (!separatorLine.includes('---')) return tableBlock;
    
    let tableHtml = '<table style="border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: 0.95rem;"><thead><tr>';
    
    // 表头（第一行）
    const headerCells = tableLines[0].split('|').filter(c => c.trim());
    headerCells.forEach(cell => {
      tableHtml += `<th style="border: 1px solid #d1d5db; padding: 0.5rem 1rem; background-color: #f4f4f5; font-weight: 600; text-align: left; color: #27272a;">${cell.trim()}</th>`;
    });
    tableHtml += '</tr></thead><tbody>';
    
    // 数据行（跳过分隔行）
    for (let j = 2; j < tableLines.length; j++) {
      const cells = tableLines[j].split('|').filter(c => c.trim());
      if (cells.length > 0) {
        tableHtml += '<tr>';
        cells.forEach(cell => {
          tableHtml += `<td style="border: 1px solid #d1d5db; padding: 0.5rem 1rem; color: #374151;">${cell.trim()}</td>`;
        });
        tableHtml += '</tr>';
      }
    }
    
    tableHtml += '</tbody></table>';
    return tableHtml;
  });
  
  let html = content
    // 标题 - 简洁商务主题
    .replace(/^### (.+)$/gm, '<h3 class="text-xl font-semibold text-zinc-700 mt-4 mb-3">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-2xl font-bold text-zinc-800 mt-6 mb-3 pb-2 border-b-2 border-zinc-200">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-4xl font-bold text-zinc-900 mb-6 tracking-tight">$1</h1>')
    // 粗体
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-bold text-zinc-900">$1</strong>')
    // 斜体
    .replace(/\*(.+?)\*/g, '<em class="text-gray-600 italic">$1</em>')
    // 行内代码
    .replace(/`([^`]+)`/g, '<code class="px-2 py-1 bg-zinc-100 rounded text-sm font-mono text-zinc-700 border border-zinc-200">$1</code>')
    // 列表项
    .replace(/^- (.+)$/gm, '<li class="text-zinc-700">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="text-zinc-700">$1</li>')
    // 引用块 (visual/diagram 标记)
    .replace(/> (visual|diagram|animation|emphasis): (.+)/g, 
      '<div class="my-4 p-4 bg-gradient-to-r from-zinc-50 to-slate-100 border-l-4 border-zinc-500 rounded-r-lg shadow-sm">' +
      '<div class="flex items-center gap-3"><span class="text-2xl">📊</span><span class="text-zinc-700 text-lg font-medium">$2</span></div></div>')
    // 普通引用
    .replace(/^> (.+)$/gm, '<blockquote class="border-l-4 border-zinc-400 pl-4 text-zinc-600 italic my-3 bg-zinc-50 py-2 rounded-r">$1</blockquote>')
    // HTML 标签美化
    .replace(/<div class="visual-placeholder[^"]*"[^>]*>/g, 
      '<div class="my-4 p-6 bg-gradient-to-br from-zinc-50 to-slate-100 border-2 border-dashed border-zinc-300 rounded-xl text-center">')
    .replace(/<div class="diagram-container[^"]*"[^>]*>/g,
      '<div class="my-4 p-6 bg-gradient-to-br from-zinc-50 to-slate-100 border-2 border-dashed border-zinc-300 rounded-xl text-center">')
    // 图片 - 自适应高度，最大占 25% 视口高度
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<div class="my-2 rounded-lg overflow-hidden shadow-md border border-gray-200 inline-block max-w-[48%] align-top mx-1"><img src="$2" alt="$1" class="w-full max-h-[20vh] object-contain bg-white" /><p class="text-center text-gray-500 text-xs py-1 bg-gray-50 truncate px-2">$1</p></div>')
    // 段落
    .replace(/\n\n/g, '</p><p class="text-gray-700 leading-relaxed my-3 text-lg">')
    // 换行
    .replace(/\n/g, '<br/>');

  // 包装列表
  html = html.replace(/(<li[^>]*>.*<\/li>\s*)+/g, '<ul class="my-3 ml-6 space-y-2 list-disc marker:text-zinc-500">$&</ul>');

  // 渲染 LaTeX 公式
  html = renderLatex(html);

  return `<div class="slide-content text-lg"><p class="text-gray-700 leading-relaxed my-3">${html}</p></div>`;
}

export default function SlidevPreviewPage() {
  const params = useParams();
  const router = useRouter();
  const manuscriptId = params.manuscriptId as string;
  const kbId = params.id as string;

  const [manuscript, setManuscript] = useState<any>(null);
  const [slides, setSlides] = useState<{ content: string; title: string }[]>([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [loading, setLoading] = useState(true);
  const [preloadingImages, setPreloadingImages] = useState(false);
  const [imageLoadProgress, setImageLoadProgress] = useState({ loaded: 0, total: 0 });
  const [rendering, setRendering] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [slideScale, setSlideScale] = useState(1);
  const slideContainerRef = useRef<HTMLDivElement>(null);
  const slideContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchManuscript();
  }, [manuscriptId]);

  // 键盘导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goToSlide(currentSlide - 1);
      if (e.key === 'ArrowRight') goToSlide(currentSlide + 1);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentSlide, slides.length]);

  // 自动缩放兜底：内容超出时自动缩小
  useEffect(() => {
    const adjustScale = () => {
      if (slideContainerRef.current && slideContentRef.current) {
        const container = slideContainerRef.current;
        const content = slideContentRef.current;
        
        // 先重置为 1 以获取真实尺寸
        content.style.transform = 'scale(1)';
        content.style.transformOrigin = 'top left';
        
        const containerHeight = container.clientHeight;
        const contentHeight = content.scrollHeight;
        
        if (contentHeight > containerHeight) {
          // 内容超出，计算缩放比例（最小 0.6）
          const scale = Math.max(0.6, (containerHeight - 10) / contentHeight);
          setSlideScale(scale);
        } else {
          setSlideScale(1);
        }
      }
    };
    
    // 延迟执行确保内容已渲染
    const timer = setTimeout(adjustScale, 50);
    return () => clearTimeout(timer);
  }, [currentSlide, slides]);

  const fetchManuscript = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/teaching/manuscript/${manuscriptId}`);
      if (res.ok) {
        const data = await res.json();
        setManuscript(data);
        
        // 优先使用 slidevMd，否则使用 enrichedContent 或 confirmedContent
        const content = data.slidevMd || data.enrichedContent || data.confirmedContent || data.draftContent;
        if (content) {
          parseSlides(content);
        } else {
          setError('没有可预览的内容');
        }
      } else {
        const err = await res.json();
        setError(err.error || '获取数据失败');
      }
    } catch (error: any) {
      setError(error.message || '网络错误');
    } finally {
      setLoading(false);
    }
  };

  const parseSlides = async (content: string) => {
    // 按 --- 分割幻灯片
    let parts = content.split(/\n---\n/);
    
    // 第一个可能是 frontmatter，跳过
    if (parts[0].trim().startsWith('---') || parts[0].includes('theme:')) {
      parts = parts.slice(1);
    }

    const parsed = parts
      .map(p => p.trim())
      .filter(p => p.length > 0)
      .map((content, index) => {
        // 提取标题
        const titleMatch = content.match(/^#\s+(.+)$/m);
        const title = titleMatch ? titleMatch[1] : `第 ${index + 1} 页`;
        return { content, title };
      });

    setSlides(parsed);
    
    // 预加载所有图片
    const allImageUrls = extractImageUrls(content);
    if (allImageUrls.length > 0) {
      setPreloadingImages(true);
      setImageLoadProgress({ loaded: 0, total: allImageUrls.length });
      
      // 逐个加载并更新进度
      let loaded = 0;
      await Promise.all(
        allImageUrls.map(url => new Promise<void>((resolve) => {
          const img = new window.Image();
          img.onload = () => {
            loaded++;
            setImageLoadProgress({ loaded, total: allImageUrls.length });
            resolve();
          };
          img.onerror = () => {
            loaded++;
            setImageLoadProgress({ loaded, total: allImageUrls.length });
            resolve();
          };
          img.src = url;
        }))
      );
      
      setPreloadingImages(false);
    }
  };

  const handleRender = async () => {
    setRendering(true);
    try {
      const res = await fetch(`/api/teaching/manuscript/${manuscriptId}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (res.ok) {
        const data = await res.json();
        parseSlides(data.slidevMd);
        setManuscript((prev: any) => ({ ...prev, slidevMd: data.slidevMd }));
      } else {
        const err = await res.json();
        alert(err.error || '渲染失败');
      }
    } catch (error: any) {
      alert(error.message || '渲染失败');
    } finally {
      setRendering(false);
    }
  };

  const handleExport = async (format: 'pdf' | 'pptx') => {
    setExporting(format);
    try {
      // 如果还没有 slidevMd，先渲染生成
      if (!manuscript?.slidevMd) {
        const renderRes = await fetch(`/api/teaching/manuscript/${manuscriptId}/render`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        
        if (!renderRes.ok) {
          const err = await renderRes.json();
          alert(err.error || '渲染失败，无法导出');
          setExporting(null);
          return;
        }
        
        const renderData = await renderRes.json();
        setManuscript((prev: any) => ({ ...prev, slidevMd: renderData.slidevMd }));
      }
      
      const res = await fetch(`/api/teaching/manuscript/${manuscriptId}/export?format=${format}`);
      
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `courseware.${format}`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const err = await res.json();
        alert(err.error || '导出失败');
      }
    } catch (error: any) {
      alert(error.message || '导出失败');
    } finally {
      setExporting(null);
    }
  };

  const goToSlide = (index: number) => {
    if (index >= 0 && index < slides.length) {
      setCurrentSlide(index);
    }
  };

  if (loading || preloadingImages) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 flex items-center justify-center">
        <div className="text-center">
          {preloadingImages ? (
            <>
              <ImageIcon className="h-10 w-10 text-zinc-400 mx-auto mb-2" />
              <Loader2 className="h-6 w-6 animate-spin text-zinc-400 mx-auto" />
              <p className="mt-4 text-zinc-400">
                正在预加载图片 ({imageLoadProgress.loaded}/{imageLoadProgress.total})
              </p>
              <div className="w-48 h-2 bg-zinc-700 rounded-full mt-3 mx-auto overflow-hidden">
                <div 
                  className="h-full bg-zinc-500 transition-all duration-300"
                  style={{ width: `${(imageLoadProgress.loaded / Math.max(imageLoadProgress.total, 1)) * 100}%` }}
                />
              </div>
            </>
          ) : (
            <>
              <Loader2 className="h-10 w-10 animate-spin text-zinc-400 mx-auto" />
              <p className="mt-4 text-zinc-400">加载中...</p>
            </>
          )}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 flex items-center justify-center text-white">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <Button variant="outline" onClick={() => router.back()}>
            返回
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 flex flex-col overflow-hidden">
      {/* 顶部工具栏 */}
      <header className="bg-black/40 backdrop-blur-xl border-b border-white/10 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-zinc-400 hover:text-white hover:bg-white/10"
            onClick={() => router.push(`/dashboard/teaching/${kbId}/manuscript/${manuscriptId}`)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回编辑
          </Button>
          <div className="h-4 w-px bg-white/20" />
          <h1 className="text-white font-medium">
            {manuscript?.chapter?.title || '课件预览'}
          </h1>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full">
            <span className="text-zinc-300 font-mono text-sm font-bold">
              {currentSlide + 1}
            </span>
            <span className="text-zinc-500">/</span>
            <span className="text-zinc-400 font-mono text-sm">{slides.length}</span>
          </div>
          
          <div className="h-4 w-px bg-white/20" />
          
          {/* AI 演示模式按钮 */}
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => router.push(`/dashboard/teaching/${kbId}/manuscript/${manuscriptId}/presentation`)}
            disabled={slides.length === 0}
            className="bg-zinc-700/50 border-zinc-500/50 text-zinc-300 hover:bg-zinc-600/50"
          >
            <PlayCircle className="h-4 w-4 mr-2" />
            AI 演示
          </Button>
          
          <div className="h-4 w-px bg-white/20" />
          
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => handleExport('pdf')}
            disabled={!!exporting || slides.length === 0}
            className="bg-transparent border-white/20 text-white hover:bg-white/10"
          >
            {exporting === 'pdf' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <FileText className="h-4 w-4 mr-2" />
                导出 PDF
              </>
            )}
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => handleExport('pptx')}
            disabled={!!exporting || slides.length === 0}
            className="bg-transparent border-white/20 text-white hover:bg-white/10"
          >
            {exporting === 'pptx' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Presentation className="h-4 w-4 mr-2" />
                导出 PPTX
              </>
            )}
          </Button>
        </div>
      </header>

      {/* 主内容区 */}
      <div className="flex-1 flex">
        {/* 左侧幻灯片缩略图 */}
        <aside className="w-48 bg-black/30 border-r border-white/10 overflow-y-auto">
          <div className="p-2 space-y-1.5">
            {slides.map((slide, i) => (
              <div
                key={i}
                onClick={() => goToSlide(i)}
                className={cn(
                  "cursor-pointer rounded-lg overflow-hidden transition-all duration-200 group border",
                  currentSlide === i 
                    ? "ring-2 ring-zinc-400 shadow-lg shadow-zinc-500/20 scale-105 border-zinc-400" 
                    : "opacity-70 hover:opacity-100 hover:scale-102 border-zinc-200"
                )}
              >
                <div 
                  className="aspect-[16/9] p-2 relative flex items-center justify-center"
                  style={{
                    background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
                  }}
                >
                  <div className="text-[8px] text-zinc-600 line-clamp-2 leading-tight text-center px-1 font-medium">
                    {slide.title.replace(/^#+ /, '')}
                  </div>
                  <div className={cn(
                    "absolute bottom-1 right-1 w-5 h-5 flex items-center justify-center rounded-full text-[9px] font-bold",
                    currentSlide === i 
                      ? "bg-gradient-to-r from-zinc-700 to-zinc-800 text-white"
                      : "bg-zinc-200 text-zinc-600"
                  )}>
                    {i + 1}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* 中间幻灯片展示 */}
        <main className="flex-1 flex items-center justify-center p-4 relative">
          {slides.length === 0 ? (
            <div className="text-center text-zinc-500">
              <Presentation className="h-20 w-20 mx-auto mb-4 opacity-20" />
              <p className="text-lg">暂无幻灯片</p>
              {rendering ? (
                <p className="mt-4 flex items-center justify-center gap-2 text-zinc-400">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  正在渲染...
                </p>
              ) : (
                <Button 
                  className="mt-6 bg-zinc-800 hover:bg-zinc-700"
                  onClick={handleRender}
                >
                  生成幻灯片
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* 幻灯片内容 */}
              <div className="w-full max-w-[95%] h-full flex flex-col justify-center px-4">
                <div 
                  ref={slideContainerRef}
                  className="aspect-[16/9] rounded-2xl shadow-2xl shadow-black/20 overflow-hidden slide-theme border border-zinc-200"
                  style={{
                    background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
                  }}
                >
                  <div 
                    ref={slideContentRef}
                    className="p-8"
                    style={{
                      transform: `scale(${slideScale})`,
                      transformOrigin: 'top left',
                      width: `${100 / slideScale}%`,
                    }}
                    dangerouslySetInnerHTML={{ __html: parseMarkdown(slides[currentSlide].content) }}
                  />
                </div>

                {/* 幻灯片页码 */}
                <div className="mt-3 text-center flex-shrink-0">
                  <span className="text-zinc-500 text-xs">
                    第 {currentSlide + 1} 页
                  </span>
                </div>
              </div>

              {/* 导航按钮 */}
              <button
                onClick={() => goToSlide(currentSlide - 1)}
                disabled={currentSlide === 0}
                className={cn(
                  "absolute left-4 top-1/2 -translate-y-1/2",
                  "w-12 h-12 rounded-full bg-white/10 backdrop-blur text-white flex items-center justify-center",
                  "hover:bg-white/20 transition-all",
                  "disabled:opacity-20 disabled:cursor-not-allowed"
                )}
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                onClick={() => goToSlide(currentSlide + 1)}
                disabled={currentSlide === slides.length - 1}
                className={cn(
                  "absolute right-4 top-1/2 -translate-y-1/2",
                  "w-12 h-12 rounded-full bg-white/10 backdrop-blur text-white flex items-center justify-center",
                  "hover:bg-white/20 transition-all",
                  "disabled:opacity-20 disabled:cursor-not-allowed"
                )}
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}
        </main>
      </div>

      {/* 底部提示 */}
      <footer className="bg-black/40 border-t border-white/10 px-6 py-2 text-center">
        <span className="text-zinc-500 text-xs">
          使用 <kbd className="px-1.5 py-0.5 bg-zinc-700 rounded text-zinc-300 font-mono">←</kbd> <kbd className="px-1.5 py-0.5 bg-zinc-700 rounded text-zinc-300 font-mono">→</kbd> 键切换幻灯片
        </span>
      </footer>
    </div>
  );
}
