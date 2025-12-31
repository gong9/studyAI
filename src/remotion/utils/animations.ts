/**
 * Remotion 动画工具函数
 */

import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

// ==================== 淡入动画 ====================

export function useFadeIn(
  delay: number = 0,
  duration: number = 20
): { opacity: number } {
  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame,
    [delay, delay + duration],
    [0, 1],
    { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }
  );
  return { opacity };
}

// ==================== 向上滑入动画 ====================

export function useSlideUp(
  delay: number = 0,
  distance: number = 50
): { opacity: number; transform: string } {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: {
      damping: 200,
      stiffness: 100,
      mass: 0.5,
    },
  });

  const opacity = interpolate(progress, [0, 1], [0, 1]);
  const translateY = interpolate(progress, [0, 1], [distance, 0]);

  return {
    opacity,
    transform: `translateY(${translateY}px)`,
  };
}

// ==================== 缩放动画 ====================

export function useScale(
  delay: number = 0,
  from: number = 0.8
): { opacity: number; transform: string } {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: {
      damping: 200,
      stiffness: 120,
      mass: 0.5,
    },
  });

  const opacity = interpolate(progress, [0, 1], [0, 1]);
  const scale = interpolate(progress, [0, 1], [from, 1]);

  return {
    opacity,
    transform: `scale(${scale})`,
  };
}

// ==================== 逐条出现动画 ====================

export function useStaggeredItems<T>(
  items: T[],
  staggerDelay: number = 8
): { item: T; style: { opacity: number; transform: string }; visible: boolean }[] {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return items.map((item, index) => {
    const itemDelay = 15 + index * staggerDelay; // 15帧后开始

    const progress = spring({
      frame: frame - itemDelay,
      fps,
      config: {
        damping: 200,
        stiffness: 100,
        mass: 0.5,
      },
    });

    const opacity = interpolate(progress, [0, 1], [0, 1]);
    const translateY = interpolate(progress, [0, 1], [30, 0]);

    return {
      item,
      style: {
        opacity,
        transform: `translateY(${translateY}px)`,
      },
      visible: frame >= itemDelay,
    };
  });
}

// ==================== 高亮闪烁动画 ====================

export function useHighlight(
  active: boolean,
  color: string = '#fbbf24'
): { boxShadow: string; backgroundColor: string } {
  const frame = useCurrentFrame();

  if (!active) {
    return { boxShadow: 'none', backgroundColor: 'transparent' };
  }

  // 脉冲效果
  const pulse = Math.sin(frame * 0.2) * 0.5 + 0.5;
  const shadowOpacity = interpolate(pulse, [0, 1], [0.3, 0.6]);
  const bgOpacity = interpolate(pulse, [0, 1], [0.1, 0.2]);

  return {
    boxShadow: `0 0 20px rgba(251, 191, 36, ${shadowOpacity})`,
    backgroundColor: `rgba(251, 191, 36, ${bgOpacity})`,
  };
}

// ==================== 打字机效果 ====================

export function useTypewriter(
  text: string,
  delay: number = 0,
  speed: number = 2 // 每帧显示的字符数
): string {
  const frame = useCurrentFrame();
  const charsToShow = Math.floor((frame - delay) * speed);
  
  if (charsToShow <= 0) return '';
  if (charsToShow >= text.length) return text;
  
  return text.slice(0, charsToShow);
}

// ==================== 进度条动画 ====================

export function useProgress(
  startFrame: number,
  endFrame: number
): number {
  const frame = useCurrentFrame();
  return interpolate(
    frame,
    [startFrame, endFrame],
    [0, 100],
    { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }
  );
}

