/**
 * HTML 幻灯片视频组件
 * 
 * 渲染 AI 生成的 HTML 幻灯片，支持动画和音频
 */

import React from 'react';
import { AbsoluteFill, Sequence, Audio, useCurrentFrame, useVideoConfig, interpolate, Easing } from 'remotion';

export interface HtmlSlide {
  index: number;
  title: string;
  html: string;
}

export interface CourseFrame {
  slideIndex: number;
  action: 'speak' | 'highlight' | 'next_slide' | 'end';
  text?: string;
  audioIndex?: number;
  audioDuration?: number;
  highlightTarget?: string;
  timestamp: number;
}

/**
 * 背景音乐配置
 */
export interface BackgroundMusicConfig {
  src: string;           // 音乐 URL（CDN 地址）
  volume: number;        // 音量 0-1
  enabled: boolean;      // 是否启用
}

export interface HtmlSlideVideoProps {
  slides: HtmlSlide[];
  frames: CourseFrame[];
  audioData: { [key: number]: string };
  totalDuration: number;
  backgroundMusic?: BackgroundMusicConfig;  // 背景音乐
}

// 单个幻灯片渲染组件 - 支持 Remotion 帧同步动画
const HtmlSlideRenderer: React.FC<{ slide: HtmlSlide; isEntering: boolean; durationInFrames: number }> = ({ 
  slide, 
  isEntering,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  // 入场动画（0.6 秒淡入 + 滑入）
  const enterDuration = fps * 0.6;
  const opacity = isEntering 
    ? interpolate(frame, [0, enterDuration], [0, 1], { extrapolateRight: 'clamp' })
    : 1;
  
  const translateY = isEntering
    ? interpolate(frame, [0, enterDuration], [40, 0], { 
        extrapolateRight: 'clamp',
        easing: Easing.out(Easing.cubic),
      })
    : 0;
  
  // 轻微缩放效果（入场时从 0.98 到 1）
  const scale = isEntering
    ? interpolate(frame, [0, enterDuration], [0.98, 1], { 
        extrapolateRight: 'clamp',
        easing: Easing.out(Easing.cubic),
      })
    : 1;

  // 修复 100vh 问题
  const fixedHtml = slide.html
    .replace(/100vh/g, '100%')
    .replace(/height:\s*100vh/gi, 'height: 100%')
    .replace(/min-height:\s*100vh/gi, 'min-height: 100%');

  return (
    <AbsoluteFill
      style={{
        opacity,
        transform: `translateY(${translateY}px) scale(${scale})`,
        backgroundColor: '#0f0f23',
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          overflow: 'hidden',
        }}
        dangerouslySetInnerHTML={{ __html: fixedHtml }}
      />
    </AbsoluteFill>
  );
};

// 字幕组件
const SubtitleRenderer: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  // 淡入动画
  const opacity = interpolate(frame, [0, fps * 0.3], [0, 1], { extrapolateRight: 'clamp' });
  
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 80,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        opacity,
      }}
    >
      <div
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(8px)',
          padding: '16px 32px',
          borderRadius: 12,
          maxWidth: '85%',
          boxSizing: 'border-box',
        }}
      >
        <p
          style={{
            color: 'white',
            fontSize: 24,
            lineHeight: 1.6,
            textAlign: 'center',
            margin: 0,
            fontFamily: 'Inter, PingFang SC, system-ui, sans-serif',
            wordBreak: 'break-word',
            overflowWrap: 'break-word',
            whiteSpace: 'pre-wrap',
          }}
        >
          {text}
        </p>
      </div>
    </div>
  );
};

