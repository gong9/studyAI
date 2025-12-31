/**
 * Remotion 课程播放器
 * 
 * 使用 Remotion Player 播放 HTML 幻灯片课程
 * 支持自适应缩放、时间轴控制
 */

'use client';

import React, { useMemo } from 'react';
import { Player } from '@remotion/player';
import { HtmlSlideVideo, type HtmlSlide, type CourseFrame } from '@/remotion/compositions/HtmlSlideVideo';

interface RemotionCoursePlayerProps {
  slides: HtmlSlide[];
  frames: CourseFrame[];
  audioData: { [key: number]: string };
  totalDuration: number; // 毫秒
  className?: string;
  autoPlay?: boolean;
  loop?: boolean;
  showControls?: boolean;
}

export const RemotionCoursePlayer: React.FC<RemotionCoursePlayerProps> = ({
  slides,
  frames,
  audioData,
  totalDuration,
  className,
  autoPlay = false,
  loop = false,
  showControls = true,
}) => {
  const fps = 30;
  
  // 计算总帧数
  const durationInFrames = useMemo(() => {
    return Math.max(fps * 10, Math.ceil((totalDuration / 1000) * fps));
  }, [totalDuration]);

  const inputProps = useMemo(() => ({
    slides,
    frames,
    audioData,
    totalDuration,
  }), [slides, frames, audioData, totalDuration]);

  if (!slides.length) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-zinc-900 text-white">
        暂无课程内容
      </div>
    );
  }

  return (
    <div className={className}>
      <Player
        component={HtmlSlideVideo}
        inputProps={inputProps}
        durationInFrames={durationInFrames}
        fps={fps}
        compositionWidth={1920}
        compositionHeight={1080}
        style={{
          width: '100%',
          height: '100%',
        }}
        autoPlay={autoPlay}
        loop={loop}
        controls={showControls}
      />
    </div>
  );
};

export default RemotionCoursePlayer;

