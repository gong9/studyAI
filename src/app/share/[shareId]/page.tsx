'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { 
  Loader2, Play, Pause, SkipBack, SkipForward,
  Volume2, VolumeX, Maximize2, Minimize2, Lock, Eye, EyeOff
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

interface ShareInfo {
  id: string;
  course: {
    title: string;
    description?: string;
    coverImage?: string;
    duration: number;
    viewCount: number;
  };
  requiresPassword: boolean;
  expiresAt?: string;
}

export default function SharePlayerPage() {
  const params = useParams();
  const shareId = params.shareId as string;

  // 状态
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null);
  const [course, setCourse] = useState<CourseData | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  
  // 密码输入
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  
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

  // Refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playbackRef = useRef<{
    isPlaying: boolean;
    currentFrameIndex: number;
    timeoutId: NodeJS.Timeout | null;
  }>({ isPlaying: false, currentFrameIndex: 0, timeoutId: null });

  // 加载分享信息
  useEffect(() => {
    const fetchShareInfo = async () => {
      try {
        const res = await fetch(`/api/share/${shareId}`);
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || '分享链接无效');
        }
        const data = await res.json();
        setShareInfo(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchShareInfo();
  }, [shareId]);

  // 验证密码
  const verifyPassword = async () => {
    if (!password) {
      setPasswordError('请输入密码');
      return;
    }
    
    setVerifying(true);
    setPasswordError(null);
    
    try {
      const res = await fetch(`/api/share/${shareId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '验证失败');
      }
      
      const data = await res.json();
      setCourse(data.course);
      setIsVerified(true);
    } catch (err: any) {
      setPasswordError(err.message);
    } finally {
      setVerifying(false);
    }
  };

  // 处理回车键
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      verifyPassword();
    }
  };

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
      setIsPlaying(false);
      playbackRef.current.isPlaying = false;
      if (audioRef.current) {
        audioRef.current.pause();
      }
    } else {
      setIsPlaying(true);
      playbackRef.current.isPlaying = true;
      playbackRef.current.currentFrameIndex = currentFrameIndex;
      playLoop();
    }
  }, [isPlaying, currentFrameIndex, playLoop]);

  // 跳转到指定帧
  const seekToFrame = useCallback((frameIndex: number) => {
    if (!course || frameIndex < 0 || frameIndex >= course.frames.length) return;

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

  // 全屏切换
  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await containerRef.current?.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error('全屏切换失败:', err);
    }
  };

  // 监听全屏状态变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // 格式化时间
  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // 计算进度
  const progress = course ? (currentTime / course.duration) * 100 : 0;

  // 加载中
  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  // 错误页面
  if (error) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-white">
        <div className="text-center">
          <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <Lock className="h-10 w-10 text-red-400" />
          </div>
          <h1 className="text-2xl font-semibold mb-2">链接无效</h1>
          <p className="text-zinc-400">{error}</p>
        </div>
      </div>
    );
  }

  // 密码验证页面
  if (!isVerified && shareInfo) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* 课程卡片 */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden mb-6">
            {shareInfo.course.coverImage && (
              <div className="aspect-video bg-zinc-800 overflow-hidden">
                <img
                  src={`data:image/png;base64,${shareInfo.course.coverImage}`}
                  alt={shareInfo.course.title}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div className="p-6">
              <h1 className="text-xl font-semibold text-white mb-2">
                {shareInfo.course.title}
              </h1>
              {shareInfo.course.description && (
                <p className="text-zinc-400 text-sm mb-4">
                  {shareInfo.course.description}
                </p>
              )}
              <div className="flex items-center gap-4 text-sm text-zinc-500">
                <span>{formatTime(shareInfo.course.duration)}</span>
                <span>·</span>
                <span>{shareInfo.course.viewCount} 次观看</span>
              </div>
            </div>
          </div>
          
          {/* 密码输入 */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-green-500/20 rounded-full flex items-center justify-center">
                <Lock className="h-5 w-5 text-green-400" />
              </div>
              <div>
                <h2 className="text-white font-medium">需要访问密码</h2>
                <p className="text-zinc-500 text-sm">请输入分享者提供的密码</p>
              </div>
            </div>
            
            <div className="relative mb-4">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入密码"
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-green-500 pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            
            {passwordError && (
              <p className="text-red-400 text-sm mb-4">{passwordError}</p>
            )}
            
            <Button
              onClick={verifyPassword}
              disabled={verifying || !password}
              className="w-full bg-green-600 hover:bg-green-700 text-white"
            >
              {verifying ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  验证中...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  开始观看
                </>
              )}
            </Button>
          </div>
          
          {/* 过期时间提示 */}
          {shareInfo.expiresAt && (
            <p className="text-center text-zinc-500 text-sm mt-4">
              此链接将于 {new Date(shareInfo.expiresAt).toLocaleDateString('zh-CN')} 过期
            </p>
          )}
        </div>
      </div>
    );
  }

  // 课程播放页面
  if (!course) {
    return null;
  }

  return (
    <div 
      ref={containerRef}
      className="min-h-screen bg-zinc-950 flex flex-col"
    >
      {/* 顶部栏 */}
      <header className={cn(
        "bg-black/50 backdrop-blur-sm border-b border-white/10 px-4 py-3 flex items-center gap-4",
        isFullscreen && "absolute top-0 left-0 right-0 z-50 opacity-0 hover:opacity-100 transition-opacity"
      )}>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-white">{course.title}</h1>
          <p className="text-sm text-zinc-400">
            {course.slideCount} 页 · {formatTime(course.duration)}
          </p>
        </div>
        
        <div className="text-sm text-zinc-500">
          分享课程
        </div>
      </header>

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
          {course.slides[currentSlideIndex] && (
            <img
              src={`data:image/png;base64,${course.slides[currentSlideIndex]}`}
              alt={`Slide ${currentSlideIndex + 1}`}
              className="w-full h-full object-contain"
            />
          )}
          
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
                const targetFrame = course.frames.findIndex(f => f.timestamp >= targetTime);
                if (targetFrame >= 0) {
                  seekToFrame(targetFrame);
                }
              }}
            >
              <div 
                className="h-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all duration-300"
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
                className="h-14 w-14 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white shadow-lg"
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

