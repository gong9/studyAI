/**
 * 课程视频组合组件
 * 
 * 将幻灯片、帧序列和音频数据组合成完整的课程视频
 */

import React from 'react';
import { AbsoluteFill, Sequence, Audio, useVideoConfig } from 'remotion';
import type { SlideData, CourseFrame } from '@/lib/teaching/remotion/types';
import { SlideRenderer } from '../templates/SlideRenderer';

export interface CourseVideoProps {
  slides: SlideData[];
  frames: CourseFrame[];
  audioData: { [key: number]: string };
  totalDuration: number; // 毫秒
}

export const CourseVideo: React.FC<CourseVideoProps> = ({
  slides,
  frames,
  audioData,
  totalDuration,
}) => {
  const { fps } = useVideoConfig();

  // 如果没有数据，显示占位
  if (!slides.length) {
    return (
      <AbsoluteFill className="bg-zinc-900 flex items-center justify-center">
        <div className="text-white text-2xl">暂无课程内容</div>
      </AbsoluteFill>
    );
  }

  // 计算每个幻灯片的时间范围
  const slideTimings = calculateSlideTimings(frames, slides.length, fps);

  return (
    <AbsoluteFill className="bg-zinc-900">
      {/* 渲染每个幻灯片 */}
      {slides.map((slide, index) => {
        const timing = slideTimings[index];
        if (!timing) return null;

        return (
          <Sequence
            key={index}
            from={timing.startFrame}
            durationInFrames={timing.durationFrames}
          >
            <SlideRenderer slide={slide} index={index} />
          </Sequence>
        );
      })}

      {/* 渲染音频 */}
      {Object.entries(audioData).map(([indexStr, base64]) => {
        const audioIndex = parseInt(indexStr);
        const frame = frames.find(
          (f) => f.action === 'speak' && f.audioIndex === audioIndex
        );
        if (!frame) return null;

        const startFrame = Math.round((frame.timestamp / 1000) * fps);

        return (
          <Sequence key={`audio-${audioIndex}`} from={startFrame}>
            <Audio src={`data:audio/mp3;base64,${base64}`} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

// 计算每个幻灯片的时间信息
interface SlideTiming {
  startFrame: number;
  durationFrames: number;
}

function calculateSlideTimings(
  frames: CourseFrame[],
  slideCount: number,
  fps: number
): SlideTiming[] {
  const timings: SlideTiming[] = [];
  let currentSlideIndex = 0;
  let slideStartTime = 0;

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];

    // 检测幻灯片切换
    if (frame.slideIndex !== currentSlideIndex || i === frames.length - 1) {
      // 计算当前幻灯片的结束时间
      const endTime = frame.timestamp;

      timings[currentSlideIndex] = {
        startFrame: Math.round((slideStartTime / 1000) * fps),
        durationFrames: Math.max(
          1,
          Math.round(((endTime - slideStartTime) / 1000) * fps)
        ),
      };

      currentSlideIndex = frame.slideIndex;
      slideStartTime = frame.timestamp;
    }
  }

  // 处理最后一个幻灯片
  if (timings.length < slideCount) {
    const lastFrame = frames[frames.length - 1];
    if (lastFrame) {
      timings[currentSlideIndex] = {
        startFrame: Math.round((slideStartTime / 1000) * fps),
        durationFrames: Math.max(
          fps, // 至少 1 秒
          Math.round(
            (((lastFrame.audioDuration || 3000) + lastFrame.timestamp - slideStartTime) / 1000) * fps
          )
        ),
      };
    }
  }

  // 确保所有幻灯片都有时间信息
  for (let i = 0; i < slideCount; i++) {
    if (!timings[i]) {
      timings[i] = {
        startFrame: i * fps * 3, // 默认每页 3 秒
        durationFrames: fps * 3,
      };
    }
  }

  return timings;
}

