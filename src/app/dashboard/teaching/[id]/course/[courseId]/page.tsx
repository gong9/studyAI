'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { 
  ArrowLeft, Loader2, Play, Pause, SkipBack, SkipForward,
  Volume2, VolumeX, Maximize2, Minimize2, Download, Share2, Copy, Check, X
} from 'lucide-react';
import { cn } from '@/lib/utils';

// 课程帧类型
interface CourseFrame {
  slideIndex: number;
  action: 'speak' | 'highlight' | 'next_slide' | 'end';
  text?: string;
  audioIndex?: number;
  audioDuration?: number;
  highlightTarget?: string;
  timestamp: number;
}

interface CourseData {
  id: string;
  title: string;
  description?: string;
  duration: number;
  slides: string[];
  frames: CourseFrame[];
  audioData: { [key: number]: string };
  slideCount: number;
  frameCount: number;
}

export default function CoursePlayerPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = params.courseId as string;
  const kbId = params.id as string;

  // 状态
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [course, setCourse] = useState<CourseData | null>(null);
  
  // 播放状态
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [subtitle, setSubtitle] = useState<string>('');
  const [highlightTarget, setHighlightTarget] = useState<string | null>(null);
  
  // 控制状态
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isExporting, setIsExporting] = useState(false);
  const [showExportOptions, setShowExportOptions] = useState(false);
  const [exportQuality, setExportQuality] = useState<'fast' | 'balanced' | 'high'>('fast');
  const [exportResolution, setExportResolution] = useState<'720p' | '1080p'>('1080p');
  
  // 分享状态
  const [showShareModal, setShowShareModal] = useState(false);
  const [sharePassword, setSharePassword] = useState('');
  const [shareExpiresInDays, setShareExpiresInDays] = useState(7);
  const [isCreatingShare, setIsCreatingShare] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);

  // Refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playbackRef = useRef<{
    isPlaying: boolean;
    currentFrameIndex: number;
    timeoutId: NodeJS.Timeout | null;
  }>({ isPlaying: false, currentFrameIndex: 0, timeoutId: null });

  // 加载课程数据
  useEffect(() => {
    const fetchCourse = async () => {
      try {
        const res = await fetch(`/api/teaching/course/${courseId}`);
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || '加载失败');
        }
        const data = await res.json();
        setCourse(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchCourse();
  }, [courseId]);

  // 播放音频
  const playAudio = useCallback((base64: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (audioRef.current) {
        audioRef.current.pause();
      }

      const audio = new Audio(`data:audio/mp3;base64,${base64}`);
      audio.volume = isMuted ? 0 : volume;
      audioRef.current = audio;

      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error('音频播放失败'));

      audio.play().catch(reject);
    });
  }, [isMuted, volume]);

  // 执行单个帧
  const executeFrame = useCallback(async (frame: CourseFrame): Promise<void> => {
    if (!course) return;

    setCurrentSlideIndex(frame.slideIndex);
    setCurrentTime(frame.timestamp);

    switch (frame.action) {
      case 'speak':
        if (frame.text) {
          setSubtitle(frame.text);
        }
        if (frame.audioIndex !== undefined && course.audioData[frame.audioIndex]) {
          await playAudio(course.audioData[frame.audioIndex]);
        }
        break;

      case 'highlight':
        if (frame.highlightTarget) {
          setHighlightTarget(frame.highlightTarget);
        }
        break;

      case 'next_slide':
        setHighlightTarget(null);
        setSubtitle('');
        // 短暂停顿
        await new Promise(resolve => setTimeout(resolve, 500));
        break;

      case 'end':
        setSubtitle('课程结束');
        setIsPlaying(false);
        playbackRef.current.isPlaying = false;
        break;
    }
  }, [course, playAudio]);

  // 播放循环
  const playLoop = useCallback(async () => {
    if (!course || !playbackRef.current.isPlaying) return;

    const frameIndex = playbackRef.current.currentFrameIndex;
    if (frameIndex >= course.frames.length) {
      setIsPlaying(false);
      playbackRef.current.isPlaying = false;
      return;
    }

    const frame = course.frames[frameIndex];
    setCurrentFrameIndex(frameIndex);

    try {
      await executeFrame(frame);
      
      if (playbackRef.current.isPlaying) {
        playbackRef.current.currentFrameIndex = frameIndex + 1;
        // 立即执行下一帧
        playLoop();
      }
    } catch (err) {
      console.error('播放错误:', err);
      setIsPlaying(false);
      playbackRef.current.isPlaying = false;
    }
  }, [course, executeFrame]);

  // 开始/暂停播放
  const togglePlay = useCallback(() => {
    if (isPlaying) {
      // 暂停
      setIsPlaying(false);
      playbackRef.current.isPlaying = false;
      if (audioRef.current) {
        audioRef.current.pause();
      }
    } else {
      // 播放
      setIsPlaying(true);
      playbackRef.current.isPlaying = true;
      playbackRef.current.currentFrameIndex = currentFrameIndex;
      playLoop();
    }
  }, [isPlaying, currentFrameIndex, playLoop]);

  // 跳转到指定帧
  const seekToFrame = useCallback((frameIndex: number) => {
    if (!course || frameIndex < 0 || frameIndex >= course.frames.length) return;

    // 停止当前播放
    if (audioRef.current) {
      audioRef.current.pause();
    }
    
    setCurrentFrameIndex(frameIndex);
    playbackRef.current.currentFrameIndex = frameIndex;
    
    const frame = course.frames[frameIndex];
    setCurrentSlideIndex(frame.slideIndex);
    setCurrentTime(frame.timestamp);
    setSubtitle('');
    setHighlightTarget(null);

    // 如果正在播放，继续
    if (isPlaying) {
      playLoop();
    }
  }, [course, isPlaying, playLoop]);

  // 上一帧/下一帧
  const skipBackward = () => seekToFrame(Math.max(0, currentFrameIndex - 1));
  const skipForward = () => seekToFrame(currentFrameIndex + 1);

  // 重新开始
  const restart = () => {
    seekToFrame(0);
    setIsPlaying(false);
    playbackRef.current.isPlaying = false;
  };

  // 全屏切换（支持移动端横屏）
  const toggleFullscreen = async () => {
    try {
      if (!isFullscreen) {
        // 进入全屏
        if (containerRef.current?.requestFullscreen) {
          await containerRef.current.requestFullscreen();
        } else if ((containerRef.current as any)?.webkitRequestFullscreen) {
          await (containerRef.current as any).webkitRequestFullscreen();
        }
        
        // 尝试锁定横屏
        try {
          if (screen.orientation && (screen.orientation as any).lock) {
            await (screen.orientation as any).lock('landscape');
          }
        } catch (e) {
          console.log('横屏锁定不支持');
        }
        
        // CSS 模拟全屏（iOS 等）
        if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
          setIsFullscreen(true);
        }
      } else {
        // 退出全屏
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        } else if ((document as any).webkitFullscreenElement) {
          await (document as any).webkitExitFullscreen();
        }
        
        try {
          if (screen.orientation && (screen.orientation as any).unlock) {
            (screen.orientation as any).unlock();
          }
        } catch (e) {}
        
        setIsFullscreen(false);
      }
    } catch (err) {
      console.error('全屏切换失败:', err);
      setIsFullscreen(!isFullscreen);
    }
  };

  // 监听全屏状态变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFS = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
      setIsFullscreen(isFS);
      if (!isFS) {
        try {
          if (screen.orientation && (screen.orientation as any).unlock) {
            (screen.orientation as any).unlock();
          }
        } catch (e) {}
      }
    };
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  // 格式化时间
  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // 导出视频
  const exportVideo = async () => {
    if (!course) return;
    
    setShowExportOptions(false);
    setIsExporting(true);
    try {
      const res = await fetch(`/api/teaching/course/${courseId}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quality: exportQuality,
          resolution: exportResolution,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '导出失败');
      }
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${course.title}.mp4`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error: any) {
      console.error('导出失败:', error);
      alert('导出失败: ' + error.message);
    } finally {
      setIsExporting(false);
    }
  };

  // 创建分享
  const createShare = async () => {
    if (!sharePassword || sharePassword.length < 4) {
      alert('密码至少4位');
      return;
    }
    
    setIsCreatingShare(true);
    try {
      const res = await fetch(`/api/teaching/course/${courseId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: sharePassword,
          expiresInDays: shareExpiresInDays,
        }),
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '创建失败');
      }
      
      const data = await res.json();
      setShareUrl(data.shareUrl);
    } catch (error: any) {
      console.error('创建分享失败:', error);
      alert('创建分享失败: ' + error.message);
    } finally {
      setIsCreatingShare(false);
    }
  };

  // 复制分享链接
  const copyShareUrl = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  // 关闭分享弹窗
  const closeShareModal = () => {
    setShowShareModal(false);
    setSharePassword('');
    setShareUrl(null);
    setShareCopied(false);
  };

  // 计算进度
  const progress = course ? (currentTime / course.duration) * 100 : 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-white">
        <p className="text-red-400 mb-4">{error || '课程加载失败'}</p>
        <Button onClick={() => router.back()}>返回</Button>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className={cn(
        "min-h-screen bg-zinc-950 flex flex-col",
        isFullscreen && "fixed inset-0 z-[9999]"
      )}
    >
      {/* 全屏样式 */}
      {isFullscreen && (
        <style jsx global>{`
          body { overflow: hidden !important; }
          @media (orientation: portrait) and (max-width: 768px) {
            .fullscreen-landscape-hint { display: flex !important; }
          }
          @media (orientation: landscape) {
            .fullscreen-landscape-hint { display: none !important; }
          }
        `}</style>
      )}
      
      {/* 移动端横屏提示 */}
      {isFullscreen && (
        <div className="fullscreen-landscape-hint hidden fixed inset-0 z-[10000] bg-black/95 flex-col items-center justify-center text-white">
          <div className="text-6xl mb-4">📱</div>
          <p className="text-lg">请旋转手机至横屏观看</p>
          <button onClick={toggleFullscreen} className="mt-6 px-6 py-2 bg-zinc-700 rounded-lg text-sm">
            退出全屏
          </button>
        </div>
      )}
      
      {/* 顶部栏 */}
      <header className={cn(
        "bg-black/50 backdrop-blur-sm border-b border-white/10 px-4 py-3 flex items-center gap-4",
        isFullscreen && "absolute top-0 left-0 right-0 z-50 opacity-0 hover:opacity-100 transition-opacity"
      )}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
          className="text-zinc-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          返回
        </Button>
        
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-white">{course.title}</h1>
          <p className="text-sm text-zinc-400">
            {course.slideCount} 页 · {formatTime(course.duration)}
          </p>
        </div>
        
        <div className="relative z-[100]">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowExportOptions(!showExportOptions)}
            disabled={isExporting}
            className="bg-blue-500/20 border-blue-400/50 text-blue-300 hover:bg-blue-500/30"
          >
            {isExporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                导出中...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                导出视频
              </>
            )}
          </Button>
          
          {/* 导出选项弹窗 - 使用 fixed 定位确保在最上层 */}
          {showExportOptions && (
            <>
              {/* 背景遮罩 */}
              <div 
                className="fixed inset-0 z-[998]" 
                onClick={() => setShowExportOptions(false)}
              />
              {/* 弹窗内容 */}
              <div className="fixed top-20 right-4 w-72 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl z-[999] p-4">
                <h3 className="text-white font-medium mb-3">导出选项</h3>
              
              {/* 质量选择 */}
              <div className="mb-4">
                <label className="text-sm text-zinc-400 mb-2 block">速度/质量</label>
                <div className="space-y-2">
                  {[
                    { value: 'fast', label: '⚡ 极速', desc: '1-2分钟，适合预览' },
                    { value: 'balanced', label: '⚖️ 均衡', desc: '3-5分钟，推荐' },
                    { value: 'high', label: '✨ 高质量', desc: '10-15分钟，最佳画质' },
                  ].map((opt) => (
                    <label
                      key={opt.value}
                      className={cn(
                        "flex items-start gap-3 p-2 rounded-lg cursor-pointer transition-colors",
                        exportQuality === opt.value
                          ? "bg-blue-500/20 border border-blue-400/50"
                          : "hover:bg-zinc-800 border border-transparent"
                      )}
                    >
                      <input
                        type="radio"
                        name="quality"
                        value={opt.value}
                        checked={exportQuality === opt.value}
                        onChange={() => setExportQuality(opt.value as any)}
                        className="mt-1"
                      />
                      <div>
                        <div className="text-white text-sm">{opt.label}</div>
                        <div className="text-zinc-500 text-xs">{opt.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              
              {/* 分辨率选择 */}
              <div className="mb-4">
                <label className="text-sm text-zinc-400 mb-2 block">分辨率</label>
                <div className="flex gap-2">
                  {[
                    { value: '720p', label: '720p' },
                    { value: '1080p', label: '1080p' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setExportResolution(opt.value as any)}
                      className={cn(
                        "flex-1 py-2 px-3 rounded-lg text-sm transition-colors",
                        exportResolution === opt.value
                          ? "bg-blue-500/20 border border-blue-400/50 text-blue-300"
                          : "bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* 操作按钮 */}
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowExportOptions(false)}
                  className="flex-1 text-zinc-400"
                >
                  取消
                </Button>
                <Button
                  size="sm"
                  onClick={exportVideo}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  开始导出
                </Button>
              </div>
              </div>
            </>
          )}
        </div>
        
        {/* 分享按钮 */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowShareModal(true)}
          className="bg-green-500/20 border-green-400/50 text-green-300 hover:bg-green-500/30"
        >
          <Share2 className="h-4 w-4 mr-2" />
          分享课程
        </Button>
      </header>
      
      {/* 分享弹窗 */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            {/* 头部 */}
            <div className="px-6 py-5 border-b border-zinc-800">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Share2 className="h-5 w-5 text-blue-400" />
                  分享课程
                </h2>
                <button
                  onClick={closeShareModal}
                  className="text-zinc-500 hover:text-white transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            
            <div className="p-6">
              {!shareUrl ? (
                <>
                  {/* 设置密码 */}
                  <div className="mb-5">
                    <label className="text-sm text-zinc-400 mb-2 block">设置访问密码</label>
                    <input
                      type="text"
                      value={sharePassword}
                      onChange={(e) => setSharePassword(e.target.value)}
                      placeholder="至少4位密码"
                      className="w-full px-4 py-3 bg-zinc-800/50 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                    />
                  </div>
                  
                  {/* 有效期 */}
                  <div className="mb-6">
                    <label className="text-sm text-zinc-400 mb-2 block">有效期</label>
                    <div className="flex gap-2">
                      {[
                        { value: 7, label: '7天' },
                        { value: 30, label: '30天' },
                        { value: 0, label: '永久' },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setShareExpiresInDays(opt.value)}
                          className={cn(
                            "flex-1 py-2.5 px-3 rounded-xl text-sm font-medium transition-all",
                            shareExpiresInDays === opt.value
                              ? "bg-blue-500/20 border border-blue-500/50 text-blue-400"
                              : "bg-zinc-800/50 border border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300"
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  {/* 创建按钮 */}
                  <Button
                    onClick={createShare}
                    disabled={isCreatingShare || sharePassword.length < 4}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isCreatingShare ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        创建中...
                      </>
                    ) : (
                      <>
                        <Share2 className="h-4 w-4 mr-2" />
                        生成分享链接
                      </>
                    )}
                  </Button>
                </>
              ) : (
                <>
                  {/* 分享成功 */}
                  <div className="text-center mb-6">
                    <div className="w-14 h-14 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Check className="h-7 w-7 text-emerald-400" />
                    </div>
                    <p className="text-emerald-400 font-medium">分享链接已生成</p>
                  </div>
                  
                  {/* 链接展示 */}
                  <div className="mb-4">
                    <label className="text-sm text-zinc-400 mb-2 block">分享链接</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={shareUrl}
                        readOnly
                        className="flex-1 px-4 py-3 bg-zinc-800/50 border border-zinc-700 rounded-xl text-zinc-300 text-sm truncate"
                      />
                      <Button
                        onClick={copyShareUrl}
                        className={cn(
                          "px-4 rounded-xl transition-all",
                          shareCopied
                            ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                            : "bg-zinc-700 hover:bg-zinc-600 text-zinc-300"
                        )}
                      >
                        {shareCopied ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                  
                  {/* 密码提示 */}
                  <div className="bg-zinc-800/50 rounded-xl p-4 mb-6 border border-zinc-700">
                    <p className="text-sm text-zinc-400">
                      访问密码: <span className="text-white font-mono">{sharePassword}</span>
                    </p>
                    <p className="text-xs text-zinc-500 mt-1">
                      请将链接和密码一起发送给他人
                    </p>
                  </div>
                  
                  {/* 完成按钮 */}
                  <Button
                    onClick={closeShareModal}
                    className="w-full bg-zinc-700 hover:bg-zinc-600 text-white py-3 rounded-xl font-medium"
                  >
                    完成
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 主内容区 */}
      <div className={cn(
        "flex-1 flex flex-col items-center justify-center",
        isFullscreen ? "p-0" : "p-4"
      )}>
        {/* PPT 显示区 */}
        <div className={cn(
          "relative bg-black overflow-hidden shadow-2xl",
          isFullscreen 
            ? "w-full h-full rounded-none" 
            : "w-full max-w-5xl aspect-[16/9] rounded-lg"
        )}>
          {course.slides[currentSlideIndex] && (() => {
            const content = course.slides[currentSlideIndex];
            // 判断是否是 base64 图片：不包含常见的 markdown 字符
            const isImage = !content.includes('#') && !content.includes('\n') && content.length > 100;
            
            if (isImage) {
              // 精美模式：显示图片
              return (
                <img
                  src={`data:image/png;base64,${content}`}
                  alt={`Slide ${currentSlideIndex + 1}`}
                  className="w-full h-full object-contain"
                />
              );
            } else {
              // 普通模式：渲染 markdown（一屏展示，参考演示模式的渲染逻辑）
              const renderMarkdown = (md: string) => {
                // 1. 移除重复标题
                const lines = md.split('\n');
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
                
                let cleaned = filteredLines.join('\n');
                
                // 2. 渲染 HTML
                return cleaned
                  // 图片：![alt](url) -> <img>
                  .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<div class="my-4 flex justify-center"><img src="$2" alt="$1" class="max-h-48 w-auto rounded-lg shadow-lg" /></div>')
                  // 标题
                  .replace(/^# (.+)$/gm, '<h1 class="text-3xl font-bold mb-6 text-zinc-800 text-center">$1</h1>')
                  .replace(/^## (.+)$/gm, '<h2 class="text-xl font-semibold mb-3 text-zinc-700 text-center">$1</h2>')
                  .replace(/^### (.+)$/gm, '<h3 class="text-lg font-medium mb-2 text-zinc-600">$1</h3>')
                  // 粗体和斜体
                  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                  .replace(/\*(.+?)\*/g, '<em>$1</em>')
                  // 列表
                  .replace(/^- (.+)$/gm, '<div class="flex items-start gap-2 mb-2 text-lg"><span class="text-blue-500 font-bold">•</span><span class="text-zinc-700">$1</span></div>')
                  // 段落
                  .replace(/\n\n/g, '<div class="mb-4"></div>')
                  .replace(/\n/g, '<br/>');
              };
              
              return (
                <div className="w-full h-full overflow-auto bg-white p-8">
                  <div 
                    className="max-w-4xl mx-auto"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
                  />
                </div>
              );
            }
          })()}
          
          {/* 字幕 */}
          {subtitle && (
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6 pt-12">
              <p className="text-white text-lg text-center leading-relaxed max-w-3xl mx-auto">
                {subtitle}
              </p>
            </div>
          )}
          
          {/* 页码指示 */}
          <div className="absolute top-4 right-4 bg-black/60 text-white text-sm px-3 py-1 rounded-full">
            {currentSlideIndex + 1} / {course.slideCount}
          </div>
        </div>

        {/* 控制栏 */}
        <div className={cn(
          "bg-zinc-900/80 backdrop-blur-sm p-4",
          isFullscreen 
            ? "absolute bottom-0 left-0 right-0 opacity-0 hover:opacity-100 transition-opacity duration-300" 
            : "w-full max-w-5xl mt-6 rounded-xl"
        )}>
          {/* 进度条 */}
          <div className="mb-4">
            <div 
              className="h-2 bg-zinc-700 rounded-full cursor-pointer overflow-hidden"
              onClick={(e) => {
                if (!course) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const percent = (e.clientX - rect.left) / rect.width;
                const targetTime = percent * course.duration;
                // 找到最近的帧
                const targetFrame = course.frames.findIndex(f => f.timestamp >= targetTime);
                if (targetFrame >= 0) {
                  seekToFrame(targetFrame);
                }
              }}
            >
              <div 
                className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-zinc-500 mt-1">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(course.duration)}</span>
            </div>
          </div>

          {/* 控制按钮 */}
          <div className="flex items-center justify-center gap-4">
            {/* 左侧控制 */}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsMuted(!isMuted)}
                className="text-zinc-400 hover:text-white"
              >
                {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              </Button>
            </div>

            {/* 中间播放控制 */}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={restart}
                className="text-zinc-400 hover:text-white"
              >
                <SkipBack className="h-5 w-5" />
              </Button>
              
              <Button
                onClick={togglePlay}
                className="h-14 w-14 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white shadow-lg"
              >
                {isPlaying ? (
                  <Pause className="h-6 w-6" />
                ) : (
                  <Play className="h-6 w-6 ml-1" />
                )}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={skipForward}
                className="text-zinc-400 hover:text-white"
              >
                <SkipForward className="h-5 w-5" />
              </Button>
            </div>

            {/* 右侧控制 */}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleFullscreen}
                className="text-zinc-400 hover:text-white"
              >
                {isFullscreen ? (
                  <Minimize2 className="h-5 w-5" />
                ) : (
                  <Maximize2 className="h-5 w-5" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