export const HtmlSlideVideo: React.FC<HtmlSlideVideoProps> = ({
  slides,
  frames,
  audioData,
  totalDuration,
  backgroundMusic,
}) => {
  const { fps } = useVideoConfig();

  if (!slides.length) {
    return (
      <AbsoluteFill style={{ backgroundColor: '#0f0f23', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'white', fontSize: 32 }}>暂无课程内容</div>
      </AbsoluteFill>
    );
  }

  // 计算每个幻灯片的时间
  const slideTimings = calculateSlideTimings(frames, slides.length, fps, totalDuration);

  return (
    <AbsoluteFill style={{ backgroundColor: '#0f0f23' }}>
      {/* 背景音乐 - 贯穿整个视频 */}
      {backgroundMusic?.enabled && backgroundMusic.src && (
        <Audio 
          src={backgroundMusic.src} 
          volume={Math.min(backgroundMusic.volume || 0.05, 0.1)}  // 限制最大 10%，默认 5%
          loop
        />
      )}

      {slides.map((slide, index) => {
        const timing = slideTimings[index];
        if (!timing) return null;

        return (
          <Sequence
            key={index}
            from={timing.startFrame}
            durationInFrames={timing.durationFrames}
          >
            <HtmlSlideRenderer slide={slide} isEntering={true} durationInFrames={timing.durationFrames} />
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

        // 计算时间偏移
        const timeOffset = frames[0]?.timestamp || 0;
        const startFrame = Math.round(((frame.timestamp - timeOffset) / 1000) * fps);

        return (
          <Sequence key={`audio-${audioIndex}`} from={startFrame}>
            <Audio src={`data:audio/mp3;base64,${base64}`} />
          </Sequence>
        );
      })}

      {/* 渲染字幕 */}
      {frames
        .filter((f) => f.action === 'speak' && f.text)
        .map((frame, index) => {
          const timeOffset = frames[0]?.timestamp || 0;
          const startFrame = Math.round(((frame.timestamp - timeOffset) / 1000) * fps);
          const duration = frame.audioDuration 
            ? Math.round((frame.audioDuration / 1000) * fps)
            : fps * 3; // 默认 3 秒

          return (
            <Sequence
              key={`subtitle-${index}`}
              from={startFrame}
              durationInFrames={duration}
            >
              <SubtitleRenderer text={frame.text!} />
            </Sequence>
          );
        })}
    </AbsoluteFill>
  );
};

interface SlideTiming {
  startFrame: number;
  durationFrames: number;
}

function calculateSlideTimings(
  frames: CourseFrame[],
  slideCount: number,
  fps: number,
  totalDuration: number
): SlideTiming[] {
  const timings: SlideTiming[] = [];
  
  // 如果没有帧数据，平均分配时间
  if (!frames.length) {
    const perSlideDuration = Math.max(fps * 3, Math.floor((totalDuration / 1000) * fps / slideCount));
    for (let i = 0; i < slideCount; i++) {
      timings.push({
        startFrame: i * perSlideDuration,
        durationFrames: perSlideDuration,
      });
    }
    return timings;
  }

  // 找到第一个 frame 的 timestamp 作为基准偏移量
  // 这样可以确保第一个幻灯片从 0 帧开始
  const timeOffset = frames[0]?.timestamp || 0;
  
  let currentSlideIndex = frames[0]?.slideIndex || 0;
  let slideStartTime = timeOffset; // 从第一个帧的时间开始

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];

    if (frame.slideIndex !== currentSlideIndex) {
      // 减去偏移量，确保从 0 开始
      const adjustedStartTime = slideStartTime - timeOffset;
      const adjustedEndTime = frame.timestamp - timeOffset;
      
      timings[currentSlideIndex] = {
        startFrame: Math.round((adjustedStartTime / 1000) * fps),
        durationFrames: Math.max(1, Math.round(((adjustedEndTime - adjustedStartTime) / 1000) * fps)),
      };
      currentSlideIndex = frame.slideIndex;
      slideStartTime = frame.timestamp;
    }
  }

  // 最后一个幻灯片
  const lastFrame = frames[frames.length - 1];
  if (lastFrame) {
    const adjustedStartTime = slideStartTime - timeOffset;
    const endTime = lastFrame.timestamp + (lastFrame.audioDuration || 3000);
    const adjustedEndTime = endTime - timeOffset;
    
    timings[currentSlideIndex] = {
      startFrame: Math.round((adjustedStartTime / 1000) * fps),
      durationFrames: Math.max(fps, Math.round(((adjustedEndTime - adjustedStartTime) / 1000) * fps)),
    };
  }

  // 填充缺失的幻灯片（从第0个开始检查）
  let lastEndFrame = 0;
  for (let i = 0; i < slideCount; i++) {
    if (!timings[i]) {
      timings[i] = {
        startFrame: lastEndFrame,
        durationFrames: fps * 3,
      };
    }
    lastEndFrame = timings[i].startFrame + timings[i].durationFrames;
  }

  return timings;
}

