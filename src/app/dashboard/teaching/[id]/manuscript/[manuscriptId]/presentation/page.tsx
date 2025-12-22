'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { 
  ArrowLeft, Loader2, ChevronLeft, ChevronRight,
  Presentation, Play, Pause, Square, Volume2, Maximize2, Minimize2,
  Mic, MicOff, MessageCircle, Sparkles, Image, Download, Radio
} from 'lucide-react';
import { cn } from '@/lib/utils';
import katex from 'katex';
import 'katex/dist/katex.min.css';

// ====== 定义 PPT 控制 API 类型 ======
interface PPTApi {
  // 导航
  next: () => void;
  prev: () => void;
  goTo: (index: number) => void;
  getCurrentSlide: () => number;
  getSlideCount: () => number;
  getSlideContent: (index: number) => string | null;
  
  // 高亮
  highlight: (targetId: string) => void;
  clearHighlight: () => void;
  
  // TTS
  speak: (text: string) => Promise<void>;
  stopSpeaking: () => void;
  isSpeaking: () => boolean;
  
  // 事件监听
  onSlideChange: (callback: (index: number) => void) => void;
  onSpeakEnd: (callback: () => void) => void;
  onReady: (callback: (slideCount: number) => void) => void;
}

declare global {
  interface Window {
    ppt: PPTApi;
  }
}

// ====== 渲染工具函数 ======

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

  // 行内公式 $...$
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

  return text;
}

