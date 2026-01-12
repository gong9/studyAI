'use client';

/**
 * 简单课程播放器 - 视频播放体验
 * 
 * 不依赖 Remotion，直接使用 HtmlSlideRenderer 渲染幻灯片
 * 支持：音频同步、进度条、全屏、字幕、倍速
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { HtmlSlideRenderer, type HtmlSlide } from './HtmlSlideRenderer';
import { 
  Play, Pause, SkipBack, SkipForward, 
  Volume2, VolumeX, Maximize, Minimize,
  RotateCcw
} from 'lucide-react';

export interface CourseFrame {
  slideIndex: number;
  action: 'speak' | 'highlight' | 'next_slide' | 'end';
  text?: string;
  audioIndex?: number;
  audioDuration?: number;
  timestamp: number;
}

interface SimpleCoursePlayerProps {
  slides: HtmlSlide[];
  frames: CourseFrame[];
  audioData: { [key: number]: string }; // base64 音频
  className?: string;
  autoPlay?: boolean;
  manuscriptId?: string; // 用于自动保存信息图预渲染结果
}

// 计算每帧的时间范围
interface FrameTiming {
  frame: CourseFrame;
  frameIndex: number;
  startTimeMs: number;
  endTimeMs: number;
  durationMs: number;
}

export const SimpleCoursePlayer: React.FC<SimpleCoursePlayerProps> = ({
  slides,
  frames,
  audioData,
  className,
  autoPlay = false,
  manuscriptId,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentSubtitle, setCurrentSubtitle] = useState('');
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);

  const currentSlide = slides[currentSlideIndex];

  // 预计算所有帧的时间线
  const frameTimings = useMemo<FrameTiming[]>(() => {
    let currentTime = 0;
    return frames.map((frame, index) => {
      const startTime = currentTime;
      const duration = frame.action === 'speak' 
        ? (frame.audioDuration || 3000)
        : (frame.action === 'next_slide' ? 100 : 500);
      
      currentTime += duration;
      
      return {
        frame,
        frameIndex: index,
        startTimeMs: startTime,
        endTimeMs: currentTime,
        durationMs: duration,
      };
    });
  }, [frames]);

  // 总时长
  const totalDurationMs = useMemo(() => {
    if (frameTimings.length === 0) return 0;
    return frameTimings[frameTimings.length - 1].endTimeMs;
  }, [frameTimings]);

  // 根据当前时间找到对应的帧
  const findFrameByTime = useCallback((timeMs: number): FrameTiming | null => {
    for (let i = frameTimings.length - 1; i >= 0; i--) {
      if (timeMs >= frameTimings[i].startTimeMs) {
        return frameTimings[i];
      }
    }
    return frameTimings[0] || null;
  }, [frameTimings]);

  // 播放指定帧的音频
  const playFrameAudio = useCallback(async (frameIndex: number): Promise<number> => {
    if (frameIndex >= frames.length) return 0;

    const frame = frames[frameIndex];
    
    if (frame.action === 'speak' && frame.audioIndex !== undefined) {
      const audioBase64 = audioData[frame.audioIndex];
      if (audioBase64 && audioRef.current) {
        return new Promise((resolve) => {
          audioRef.current!.src = `data:audio/mp3;base64,${audioBase64}`;
          audioRef.current!.muted = isMuted;
          audioRef.current!.playbackRate = playbackSpeed;
          
          audioRef.current!.onended = () => {
            setIsAudioPlaying(false);
            resolve(frame.audioDuration || 3000);
          };
          
          audioRef.current!.onerror = () => {
            setIsAudioPlaying(false);
            resolve(frame.audioDuration || 3000);
          };
          
          setIsAudioPlaying(true);
          audioRef.current!.play().catch(() => {
            setIsAudioPlaying(false);
            resolve(frame.audioDuration || 3000);
          });
        });
      }
    }
    
    return frame.audioDuration || (frame.action === 'next_slide' ? 100 : 500);
  }, [frames, audioData, isMuted, playbackSpeed]);

  // 主播放循环
  const playLoop = useCallback(async () => {
    if (!isPlaying) return;
    
    const frameTiming = frameTimings[currentFrameIndex];
    if (!frameTiming) {
      setIsPlaying(false);
      return;
    }

    setCurrentSlideIndex(frameTiming.frame.slideIndex);
    if (frameTiming.frame.action === 'speak' && frameTiming.frame.text) {
      setCurrentSubtitle(frameTiming.frame.text);
    }
    
    await playFrameAudio(currentFrameIndex);
    setCurrentTimeMs(frameTiming.endTimeMs);
    
    if (currentFrameIndex < frames.length - 1 && isPlaying) {
      setCurrentFrameIndex(prev => prev + 1);
    } else {
      setIsPlaying(false);
      setCurrentSubtitle('');
    }
  }, [isPlaying, frameTimings, currentFrameIndex, playFrameAudio, frames.length]);

  useEffect(() => {
    if (isPlaying && !isAudioPlaying) {
      playLoop();
    }
  }, [currentFrameIndex, isPlaying, isAudioPlaying, playLoop]);

  const togglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false);
      if (audioRef.current) {
        audioRef.current.pause();
      }
    } else {
      if (currentFrameIndex >= frames.length - 1) {
        setCurrentFrameIndex(0);
        setCurrentTimeMs(0);
      }
      setIsPlaying(true);
    }
  };

  const restart = () => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setCurrentFrameIndex(0);
    setCurrentTimeMs(0);
    setCurrentSlideIndex(0);
    setCurrentSubtitle('');
    setIsPlaying(false);
    setIsAudioPlaying(false);
  };

  const prevSlide = () => {
    const newIndex = Math.max(0, currentSlideIndex - 1);
    setCurrentSlideIndex(newIndex);
    const frameIndex = frameTimings.findIndex(ft => ft.frame.slideIndex === newIndex);
    if (frameIndex >= 0) {
      setCurrentFrameIndex(frameIndex);
      setCurrentTimeMs(frameTimings[frameIndex].startTimeMs);
    }
  };

  const nextSlide = () => {
    const newIndex = Math.min(slides.length - 1, currentSlideIndex + 1);
    setCurrentSlideIndex(newIndex);
    const frameIndex = frameTimings.findIndex(ft => ft.frame.slideIndex === newIndex);
    if (frameIndex >= 0) {
      setCurrentFrameIndex(frameIndex);
      setCurrentTimeMs(frameTimings[frameIndex].startTimeMs);
    }
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newTimeMs = percent * totalDurationMs;
    
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsAudioPlaying(false);
    setCurrentTimeMs(newTimeMs);
    
    const frameTiming = findFrameByTime(newTimeMs);
    if (frameTiming) {
      setCurrentFrameIndex(frameTiming.frameIndex);
      setCurrentSlideIndex(frameTiming.frame.slideIndex);
      if (frameTiming.frame.action === 'speak' && frameTiming.frame.text) {
        setCurrentSubtitle(frameTiming.frame.text);
      }
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
    }
  };

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    
    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const cycleSpeed = () => {
    const speeds = [0.75, 1.0, 1.25, 1.5, 2.0];
    const currentIndex = speeds.indexOf(playbackSpeed);
    const nextIndex = (currentIndex + 1) % speeds.length;
    setPlaybackSpeed(speeds[nextIndex]);
    if (audioRef.current) {
      audioRef.current.playbackRate = speeds[nextIndex];
    }
  };

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const progressPercent = totalDurationMs > 0 ? (currentTimeMs / totalDurationMs) * 100 : 0;

  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, []);

  if (!slides.length) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-zinc-900 text-white">
        暂无课程内容
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className={cn(
        'w-full h-full bg-zinc-900 flex flex-col overflow-hidden',
        isFullscreen && 'fixed inset-0 z-50',
        className
      )}
    >
      {/* 隐藏的音频元素 */}
      <audio ref={audioRef} />

      {/* 幻灯片区域 - flex-1 占满剩余空间 */}
      <div className="flex-1 min-h-0 relative overflow-hidden">
        {currentSlide && (
          <HtmlSlideRenderer 
            slide={currentSlide} 
            className="w-full h-full"
            manuscriptId={manuscriptId}
          />
        )}

        {/* 字幕 */}
        {currentSubtitle && (
          <div className="absolute bottom-6 left-0 right-0 flex justify-center pointer-events-none px-8">
            <div className="bg-black/80 backdrop-blur-sm px-8 py-4 rounded-xl max-w-[85%]">
              <p className="text-white text-xl text-center leading-relaxed">
                {currentSubtitle}
              </p>
            </div>
          </div>
        )}

        {/* 大播放按钮 */}
        {!isPlaying && (
          <div 
            className="absolute inset-0 flex items-center justify-center bg-black/20 cursor-pointer"
            onClick={togglePlay}
          >
            <div className="w-20 h-20 rounded-full bg-white/90 flex items-center justify-center shadow-2xl hover:scale-110 transition-transform">
              <Play size={40} className="text-zinc-900 ml-1" />
            </div>
          </div>
        )}
      </div>

      {/* 控制栏 - 固定高度 */}
      <div className="h-20 flex-shrink-0 bg-zinc-800/95 backdrop-blur-sm px-4 py-3">
        {/* 进度条 */}
        <div 
          className="h-1.5 bg-zinc-700 rounded-full mb-3 cursor-pointer group"
          onClick={handleProgressClick}
        >
          <div 
            className="h-full bg-purple-500 rounded-full relative"
            style={{ width: `${progressPercent}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow opacity-0 group-hover:opacity-100" />
          </div>
        </div>

        <div className="flex items-center justify-between">
          {/* 左侧：播放控制 */}
          <div className="flex items-center gap-2">
            <button onClick={restart} className="p-2 text-white/60 hover:text-white" title="重新开始">
              <RotateCcw size={18} />
            </button>
            
            <button
              onClick={prevSlide}
              className="p-2 text-white/60 hover:text-white disabled:opacity-30"
              disabled={currentSlideIndex === 0}
            >
              <SkipBack size={20} />
            </button>
            
            <button
              onClick={togglePlay}
              className="p-3 bg-purple-600 hover:bg-purple-700 rounded-full text-white"
            >
              {isPlaying ? <Pause size={22} /> : <Play size={22} className="ml-0.5" />}
            </button>
            
            <button
              onClick={nextSlide}
              className="p-2 text-white/60 hover:text-white disabled:opacity-30"
              disabled={currentSlideIndex === slides.length - 1}
            >
              <SkipForward size={20} />
            </button>

            <span className="text-white/70 text-sm ml-2 font-mono">
              {formatTime(currentTimeMs)} / {formatTime(totalDurationMs)}
            </span>
          </div>

          {/* 中间：幻灯片进度 */}
          <div className="text-white/50 text-sm">
            {currentSlideIndex + 1} / {slides.length}
          </div>

          {/* 右侧：其他控制 */}
          <div className="flex items-center gap-2">
            <button
              onClick={cycleSpeed}
              className="px-2 py-1 text-white/60 hover:text-white text-sm font-medium"
              title="播放速度"
            >
              {playbackSpeed}x
            </button>

            <button onClick={toggleMute} className="p-2 text-white/60 hover:text-white">
              {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>

            <button onClick={toggleFullscreen} className="p-2 text-white/60 hover:text-white">
              {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SimpleCoursePlayer;
