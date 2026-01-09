'use client';

/**
 * Remotion 课程播放器组件
 * 
 * 用于播放 HTML 格式的课程内容
 */

import React, { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { Player, PlayerRef } from '@remotion/player';
import { Button } from '@/components/ui/button';
import {
  Play, Pause, SkipBack, SkipForward,
  Volume2, VolumeX, Maximize2, Minimize2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SlideData, CourseFrame } from '@/lib/teaching/remotion/types';

// 导入 Remotion 组件（动态导入以避免 SSR 问题）
import { CourseVideo, CourseVideoProps } from '@/remotion/compositions/CourseVideo';

interface RemotionPlayerProps {
  slides: SlideData[];
  frames: CourseFrame[];
  audioData: { [key: number]: string };
  totalDuration: number;
  title?: string;
  className?: string;
}

export const RemotionPlayer: React.FC<RemotionPlayerProps> = ({
  slides,
  frames,
  audioData,
  totalDuration,
  title,
  className,
}) => {
  const playerRef = useRef<PlayerRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // 播放状态
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // 计算总帧数
  const fps = 30;
  const durationInFrames = useMemo(() => {
    return Math.max(fps * 10, Math.ceil((totalDuration / 1000) * fps));
  }, [totalDuration]);

  // 当前帧
  const currentFrame = useMemo(() => {
    return Math.floor((currentTime / 1000) * fps);
  }, [currentTime]);

  // 进度百分比
  const progress = useMemo(() => {
    return Math.min(100, (currentTime / totalDuration) * 100);
  }, [currentTime, totalDuration]);

  // 格式化时间
  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // 播放/暂停
  const togglePlay = useCallback(() => {
    if (playerRef.current) {
      if (isPlaying) {
        playerRef.current.pause();
      } else {
        playerRef.current.play();
      }
    }
  }, [isPlaying]);

  // 重新开始
  const restart = useCallback(() => {
    if (playerRef.current) {
      playerRef.current.seekTo(0);
      setCurrentTime(0);
    }
  }, []);

  // 快进/快退
  const skip = useCallback((seconds: number) => {
    if (playerRef.current) {
      const newFrame = Math.max(0, Math.min(durationInFrames, currentFrame + seconds * fps));
      playerRef.current.seekTo(newFrame);
    }
  }, [currentFrame, durationInFrames]);

  // 进度条点击
  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (playerRef.current) {
      const rect = e.currentTarget.getBoundingClientRect();
      const percent = (e.clientX - rect.left) / rect.width;
      const targetFrame = Math.floor(percent * durationInFrames);
      playerRef.current.seekTo(targetFrame);
    }
  }, [durationInFrames]);

  // 全屏切换
  const toggleFullscreen = useCallback(async () => {
    try {
      if (!isFullscreen) {
        if (containerRef.current?.requestFullscreen) {
          await containerRef.current.requestFullscreen();
        } else if ((containerRef.current as any)?.webkitRequestFullscreen) {
          await (containerRef.current as any).webkitRequestFullscreen();
        }
      } else {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        } else if ((document as any).webkitFullscreenElement) {
          await (document as any).webkitExitFullscreen();
        }
      }
    } catch (err) {
      console.error('全屏切换失败:', err);
      setIsFullscreen(!isFullscreen);
    }
  }, [isFullscreen]);

  // 监听全屏状态
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement || !!(document as any).webkitFullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  // 监听播放器状态
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);
    const onFrameUpdate = () => {
      const frame = player.getCurrentFrame();
      setCurrentTime((frame / fps) * 1000);
    };

    player.addEventListener('play', onPlay);
    player.addEventListener('pause', onPause);
    player.addEventListener('ended', onEnded);
    player.addEventListener('frameupdate', onFrameUpdate);

    return () => {
      player.removeEventListener('play', onPlay);
      player.removeEventListener('pause', onPause);
      player.removeEventListener('ended', onEnded);
      player.removeEventListener('frameupdate', onFrameUpdate);
    };
  }, [fps]);

  // 组件 props
  const inputProps: CourseVideoProps = useMemo(() => ({
    slides,
    frames,
    audioData,
    totalDuration,
  }), [slides, frames, audioData, totalDuration]);

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex flex-col bg-zinc-950',
        isFullscreen && 'fixed inset-0 z-[9999]',
        className
      )}
    >
      {/* 全屏时隐藏 body 滚动 */}
      {isFullscreen && (
        <style jsx global>{`
          body { overflow: hidden !important; }
        `}</style>
      )}

      {/* 顶部标题栏 */}
      <header className={cn(
        'bg-black/50 backdrop-blur-sm border-b border-white/10 px-4 py-3',
        isFullscreen && 'absolute top-0 left-0 right-0 z-50 opacity-0 hover:opacity-100 transition-opacity'
      )}>
        <h1 className="text-lg font-semibold text-white">{title || '课程播放'}</h1>
        <p className="text-sm text-zinc-400">
          {slides.length} 页 · {formatTime(totalDuration)}
        </p>
      </header>

      {/* 播放器区域 */}
      <div className={cn(
        'flex-1 flex items-center justify-center',
        isFullscreen ? 'p-0' : 'p-4'
      )}>
        <div className={cn(
          'relative overflow-hidden shadow-2xl',
          isFullscreen
            ? 'w-full h-full rounded-none'
            : 'w-full max-w-5xl aspect-[16/9] rounded-lg'
        )}>
          <Player
            ref={playerRef}
            component={CourseVideo as unknown as React.FC<Record<string, unknown>>}
            inputProps={inputProps as unknown as Record<string, unknown>}
            durationInFrames={durationInFrames}
            fps={fps}
            compositionWidth={1920}
            compositionHeight={1080}
            style={{
              width: '100%',
              height: '100%',
            }}
            controls={false}
            autoPlay={false}
            loop={false}
            clickToPlay={false}
            doubleClickToFullscreen={false}
            spaceKeyToPlayOrPause={true}
            moveToBeginningWhenEnded={false}
            showVolumeControls={false}
            showPlaybackRateControl={false}
          />
        </div>
      </div>

      {/* 控制栏 */}
      <div className={cn(
        'bg-zinc-900/80 backdrop-blur-sm p-4',
        isFullscreen
          ? 'absolute bottom-0 left-0 right-0 opacity-0 hover:opacity-100 transition-opacity duration-300'
          : 'mx-auto w-full max-w-5xl rounded-xl mb-4'
      )}>
        {/* 进度条 */}
        <div className="mb-4">
          <div
            className="h-2 bg-zinc-700 rounded-full cursor-pointer overflow-hidden"
            onClick={handleProgressClick}
          >
            <div
              className="h-full bg-white transition-all duration-150"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-zinc-500 mt-1">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(totalDuration)}</span>
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
              className="h-14 w-14 rounded-full bg-white hover:bg-zinc-200 text-zinc-900 shadow-lg"
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
              onClick={() => skip(10)}
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
  );
};