// 简单的 Markdown 解析（支持常用语法）
function parseMarkdown(md: string, slideIndex: number): string {
  // 移除 frontmatter
  let content = md.replace(/^---[\s\S]*?---\n*/m, '');
  
  // 移除 HTML 标签
  content = content.replace(/<br\s*\/?>/gi, '\n');
  content = content.replace(/<\/?[a-z][a-z0-9]*(?:\s+[^>]*)?\s*\/?>/gi, '');
  
  // 移除重复标题
  const lines = content.split('\n');
  const filteredLines: string[] = [];
  let lastTitle = '';
  
  for (const line of lines) {
    const titleMatch = line.match(/^#+\s+(.+)$/);
    if (titleMatch) {
      const titleContent = titleMatch[1].trim();
      if (titleContent === lastTitle) continue;
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
    
    const separatorLine = tableLines[1];
    if (!separatorLine.includes('---')) return tableBlock;
    
    let tableHtml = '<table style="border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: 0.95rem;"><thead><tr>';
    
    const headerCells = tableLines[0].split('|').filter(c => c.trim());
    headerCells.forEach(cell => {
      tableHtml += `<th style="border: 1px solid #d1d5db; padding: 0.5rem 1rem; background-color: #f4f4f5; font-weight: 600; text-align: left; color: #27272a;">${cell.trim()}</th>`;
    });
    tableHtml += '</tr></thead><tbody>';
    
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

  // 为每个元素添加 data-id 用于高亮
  let elementIndex = 0;
  const getDataId = () => `slide-${slideIndex}-el-${elementIndex++}`;

  let html = content
    // 标题
    .replace(/^### (.+)$/gm, (_, t) => `<h3 data-id="${getDataId()}" class="text-xl font-semibold text-zinc-700 mt-4 mb-3 ppt-element">${t}</h3>`)
    .replace(/^## (.+)$/gm, (_, t) => `<h2 data-id="${getDataId()}" class="text-2xl font-bold text-zinc-800 mt-6 mb-3 pb-2 border-b-2 border-zinc-200 ppt-element">${t}</h2>`)
    .replace(/^# (.+)$/gm, (_, t) => `<h1 data-id="${getDataId()}" class="text-4xl font-bold text-zinc-900 mb-6 tracking-tight ppt-element">${t}</h1>`)
    // 粗体
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-bold text-zinc-900">$1</strong>')
    // 斜体
    .replace(/\*(.+?)\*/g, '<em class="text-zinc-600 italic">$1</em>')
    // 行内代码
    .replace(/`([^`]+)`/g, '<code class="px-2 py-1 bg-zinc-100 rounded text-sm font-mono text-zinc-700 border border-zinc-200">$1</code>')
    // 列表项
    .replace(/^- (.+)$/gm, (_, t) => `<li data-id="${getDataId()}" class="text-zinc-700 ppt-element">${t}</li>`)
    .replace(/^\d+\. (.+)$/gm, (_, t) => `<li data-id="${getDataId()}" class="text-zinc-700 ppt-element">${t}</li>`)
    // 图片
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => 
      `<div data-id="${getDataId()}" class="my-2 rounded-lg overflow-hidden shadow-md border border-gray-200 inline-block max-w-[48%] align-top mx-1 ppt-element"><img src="${src}" alt="${alt}" class="w-full max-h-[20vh] object-contain bg-white" /><p class="text-center text-gray-500 text-xs py-1 bg-gray-50 truncate px-2">${alt}</p></div>`)
    // 段落
    .replace(/\n\n/g, '</p><p class="text-gray-700 leading-relaxed my-3 text-lg ppt-element">')
    // 换行
    .replace(/\n/g, '<br/>');

  // 包装列表
  html = html.replace(/(<li[^>]*>.*<\/li>\s*)+/g, '<ul class="my-3 ml-6 space-y-2 list-disc marker:text-zinc-500">$&</ul>');

  // 渲染 LaTeX 公式
  html = renderLatex(html);

  return `<div class="slide-content text-lg"><p class="text-gray-700 leading-relaxed my-3">${html}</p></div>`;
}

// ====== 主组件 ======
export default function PresentationPage() {
  const params = useParams();
  const router = useRouter();
  const manuscriptId = params.manuscriptId as string;
  const kbId = params.id as string;

  const [manuscript, setManuscript] = useState<any>(null);
  const [slides, setSlides] = useState<{ content: string; title: string }[]>([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [slideScale, setSlideScale] = useState(1);
  
  // TTS 状态
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLecturing, setIsLecturing] = useState(false);
  const [lectureStatus, setLectureStatus] = useState('');
  const [isPreparingLecture, setIsPreparingLecture] = useState(false);
  const [prepareProgress, setPrepareProgress] = useState(0);
  const [prepareMessage, setPrepareMessage] = useState('');
  
  // MiniMax TTS 音频播放
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioMapRef = useRef<Map<string, string>>(new Map()); // text -> audioUrl 预加载缓存
  
  // 高亮状态
  const [highlightedElement, setHighlightedElement] = useState<string | null>(null);
  
  // 全屏状态
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // ====== Banana 精美模式状态 ======
  const [bananaImages, setBananaImages] = useState<string[]>([]);
  const [useBananaMode, setUseBananaMode] = useState(false);
  const [isGeneratingBanana, setIsGeneratingBanana] = useState(false);
  const [bananaProgress, setBananaProgress] = useState({ current: 0, total: 0, message: '' });
  
  // ====== 课程发布状态 ======
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishedCourseId, setPublishedCourseId] = useState<string | null>(null);
  const [hasLectureScript, setHasLectureScript] = useState(false);
  
  // ====== 语音互动状态 ======
  // 互动模式: idle | listening | processing | explaining | confirming
  const [interactionMode, setInteractionMode] = useState<'idle' | 'listening' | 'processing' | 'explaining' | 'confirming'>('idle');
  const [studentQuestion, setStudentQuestion] = useState('');
  const [interactionStatus, setInteractionStatus] = useState('');
  
  // 中断状态保存
  const interruptStateRef = useRef<{
    slideIndex: number;
    actionIndex: number;
    wasLecturing: boolean;
  } | null>(null);
  
  // 问题上下文（用于"没明白"时继续解释）
  const questionContextRef = useRef<{
    question: string;
    targetSlide: number;
    explainCount: number;
  } | null>(null);
  
  // 语音识别
  const recognitionRef = useRef<any>(null);
  const [isListeningEnabled, setIsListeningEnabled] = useState(false);
  const listeningTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // 用 refs 保存最新状态（解决闭包问题）
  const interactionModeRef = useRef(interactionMode);
  const isLecturingRef2 = useRef(isLecturing);
  
  // 同步状态到 refs
  useEffect(() => {
    interactionModeRef.current = interactionMode;
  }, [interactionMode]);
  
  useEffect(() => {
    isLecturingRef2.current = isLecturing;
  }, [isLecturing]);
  
  // refs
  const slideContainerRef = useRef<HTMLDivElement>(null);
  const slideContentRef = useRef<HTMLDivElement>(null);
  const speechSynthRef = useRef<SpeechSynthesisUtterance | null>(null);
  
  // 事件回调 refs
  const onSlideChangeRef = useRef<((index: number) => void) | null>(null);
  const onSpeakEndRef = useRef<(() => void) | null>(null);
  const onReadyRef = useRef<((slideCount: number) => void) | null>(null);

  // ====== TTS 相关函数 ======
  
  // 初始化 Audio 元素
  useEffect(() => {
    if (typeof window !== 'undefined' && !audioRef.current) {
      audioRef.current = new Audio();
    }
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);
  
  // 预加载单个音频（带延时避免限流）
  const preloadAudio = async (text: string, delay: number = 0): Promise<void> => {
    if (delay > 0) {
      await new Promise(r => setTimeout(r, delay));
    }
    
    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'TTS API 调用失败');
      }
      
      const result = await response.json();
      if (result.audioUrl) {
        audioMapRef.current.set(text, result.audioUrl);
        console.log('[TTS] 预加载成功:', text.substring(0, 30) + '...');
      }
    } catch (error) {
      console.error('[TTS] 预加载失败:', text.substring(0, 30), error);
    }
  };
  
  // 预加载前 N 条音频（快速启动）
  const preloadInitialAudio = async (
    texts: string[], 
    count: number = 5,
    onProgress?: (current: number, total: number) => void
  ): Promise<void> => {
    const DELAY_MS = 1000; // 每次请求间隔 1 秒，避免限速
    const toLoad = texts.slice(0, count);
    
    for (let i = 0; i < toLoad.length; i++) {
      const text = toLoad[i];
      if (audioMapRef.current.has(text)) {
        onProgress?.(i + 1, toLoad.length);
        continue;
      }
      
      await preloadAudio(text, i === 0 ? 0 : DELAY_MS);
      onProgress?.(i + 1, toLoad.length);
    }
  };
  
  // 后台继续加载剩余音频
  const preloadRemainingAudioRef = useRef<boolean>(false);
  
  const preloadRemainingAudio = async (texts: string[], startIndex: number = 5): Promise<void> => {
    if (preloadRemainingAudioRef.current) return; // 防止重复调用
    preloadRemainingAudioRef.current = true;
    
    const DELAY_MS = 1000; // 后台加载间隔 1 秒，避免限速
    const remaining = texts.slice(startIndex);
    
    console.log(`[TTS] 后台加载剩余 ${remaining.length} 条语音...`);
    
    for (const text of remaining) {
      if (!preloadRemainingAudioRef.current) break; // 被中断
      if (audioMapRef.current.has(text)) continue;
      
      await preloadAudio(text, DELAY_MS);
    }
    
    preloadRemainingAudioRef.current = false;
    console.log('[TTS] 后台加载完成');
  };
  
  // 停止后台预加载
  const stopPreloading = () => {
    preloadRemainingAudioRef.current = false;
  };
  
  // 使用预加载的音频播放
  const speak = useCallback(async (text: string): Promise<void> => {
    // 优先使用预加载的音频
    let audioUrl = audioMapRef.current.get(text);
    
    // 如果没有预加载，实时获取（作为回退）
    if (!audioUrl) {
      console.log('[TTS] 未预加载，实时获取...');
      try {
        const response = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        
        if (response.ok) {
          const result = await response.json();
          audioUrl = result.audioUrl;
          if (audioUrl) {
            audioMapRef.current.set(text, audioUrl);
          }
        }
      } catch (error) {
        console.error('[TTS] 实时获取失败:', error);
      }
    }
    
    // 如果还是没有音频 URL，回退到浏览器 TTS
    if (!audioUrl) {
      console.log('[TTS] 无音频，回退到浏览器 TTS');
      return speakWithBrowserTTS(text);
    }
    
    console.log('[TTS] 播放预加载音频');
    setIsSpeaking(true);
    
    // 播放音频
    return new Promise((resolve, reject) => {
      if (!audioRef.current) {
        audioRef.current = new Audio();
      }
      
      const audio = audioRef.current;
      audio.src = audioUrl!;
      
      const onEnded = () => {
        audio.removeEventListener('ended', onEnded);
        audio.removeEventListener('error', onError);
        setIsSpeaking(false);
        onSpeakEndRef.current?.();
        resolve();
      };
      
      const onError = (e: Event) => {
        console.error('[TTS] 音频播放错误:', e);
        audio.removeEventListener('ended', onEnded);
        audio.removeEventListener('error', onError);
        setIsSpeaking(false);
        // 回退到浏览器 TTS
        speakWithBrowserTTS(text).then(resolve).catch(reject);
      };
      
      audio.addEventListener('ended', onEnded);
      audio.addEventListener('error', onError);
      
      audio.play().catch((e) => {
        console.error('[TTS] 播放失败:', e);
        audio.removeEventListener('ended', onEnded);
        audio.removeEventListener('error', onError);
        setIsSpeaking(false);
        speakWithBrowserTTS(text).then(resolve).catch(reject);
      });
    });
  }, []);
  
  // 浏览器原生 TTS（作为回退）
  const speakWithBrowserTTS = useCallback((text: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!('speechSynthesis' in window)) {
        reject(new Error('浏览器不支持语音合成'));
        return;
      }

      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'zh-CN';
      utterance.rate = 1.3;
      utterance.pitch = 1;
      utterance.volume = 1;

      const voices = window.speechSynthesis.getVoices();
      const chineseVoice = voices.find(v => v.lang.includes('zh'));
      if (chineseVoice) {
        utterance.voice = chineseVoice;
      }

      utterance.onstart = () => {
        setIsSpeaking(true);
      };

      utterance.onend = () => {
        setIsSpeaking(false);
        onSpeakEndRef.current?.();
        resolve();
      };

      utterance.onerror = (event) => {
        setIsSpeaking(false);
        if (event.error === 'canceled' || event.error === 'interrupted') {
          resolve();
        } else {
          reject(new Error(event.error));
        }
      };

      speechSynthRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    });
  }, []);

  const stopSpeaking = useCallback(() => {
    // 停止 Audio 播放
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    // 停止浏览器 TTS
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  // ====== 高亮相关函数 ======
  const highlight = useCallback((targetId: string) => {
    // 清除之前的高亮
    document.querySelectorAll('.ppt-highlight').forEach(el => {
      el.classList.remove('ppt-highlight');
    });
    
    // 添加新高亮
    const element = document.querySelector(`[data-id="${targetId}"]`);
    if (element) {
      element.classList.add('ppt-highlight');
      setHighlightedElement(targetId);
    }
  }, []);

  const clearHighlight = useCallback(() => {
    document.querySelectorAll('.ppt-highlight').forEach(el => {
      el.classList.remove('ppt-highlight');
    });
    setHighlightedElement(null);
  }, []);

  // ====== 导航函数 ======
  const goToSlide = useCallback((index: number) => {
    if (index >= 0 && index < slides.length) {
      setCurrentSlide(index);
      clearHighlight();
      onSlideChangeRef.current?.(index);
    }
  }, [slides.length, clearHighlight]);

  // 使用函数式更新避免闭包问题
  const nextSlide = useCallback(() => {
    setCurrentSlide(prev => {
      const next = prev + 1;
      if (next < slides.length) {
        clearHighlight();
        onSlideChangeRef.current?.(next);
        return next;
      }
      return prev;
    });
  }, [slides.length, clearHighlight]);

  const prevSlide = useCallback(() => {
    setCurrentSlide(prev => {
      const next = prev - 1;
      if (next >= 0) {
        clearHighlight();
        onSlideChangeRef.current?.(next);
        return next;
      }
      return prev;
    });
  }, [clearHighlight]);

  // ====== 暴露 window.ppt API ======
  useEffect(() => {
    window.ppt = {
      // 导航
      next: nextSlide,
      prev: prevSlide,
      goTo: goToSlide,
      getCurrentSlide: () => currentSlide,
      getSlideCount: () => slides.length,
      getSlideContent: (index: number) => slides[index]?.content || null,
      
      // 高亮
      highlight,
      clearHighlight,
      
      // TTS
      speak,
      stopSpeaking,
      isSpeaking: () => isSpeaking,
      
      // 事件监听
      onSlideChange: (callback) => { onSlideChangeRef.current = callback; },
      onSpeakEnd: (callback) => { onSpeakEndRef.current = callback; },
      onReady: (callback) => { onReadyRef.current = callback; },
    };

    console.log('[Presentation] window.ppt API 已暴露');
  }, [currentSlide, slides, nextSlide, prevSlide, goToSlide, highlight, clearHighlight, speak, stopSpeaking, isSpeaking]);

  // ====== 数据加载 ======
  useEffect(() => {
    fetchManuscript();
  }, [manuscriptId]);

  // 触发 onReady 回调
  useEffect(() => {
    if (slides.length > 0 && !loading) {
      onReadyRef.current?.(slides.length);
      console.log(`[Presentation] Ready: ${slides.length} slides`);
    }
  }, [slides.length, loading]);

  // 全屏切换
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  // 监听全屏变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // 键盘导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prevSlide();
      if (e.key === 'ArrowRight') nextSlide();
      if (e.key === 'Escape') {
        if (isFullscreen) {
          document.exitFullscreen();
        } else {
          stopSpeaking();
          setIsLecturing(false);
        }
      }
      // F 键切换全屏
      if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [prevSlide, nextSlide, stopSpeaking, isFullscreen, toggleFullscreen]);

  // 自动缩放
  useEffect(() => {
    const adjustScale = () => {
      if (slideContainerRef.current && slideContentRef.current) {
        const container = slideContainerRef.current;
        const content = slideContentRef.current;
        
        content.style.transform = 'scale(1)';
        content.style.transformOrigin = 'top left';
        
        const containerHeight = container.clientHeight;
        const contentHeight = content.scrollHeight;
        
        if (contentHeight > containerHeight) {
          const scale = Math.max(0.6, (containerHeight - 10) / contentHeight);
          setSlideScale(scale);
        } else {
          setSlideScale(1);
        }
      }
    };
    
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
        
        const content = data.slidevMd || data.enrichedContent || data.confirmedContent || data.draftContent;
        if (content) {
          parseSlides(content);
        } else {
          setError('没有可预览的内容');
        }
        
        // 加载 Banana 图片（如果有）
        if (data.bananaImages) {
          try {
            const images = JSON.parse(data.bananaImages);
            if (Array.isArray(images) && images.length > 0) {
              setBananaImages(images);
              setUseBananaMode(true); // 如果有图片，默认使用精美模式
              console.log(`[Presentation] Loaded ${images.length} banana images`);
            }
          } catch (e) {
            console.error('[Presentation] Failed to parse banana images:', e);
          }
        }
        
        // 检查是否有讲解稿
        if (data.lectureScript) {
          setHasLectureScript(true);
        }
        
        // 检查是否已发布课程
        try {
          const publishRes = await fetch(`/api/teaching/manuscript/${manuscriptId}/publish`);
          if (publishRes.ok) {
            const publishData = await publishRes.json();
            if (publishData.hasPublished && publishData.course) {
              setPublishedCourseId(publishData.course.id);
              console.log(`[Presentation] Course already published: ${publishData.course.id}`);
            }
          }
        } catch (e) {
          console.error('[Presentation] Failed to check course status:', e);
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

  const parseSlides = (content: string) => {
    let parts = content.split(/\n---\n/);
    
    if (parts[0].trim().startsWith('---') || parts[0].includes('theme:')) {
      parts = parts.slice(1);
    }

    const parsed = parts
      .map(p => p.trim())
      .filter(p => p.length > 0)
      .map((content, index) => {
        const titleMatch = content.match(/^#\s+(.+)$/m);
        const title = titleMatch ? titleMatch[1] : `第 ${index + 1} 页`;
        return { content, title };
      });

    setSlides(parsed);
  };

  // ====== Banana 精美 PPT 生成 ======
  const generateBananaPPT = async () => {
    setIsGeneratingBanana(true);
    setBananaProgress({ current: 0, total: slides.length, message: '正在初始化...' });
    
    try {
      const res = await fetch(`/api/teaching/manuscript/${manuscriptId}/banana`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: 'default' }),
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '生成失败');
      }
      
      const result = await res.json();
      console.log('[Presentation] Banana generation complete:', result);
      
      // 重新获取图片
      const bananaRes = await fetch(`/api/teaching/manuscript/${manuscriptId}/banana`);
      if (bananaRes.ok) {
        const bananaData = await bananaRes.json();
        if (bananaData.images && bananaData.images.length > 0) {
          setBananaImages(bananaData.images);
          setUseBananaMode(true);
        }
      }
      
      setBananaProgress({ current: slides.length, total: slides.length, message: '生成完成！' });
    } catch (error: any) {
      console.error('[Presentation] Banana generation error:', error);
      setBananaProgress({ current: 0, total: 0, message: `错误: ${error.message}` });
    } finally {
      setIsGeneratingBanana(false);
    }
  };

  // 导出精美 PPTX
  const exportBananaPPTX = async () => {
    if (bananaImages.length === 0) return;
    
    try {
      const res = await fetch(`/api/teaching/manuscript/${manuscriptId}/export?format=pptx&style=banana`);
      if (!res.ok) {
        throw new Error('导出失败');
      }
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'presentation-banana.pptx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error: any) {
      console.error('[Presentation] Export error:', error);
    }
  };

  // 发布为课程
  const publishCourse = async () => {
    if (bananaImages.length === 0 || !hasLectureScript) {
      alert('请先生成精美PPT和讲解稿');
      return;
    }
    
    setIsPublishing(true);
    try {
      const res = await fetch(`/api/teaching/manuscript/${manuscriptId}/publish`, {
        method: 'POST',
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '发布失败');
      }
      
      const data = await res.json();
      setPublishedCourseId(data.courseId);
      
      // 跳转到课程播放页
      router.push(`/dashboard/teaching/${kbId}/course/${data.courseId}`);
    } catch (error: any) {
      console.error('[Presentation] Publish error:', error);
      alert('发布失败: ' + error.message);
    } finally {
      setIsPublishing(false);
    }
  };

  // 查看课程
  const viewCourse = () => {
    if (publishedCourseId) {
      router.push(`/dashboard/teaching/${kbId}/course/${publishedCourseId}`);
    }
  };

  // ====== 客户端驱动的讲解控制 ======
  const isLecturingRef = useRef(false);

  // 执行单个指令
  const executeCommand = async (command: any): Promise<void> => {
    console.log('[Presentation] 执行指令:', command);
    
    switch (command.action) {
      case 'speak':
        setLectureStatus(`讲解中...`);
        await speak(command.text);
        break;
        
      case 'highlight':
        highlight(command.target);
        await new Promise(r => setTimeout(r, 300)); // 等待高亮动画
        break;
        
      case 'clear_highlight':
        clearHighlight();
        break;
        
      case 'next_slide':
        nextSlide();
        await new Promise(r => setTimeout(r, 500)); // 等待翻页动画
        break;
        
      case 'prev_slide':
        prevSlide();
        await new Promise(r => setTimeout(r, 500));
        break;
        
      case 'go_to_slide':
        goToSlide(command.index);
        await new Promise(r => setTimeout(r, 500));
        break;
        
      case 'wait':
        // 服务端让等待时，短暂等待
        await new Promise(r => setTimeout(r, 500));
        break;
        
      case 'end':
        setLectureStatus(command.message || '讲解完成');
        isLecturingRef.current = false;
        setIsLecturing(false);
        return; // 不再获取下一条
    }
  };

  // 获取并执行下一条指令
  const fetchAndExecuteNext = async (): Promise<void> => {
    if (!isLecturingRef.current) return;
    
    try {
      const res = await fetch(`/api/teaching/lecture/${manuscriptId}`, {
        method: 'POST',
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '获取指令失败');
      }
      
      const command = await res.json();
      console.log('[Presentation] 收到指令:', command);
      
      // 更新进度
      if (command.progress) {
        setLectureStatus(`第 ${command.progress.slideIndex + 1}/${command.progress.totalSlides} 页`);
      }
      
      // 执行指令
      await executeCommand(command);
      
      // 如果不是结束，继续获取下一条
      if (command.action !== 'end' && isLecturingRef.current) {
        // 使用 setTimeout 避免调用栈过深
        setTimeout(() => fetchAndExecuteNext(), 0);
      }
      
    } catch (err: any) {
      console.error('[Presentation] 错误:', err);
      setLectureStatus(`出错: ${err.message}`);
      isLecturingRef.current = false;
      setIsLecturing(false);
    }
  };

  // 模拟平滑进度的定时器
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // 开始 LLM 驱动的讲解（使用 SSE 获取进度）
  const startLecture = async () => {
    // 显示全局 loading
    setIsPreparingLecture(true);
    setPrepareProgress(0);
    setPrepareMessage('正在连接服务器...');
    setLectureStatus('正在生成演讲稿，请稍候...');
    
    // 启动平滑进度动画（每100ms增加一点，最多到85%）
    let fakeProgress = 0;
    progressIntervalRef.current = setInterval(() => {
      fakeProgress += Math.random() * 2; // 每次随机增加 0-2%
      if (fakeProgress > 85) fakeProgress = 85; // 最多到 85%，留给真实完成
      setPrepareProgress(Math.round(fakeProgress));
    }, 200);
    
    try {
      // 使用 SSE 流式 API 初始化讲解
      const eventSource = new EventSource(
        `/api/teaching/lecture/${manuscriptId}/stream?startSlide=${currentSlide}`
      );
      
      await new Promise<void>((resolve, reject) => {
        eventSource.addEventListener('progress', (event) => {
          const data = JSON.parse(event.data);
          console.log('[Presentation] 进度:', data);
          // 用真实进度覆盖假进度（如果更大）
          if (data.percent > fakeProgress) {
            fakeProgress = data.percent;
            setPrepareProgress(data.percent);
          }
          setPrepareMessage(data.message || '处理中...');
        });
        
        eventSource.addEventListener('complete', async (event) => {
          const data = JSON.parse(event.data);
          console.log('[Presentation] 讲解初始化完成:', data);
          // 停止假进度
          if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
            progressIntervalRef.current = null;
          }
          eventSource.close();
          
          // 预加载前几条 TTS 音频（快速启动）
          const speakTexts: string[] = data.speakTexts || [];
          const INITIAL_LOAD_COUNT = 5; // 先加载前 5 条
          
          if (speakTexts.length > 0) {
            const initialCount = Math.min(INITIAL_LOAD_COUNT, speakTexts.length);
            console.log(`[Presentation] 预加载前 ${initialCount} 条语音...`);
            setPrepareMessage(`正在预加载语音 (0/${initialCount})...`);
            
            await preloadInitialAudio(speakTexts, initialCount, (current, total) => {
              const baseProgress = 85;
              const audioProgress = (current / total) * 15;
              setPrepareProgress(Math.round(baseProgress + audioProgress));
              setPrepareMessage(`正在预加载语音 (${current}/${total})...`);
            });
            
            console.log('[Presentation] 初始语音预加载完成');
            
            // 后台继续加载剩余音频（不阻塞启动）
            if (speakTexts.length > INITIAL_LOAD_COUNT) {
              preloadRemainingAudio(speakTexts, INITIAL_LOAD_COUNT);
            }
          }
          
          setPrepareProgress(100);
          setPrepareMessage(`就绪，即将开始...`);
          await new Promise(r => setTimeout(r, 300));
          resolve();
        });
        
        eventSource.addEventListener('error', (event) => {
          console.error('[Presentation] SSE 错误:', event);
          if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
          }
          eventSource.close();
          reject(new Error('生成演讲稿失败'));
        });
        
        eventSource.onerror = () => {
          if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
          }
          eventSource.close();
          reject(new Error('连接中断'));
        };
      });
      
      // 关闭 loading
      setIsPreparingLecture(false);
      
      // 演讲稿就绪后，进入全屏演示模式
      if (!document.fullscreenElement) {
        try {
          await document.documentElement.requestFullscreen();
          setIsFullscreen(true);
        } catch (e) {
          console.log('[Presentation] 无法进入全屏模式');
        }
      }
      
      // 等待一下让全屏动画完成
      await new Promise(r => setTimeout(r, 500));
      
      // 设置讲解状态
      isLecturingRef.current = true;
      setIsLecturing(true);
      setLectureStatus('讲解开始');
      
      // 开始获取并执行指令
      fetchAndExecuteNext();
      
    } catch (err: any) {
      console.error('[Presentation] 启动失败:', err);
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      setLectureStatus(`启动失败: ${err.message}`);
      setPrepareMessage(`出错: ${err.message}`);
      setIsPreparingLecture(false);
      isLecturingRef.current = false;
      setIsLecturing(false);
    }
  };

  const stopLecture = async () => {
    isLecturingRef.current = false;
    
    // 停止后台预加载
    stopPreloading();
    
    // 通知服务端停止
    try {
      await fetch(`/api/teaching/lecture/${manuscriptId}`, { method: 'DELETE' });
    } catch (e) {
      // 忽略错误
    }
    
    // 停止语音
    stopSpeaking();
    clearHighlight();
    
    setIsLecturing(false);
    setLectureStatus('已停止');
  };

  // 简单测试（不使用 LLM）
  const testSpeak = async () => {
    setLectureStatus('测试语音...');
    try {
      await speak('你好，这是浏览器语音测试。如果你能听到这段话，说明语音功能正常。');
      setLectureStatus('语音测试完成');
    } catch (err: any) {
      setLectureStatus(`语音测试失败: ${err.message}`);
    }
  };

  // ====== 语音识别相关 ======
  
  // 初始化语音识别（使用 refs 避免闭包问题）
  const initSpeechRecognition = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      console.warn('[语音识别] 浏览器不支持 SpeechRecognition');
      setInteractionStatus('浏览器不支持语音识别');
      return null;
    }
    
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'zh-CN';
    
    recognition.onresult = (event: any) => {
      const results = event.results;
      const lastResult = results[results.length - 1];
      const transcript = lastResult[0].transcript.trim();
      
      // 使用 refs 获取最新状态
      const mode = interactionModeRef.current;
      const lecturing = isLecturingRef2.current;
      
      console.log('[语音识别] 识别结果:', transcript, '(final:', lastResult.isFinal, ', mode:', mode, ')');
      
      if (!lastResult.isFinal) return;
      
      // 根据当前模式处理
      if (mode === 'idle' && lecturing) {
        // 检测唤醒词
        if (transcript.includes('老师') || transcript.includes('laoshi') || transcript.includes('老斯')) {
          console.log('[语音识别] 检测到唤醒词!');
          handleWakeUp();
        }
      } else if (mode === 'listening') {
        // 清除超时
        if (listeningTimeoutRef.current) {
          clearTimeout(listeningTimeoutRef.current);
          listeningTimeoutRef.current = null;
        }
        // 录制学生问题
        if (transcript.length > 2 && !transcript.includes('老师')) {
          console.log('[语音识别] 学生问题:', transcript);
          handleStudentQuestion(transcript);
        }
      } else if (mode === 'confirming') {
        // 检测确认词
        if (transcript.includes('明白') || transcript.includes('懂了') || transcript.includes('好了') || transcript.includes('可以') || transcript.includes('是')) {
          console.log('[语音识别] 学生明白了');
          handleStudentUnderstood();
        } else if (transcript.includes('没') || transcript.includes('不') || transcript.includes('再讲') || transcript.includes('不懂')) {
          console.log('[语音识别] 学生没明白');
          handleStudentNotUnderstood();
        }
      }
    };
    
    recognition.onerror = (event: any) => {
      console.error('[语音识别] 错误:', event.error);
      if (event.error === 'not-allowed') {
        setInteractionStatus('需要麦克风权限，请点击地址栏左侧允许');
      } else if (event.error === 'no-speech') {
        // 没检测到语音，忽略
      } else {
        setInteractionStatus(`语音识别错误: ${event.error}`);
      }
    };
    
    recognition.onend = () => {
      console.log('[语音识别] 识别结束');
      // 如果还需要监听，自动重启
      if (recognitionRef.current) {
        setTimeout(() => {
          try {
            recognitionRef.current?.start();
          } catch (e) {
            // 忽略
          }
        }, 100);
      }
    };
    
    return recognition;
  }, []); // 不依赖状态，使用 refs
  
  // 启动语音识别
  const startListening = useCallback(() => {
    if (!recognitionRef.current) {
      recognitionRef.current = initSpeechRecognition();
    }
    
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
        setIsListeningEnabled(true);
        console.log('[语音识别] 已启动');
      } catch (e) {
        console.error('[语音识别] 启动失败:', e);
      }
    }
  }, [initSpeechRecognition]);
  
  // 停止语音识别
  const stopListening = useCallback(() => {
    setIsListeningEnabled(false);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
        console.log('[语音识别] 已停止');
      } catch (e) {
        // 忽略
      }
    }
  }, []);
  
  // 处理唤醒
  const handleWakeUp = useCallback(() => {
    console.log('[互动] 学生唤醒老师');
    
    // 保存中断状态
    interruptStateRef.current = {
      slideIndex: currentSlide,
      actionIndex: 0, // 简化处理
      wasLecturing: isLecturing,
    };
    
    // 暂停讲解
    isLecturingRef.current = false;
    stopSpeaking();
    
    // 切换到监听模式
    setInteractionMode('listening');
    setInteractionStatus('我在听，你说...');
    
    // 语音回应
    speak('我在，你说。').then(() => {
      // 设置超时：5秒没输入就提示
      listeningTimeoutRef.current = setTimeout(() => {
        if (interactionModeRef.current === 'listening') {
          speak('你想问什么？我在听。');
          // 再等 5 秒
          listeningTimeoutRef.current = setTimeout(() => {
            if (interactionModeRef.current === 'listening') {
              speak('好的，我们继续上课。');
              handleStudentUnderstood();
            }
          }, 5000);
        }
      }, 5000);
    });
  }, [currentSlide, isLecturing, stopSpeaking, speak]);
  
  // 处理学生问题
  const handleStudentQuestion = useCallback(async (question: string) => {
    console.log('[互动] 处理学生问题:', question);
    
    setStudentQuestion(question);
    setInteractionMode('processing');
    setInteractionStatus('正在理解你的问题...');
    
    try {
      // 调用问题理解 API
      const response = await fetch(`/api/teaching/lecture/${manuscriptId}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          currentSlide,
          slideTitles: slides.map((s, i) => ({ index: i, title: s.title })),
        }),
      });
      
      if (!response.ok) {
        throw new Error('问题处理失败');
      }
      
      const result = await response.json();
      console.log('[互动] API 返回:', result);
      
      // 保存问题上下文
      questionContextRef.current = {
        question,
        targetSlide: result.targetSlide,
        explainCount: 1,
      };
      
      // 跳转到目标页
      if (result.targetSlide !== undefined && result.targetSlide !== currentSlide) {
        goToSlide(result.targetSlide);
      }
      
      // 开始讲解
      setInteractionMode('explaining');
      setInteractionStatus('正在解答...');
      
      // 播放回答
      if (result.response) {
        await speak(result.response);
      }
      
      // 切换到确认模式
      setInteractionMode('confirming');
      setInteractionStatus('等待确认...');
      await speak('现在明白了吗？');
      
    } catch (error: any) {
      console.error('[互动] 处理问题失败:', error);
      setInteractionStatus('处理失败: ' + error.message);
      await speak('抱歉，我没听清楚，你能再说一遍吗？');
      setInteractionMode('listening');
    }
  }, [manuscriptId, currentSlide, slides, goToSlide, speak]);
  
  // 学生明白了
  const handleStudentUnderstood = useCallback(async () => {
    console.log('[互动] 学生明白了，恢复讲解');
    
    setInteractionMode('idle');
    setInteractionStatus('');
    setStudentQuestion('');
    questionContextRef.current = null;
    
    // 恢复到中断位置
    if (interruptStateRef.current) {
      const { slideIndex, wasLecturing } = interruptStateRef.current;
      
      await speak('好的，我们继续刚才的内容。');
      
      // 跳回原来的页面
      if (slideIndex !== currentSlide) {
        goToSlide(slideIndex);
      }
      
      // 如果之前在讲解，继续讲解
      if (wasLecturing) {
        // 重新开始讲解（简化处理）
        setTimeout(() => {
          startLecture();
        }, 500);
      }
      
      interruptStateRef.current = null;
    }
  }, [currentSlide, goToSlide, speak]);
  
  // 学生没明白
  const handleStudentNotUnderstood = useCallback(async () => {
    console.log('[互动] 学生没明白，继续解释');
    
    const ctx = questionContextRef.current;
    if (!ctx) {
      setInteractionMode('listening');
      await speak('好的，你具体哪里不明白？再说一遍。');
      return;
    }
    
    ctx.explainCount++;
    setInteractionMode('processing');
    setInteractionStatus('换个方式解释...');
    
    try {
      // 调用继续解释 API
      const response = await fetch(`/api/teaching/lecture/${manuscriptId}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: ctx.question,
          currentSlide: ctx.targetSlide,
          slideTitles: slides.map((s, i) => ({ index: i, title: s.title })),
          continueExplaining: true,
          explainCount: ctx.explainCount,
        }),
      });
      
      if (!response.ok) {
        throw new Error('继续解释失败');
      }
      
      const result = await response.json();
      
      // 播放新的解释
      setInteractionMode('explaining');
      setInteractionStatus('正在解答...');
      
      if (result.response) {
        await speak(result.response);
      }
      
      // 再次确认
      setInteractionMode('confirming');
      setInteractionStatus('等待确认...');
      await speak('现在明白了吗？');
      
    } catch (error: any) {
      console.error('[互动] 继续解释失败:', error);
      await speak('好的，我们先继续，课后可以再问我。');
      handleStudentUnderstood();
    }
  }, [manuscriptId, slides, speak, handleStudentUnderstood]);
  
  // 讲解时自动启动语音识别
  useEffect(() => {
    if (isLecturing && interactionMode === 'idle') {
      startListening();
    }
    return () => {
      if (!isLecturing) {
        stopListening();
      }
    };
  }, [isLecturing, interactionMode, startListening, stopListening]);

  // 清理
  useEffect(() => {
    return () => {
      isLecturingRef.current = false;
      stopSpeaking();
      stopListening();
    };
  }, [stopSpeaking, stopListening]);

  // ====== 渲染 ======
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin text-zinc-400 mx-auto" />
          <p className="mt-4 text-zinc-400">加载中...</p>
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
      {/* 高亮样式 */}
      <style jsx global>{`
        .ppt-highlight {
          background: linear-gradient(90deg, rgba(161, 161, 170, 0.3) 0%, rgba(161, 161, 170, 0.1) 100%) !important;
          box-shadow: 0 0 0 4px rgba(113, 113, 122, 0.4);
          border-radius: 8px;
          animation: pulse-highlight 1.5s ease-in-out infinite;
        }
        @keyframes pulse-highlight {
          0%, 100% { box-shadow: 0 0 0 4px rgba(113, 113, 122, 0.4); }
          50% { box-shadow: 0 0 0 8px rgba(113, 113, 122, 0.2); }
        }
        .fullscreen-mode {
          cursor: none;
        }
        .fullscreen-mode:hover {
          cursor: default;
        }
      `}</style>

      {/* Banana 生成遮罩 */}
      {isGeneratingBanana && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center">
          <div className="text-center">
            <Sparkles className="h-16 w-16 mx-auto mb-6 text-amber-400 animate-pulse" />
            <h3 className="text-2xl font-light text-white mb-4">正在生成精美 PPT</h3>
            <p className="text-zinc-400 mb-6">{bananaProgress.message}</p>
            <div className="w-48 h-1 bg-zinc-800 mx-auto rounded-full overflow-hidden">
              <div 
                className="h-full bg-amber-400 transition-all duration-500"
                style={{ width: bananaProgress.total > 0 ? `${(bananaProgress.current / bananaProgress.total) * 100}%` : '10%' }}
              />
            </div>
            <p className="text-zinc-500 text-sm mt-4">
              使用 AI 图像生成技术，每页约需 10-15 秒
            </p>
          </div>
        </div>
      )}

      {/* 全局 Loading 遮罩 - 简约风格 */}
      {isPreparingLecture && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center">
          <div className="text-center">
            {/* 简约进度数字 */}
            <div className="text-6xl font-extralight text-white tracking-tight mb-8">
              {prepareProgress}<span className="text-3xl text-zinc-500">%</span>
            </div>
            
            {/* 细长进度条 */}
            <div className="w-48 h-[2px] bg-zinc-800 mx-auto mb-6">
              <div 
                className="h-full bg-white transition-all duration-300 ease-out"
                style={{ width: `${prepareProgress}%` }}
              />
            </div>
            
            {/* 状态文字 */}
            <p className="text-zinc-500 text-sm font-light tracking-wide">
              {prepareMessage || '准备中...'}
            </p>
          </div>
        </div>
      )}

      {/* 顶部工具栏 - 全屏时隐藏 */}
      <header className={cn(
        "bg-black/40 backdrop-blur-xl border-b border-white/10 px-6 py-3 flex items-center justify-between transition-all duration-300",
        isFullscreen && "hidden"
      )}>
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-zinc-400 hover:text-white hover:bg-white/10"
            onClick={() => router.push(`/dashboard/teaching/${kbId}/manuscript/${manuscriptId}/preview`)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回预览
          </Button>
          <div className="h-4 w-px bg-white/20" />
          <h1 className="text-white font-medium">
            🎙️ 演示模式
          </h1>
        </div>

        <div className="flex items-center gap-4">
          {/* 语音互动状态 */}
          {interactionMode !== 'idle' && (
            <span className={cn(
              "text-sm flex items-center gap-2 px-3 py-1 rounded-full",
              interactionMode === 'listening' && "bg-zinc-500/20 text-zinc-300",
              interactionMode === 'processing' && "bg-amber-500/20 text-amber-400",
              interactionMode === 'explaining' && "bg-zinc-500/20 text-zinc-300",
              interactionMode === 'confirming' && "bg-zinc-500/20 text-zinc-300"
            )}>
              <Mic className="h-4 w-4 animate-pulse" />
              {interactionStatus || interactionMode}
            </span>
          )}
          
          {/* 讲解状态 */}
          {lectureStatus && interactionMode === 'idle' && (
            <span className="text-zinc-300 text-sm flex items-center gap-2">
              {isSpeaking && <Volume2 className="h-4 w-4 animate-pulse" />}
              {lectureStatus}
            </span>
          )}
          
          {/* 语音互动指示 */}
          {isListeningEnabled && interactionMode === 'idle' && (
            <span className="text-zinc-500 text-xs flex items-center gap-1">
              <Mic className="h-3 w-3" />
              说"老师"提问
            </span>
          )}
          
          <div className="h-4 w-px bg-white/20" />
          
          {/* 页码 */}
          <div className="flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full">
            <span className="text-zinc-300 font-mono text-sm font-bold">
              {currentSlide + 1}
            </span>
            <span className="text-zinc-500">/</span>
            <span className="text-zinc-400 font-mono text-sm">{slides.length}</span>
          </div>
          
          <div className="h-4 w-px bg-white/20" />
          
          {/* 讲解控制按钮 */}
          <Button 
            variant="outline" 
            size="sm"
            onClick={testSpeak}
            disabled={isLecturing || isSpeaking}
            className="bg-zinc-700/50 border-zinc-600/50 text-zinc-300 hover:bg-zinc-600/50"
          >
            <Volume2 className="h-4 w-4 mr-2" />
            测试语音
          </Button>
          
          {isLecturing ? (
            <Button 
              variant="outline" 
              size="sm"
              onClick={stopLecture}
              className="bg-red-500/20 border-red-400/50 text-red-400 hover:bg-red-500/30"
            >
              <Square className="h-4 w-4 mr-2" />
              停止讲解
            </Button>
          ) : (
            <Button 
              variant="outline" 
              size="sm"
              onClick={startLecture}
              disabled={slides.length === 0}
              className="bg-zinc-700/50 border-zinc-500/50 text-zinc-300 hover:bg-zinc-600/50"
            >
              <Play className="h-4 w-4 mr-2" />
              AI 自动讲解
            </Button>
          )}
          
          <div className="h-4 w-px bg-white/20" />
          
          {/* 手动提问按钮（语音识别备选） */}
          {isLecturing && interactionMode === 'idle' && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleWakeUp}
              className="bg-zinc-700/50 border-zinc-500/50 text-zinc-300 hover:bg-zinc-600/50"
            >
              <Mic className="h-4 w-4 mr-2" />
              我要提问
            </Button>
          )}
          
          {/* 确认按钮（语音识别备选） */}
          {interactionMode === 'confirming' && (
            <>
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleStudentUnderstood}
                className="bg-zinc-700/50 border-zinc-500/50 text-zinc-300 hover:bg-zinc-600/50"
              >
                明白了
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleStudentNotUnderstood}
                className="bg-amber-500/20 border-amber-400/50 text-amber-400 hover:bg-amber-500/30"
              >
                没明白
              </Button>
            </>
          )}
          
          <div className="h-4 w-px bg-white/20" />
          
          {/* Banana 精美模式控制 */}
          {bananaImages.length > 0 ? (
            <>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setUseBananaMode(!useBananaMode)}
                className={cn(
                  "border-zinc-500/50",
                  useBananaMode 
                    ? "bg-amber-500/30 border-amber-400/50 text-amber-300 hover:bg-amber-500/40" 
                    : "bg-zinc-700/50 text-zinc-300 hover:bg-zinc-600/50"
                )}
              >
                <Image className="h-4 w-4 mr-2" />
                {useBananaMode ? '精美模式' : '经典模式'}
              </Button>
              {useBananaMode && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={exportBananaPPTX}
                  className="bg-zinc-700/50 border-zinc-500/50 text-zinc-300 hover:bg-zinc-600/50"
                >
                  <Download className="h-4 w-4 mr-2" />
                  导出精美PPT
                </Button>
              )}
              
              {/* 课程发布按钮 */}
              {hasLectureScript && (
                publishedCourseId ? (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={viewCourse}
                    className="bg-green-500/20 border-green-400/50 text-green-300 hover:bg-green-500/30"
                  >
                    <Radio className="h-4 w-4 mr-2" />
                    查看课程
                  </Button>
                ) : (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={publishCourse}
                    disabled={isPublishing}
                    className="bg-purple-500/20 border-purple-400/50 text-purple-300 hover:bg-purple-500/30"
                  >
                    {isPublishing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        发布中...
                      </>
                    ) : (
                      <>
                        <Radio className="h-4 w-4 mr-2" />
                        发布课程
                      </>
                    )}
                  </Button>
                )
              )}
            </>
          ) : (
            <Button 
              variant="outline" 
              size="sm"
              onClick={generateBananaPPT}
              disabled={isGeneratingBanana || slides.length === 0}
              className="bg-amber-500/20 border-amber-400/50 text-amber-300 hover:bg-amber-500/30"
            >
              {isGeneratingBanana ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  生成精美PPT
                </>
              )}
            </Button>
          )}
          
          <div className="h-4 w-px bg-white/20" />
          
          {/* 全屏按钮 */}
          <Button 
            variant="outline" 
            size="sm"
            onClick={toggleFullscreen}
            className="bg-zinc-700/50 border-zinc-500/50 text-zinc-300 hover:bg-zinc-600/50"
          >
            <Maximize2 className="h-4 w-4 mr-2" />
            全屏演示
          </Button>
        </div>
      </header>

      {/* 主内容区 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧幻灯片缩略图 - 全屏时隐藏 */}
        <aside 
          className={cn(
            "w-48 bg-black/30 border-r border-white/10 overflow-y-auto transition-all duration-300 flex-shrink-0",
            isFullscreen && "hidden"
          )}
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: '#71717a #27272a',
          }}
        >
          <div className="p-2 space-y-1.5">
            {slides.map((slide, i) => (
              <div
                key={i}
                onClick={() => goToSlide(i)}
                className={cn(
                  "cursor-pointer rounded-lg overflow-hidden transition-all duration-200 group border bg-white",
                  currentSlide === i 
                    ? "ring-2 ring-zinc-400 shadow-lg shadow-zinc-500/20 scale-105 border-zinc-400" 
                    : "opacity-80 hover:opacity-100 hover:scale-102 border-zinc-300"
                )}
              >
                <div 
                  className="aspect-[16/9] p-2 relative flex items-center justify-center bg-white"
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
            </div>
          ) : (
            <>
              {/* 幻灯片内容 */}
              <div className={cn(
                "h-full flex flex-col justify-center",
                isFullscreen ? "w-full px-0" : "w-full max-w-[95%] px-4"
              )}>
                <div 
                  ref={slideContainerRef}
                  className={cn(
                    "overflow-hidden slide-theme bg-white",
                    isFullscreen 
                      ? "w-full h-full rounded-none border-0" 
                      : "aspect-[16/9] rounded-2xl shadow-2xl shadow-black/20 border border-zinc-200"
                  )}
                >
                  {/* Banana 模式：显示精美图片 */}
                  {useBananaMode && bananaImages[currentSlide] ? (
                    <img 
                      src={`data:image/png;base64,${bananaImages[currentSlide]}`}
                      alt={slides[currentSlide]?.title || `Slide ${currentSlide + 1}`}
                      className="w-full h-full object-contain bg-black"
                    />
                  ) : (
                    /* 经典模式：HTML 渲染 */
                    <div 
                      ref={slideContentRef}
                      className={cn(
                        "h-full bg-gradient-to-b from-white to-slate-50",
                        isFullscreen ? "p-12" : "p-8"
                      )}
                      style={{
                        transform: `scale(${slideScale})`,
                        transformOrigin: 'top left',
                        width: `${100 / slideScale}%`,
                        minHeight: '100%',
                      }}
                      dangerouslySetInnerHTML={{ __html: parseMarkdown(slides[currentSlide].content, currentSlide) }}
                    />
                  )}
                </div>

                {/* 幻灯片页码 - 非全屏时显示 */}
                {!isFullscreen && (
                  <div className="mt-3 text-center flex-shrink-0">
                    <span className="text-zinc-500 text-xs">
                      第 {currentSlide + 1} 页 · 演示模式
                    </span>
                  </div>
                )}
              </div>

              {/* 全屏时的悬浮页码 */}
              {isFullscreen && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/50 backdrop-blur rounded-full flex items-center gap-3">
                  <span className="text-white text-sm font-medium">
                    {currentSlide + 1} / {slides.length}
                  </span>
                  {isListeningEnabled && interactionMode === 'idle' && (
                    <span className="flex items-center gap-1 text-zinc-300 text-xs">
                      <Mic className="h-3 w-3 animate-pulse" />
                      语音互动
                    </span>
                  )}
                </div>
              )}
              
              {/* 语音互动状态指示器 */}
              {interactionMode !== 'idle' && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50">
                  <div className={cn(
                    "px-8 py-6 rounded-2xl backdrop-blur-xl shadow-2xl text-center",
                    interactionMode === 'listening' && "bg-zinc-700/90",
                    interactionMode === 'processing' && "bg-zinc-600/90",
                    interactionMode === 'explaining' && "bg-zinc-700/90",
                    interactionMode === 'confirming' && "bg-zinc-600/90"
                  )}>
                    {interactionMode === 'listening' && (
                      <>
                        <Mic className="h-12 w-12 mx-auto mb-3 text-white animate-pulse" />
                        <p className="text-white font-medium text-lg">我在听，你说...</p>
                        {studentQuestion && (
                          <p className="text-white/80 text-sm mt-2">"{studentQuestion}"</p>
                        )}
                        {/* 手动输入备选 */}
                        <div className="mt-4 flex gap-2">
                          <input
                            type="text"
                            placeholder="或在这里输入问题..."
                            className="px-3 py-2 rounded-lg bg-white/20 text-white placeholder-white/50 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-white/50"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const input = e.target as HTMLInputElement;
                                if (input.value.trim()) {
                                  handleStudentQuestion(input.value.trim());
                                  input.value = '';
                                }
                              }
                            }}
                          />
                          <button
                            className="px-3 py-2 rounded-lg bg-white/30 text-white text-sm hover:bg-white/40"
                            onClick={() => {
                              const input = document.querySelector('input[placeholder*="输入问题"]') as HTMLInputElement;
                              if (input?.value.trim()) {
                                handleStudentQuestion(input.value.trim());
                                input.value = '';
                              }
                            }}
                          >
                            提交
                          </button>
                        </div>
                      </>
                    )}
                    {interactionMode === 'processing' && (
                      <>
                        <Loader2 className="h-12 w-12 mx-auto mb-3 text-white animate-spin" />
                        <p className="text-white font-medium text-lg">正在理解你的问题...</p>
                        <p className="text-white/80 text-sm mt-2">"{studentQuestion}"</p>
                      </>
                    )}
                    {interactionMode === 'explaining' && (
                      <>
                        <MessageCircle className="h-12 w-12 mx-auto mb-3 text-white" />
                        <p className="text-white font-medium text-lg">正在解答...</p>
                      </>
                    )}
                    {interactionMode === 'confirming' && (
                      <>
                        <Mic className="h-12 w-12 mx-auto mb-3 text-white animate-pulse" />
                        <p className="text-white font-medium text-lg">明白了吗？</p>
                        <p className="text-white/80 text-sm mt-2">说"明白了"或"没明白"</p>
                        {/* 手动点击备选 */}
                        <div className="mt-4 flex gap-3 justify-center">
                          <button
                            className="px-4 py-2 rounded-lg bg-zinc-500 text-white text-sm font-medium hover:bg-zinc-600"
                            onClick={handleStudentUnderstood}
                          >
                            ✓ 明白了
                          </button>
                          <button
                            className="px-4 py-2 rounded-lg bg-amber-400 text-white text-sm font-medium hover:bg-amber-500"
                            onClick={handleStudentNotUnderstood}
                          >
                            ✗ 没明白
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* 全屏时的退出按钮 */}
              {isFullscreen && (
                <button
                  onClick={toggleFullscreen}
                  className="absolute top-4 right-4 p-3 bg-black/30 backdrop-blur rounded-full text-white/70 hover:text-white hover:bg-black/50 transition-all opacity-0 hover:opacity-100"
                >
                  <Minimize2 className="h-5 w-5" />
                </button>
              )}

              {/* 导航按钮 - 全屏时半透明 */}
              <button
                onClick={prevSlide}
                disabled={currentSlide === 0}
                className={cn(
                  "absolute left-4 top-1/2 -translate-y-1/2",
                  "w-12 h-12 rounded-full bg-white/10 backdrop-blur text-white flex items-center justify-center",
                  "hover:bg-white/20 transition-all",
                  "disabled:opacity-20 disabled:cursor-not-allowed",
                  isFullscreen && "opacity-20 hover:opacity-100"
                )}
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                onClick={nextSlide}
                disabled={currentSlide === slides.length - 1}
                className={cn(
                  "absolute right-4 top-1/2 -translate-y-1/2",
                  "w-12 h-12 rounded-full bg-white/10 backdrop-blur text-white flex items-center justify-center",
                  "hover:bg-white/20 transition-all",
                  "disabled:opacity-20 disabled:cursor-not-allowed",
                  isFullscreen && "opacity-20 hover:opacity-100"
                )}
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}
        </main>
      </div>

      {/* 底部提示 - 全屏时隐藏 */}
      <footer className={cn(
        "bg-black/40 border-t border-white/10 px-6 py-2 text-center transition-all duration-300",
        isFullscreen && "hidden"
      )}>
        <span className="text-zinc-500 text-xs">
          使用 <kbd className="px-1.5 py-0.5 bg-zinc-700 rounded text-zinc-300 font-mono">←</kbd> <kbd className="px-1.5 py-0.5 bg-zinc-700 rounded text-zinc-300 font-mono">→</kbd> 切换幻灯片 · 
          <kbd className="px-1.5 py-0.5 bg-zinc-700 rounded text-zinc-300 font-mono ml-2">F</kbd> 全屏 · 
          <kbd className="px-1.5 py-0.5 bg-zinc-700 rounded text-zinc-300 font-mono ml-2">ESC</kbd> 退出/停止 · 
          <span className="text-zinc-400 ml-2">🎤 讲解中说"老师"可提问</span>
        </span>
      </footer>
    </div>
  );
}

