/**
 * 标题页模板
 * 
 * 用于课程开头、章节标题等
 */

import React from 'react';
import { AbsoluteFill } from 'remotion';
import type { SlideData } from '@/lib/teaching/remotion/types';
import { useSlideUp, useFadeIn } from '../utils/animations';
import { THEME_COLORS, getBackgroundStyle, FONT_STYLES, SIZES } from '../utils/styles';

interface TitleSlideProps {
  slide: SlideData;
  index: number;
}

export const TitleSlide: React.FC<TitleSlideProps> = ({ slide }) => {
  const theme = THEME_COLORS[slide.style];
  const backgroundStyle = getBackgroundStyle(slide.style, slide.background);

  // 动画
  const titleAnim = useSlideUp(0, 60);
  const subtitleAnim = useFadeIn(20, 25);

  return (
    <AbsoluteFill
      style={{
        ...backgroundStyle,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: SIZES.padding.slide,
      }}
    >
      {/* 装饰线 */}
      <div
        style={{
          width: 120,
          height: 4,
          backgroundColor: theme.accent,
          marginBottom: 48,
          opacity: titleAnim.opacity,
        }}
      />

      {/* 主标题 */}
      <h1
        style={{
          ...FONT_STYLES.title,
          fontSize: SIZES.fontSize.title,
          color: theme.text,
          textAlign: 'center',
          margin: 0,
          marginBottom: slide.subtitle ? 32 : 0,
          maxWidth: '90%',
          lineHeight: 1.2,
          ...titleAnim,
        }}
      >
        {slide.title}
      </h1>

      {/* 副标题 */}
      {slide.subtitle && (
        <p
          style={{
            ...FONT_STYLES.body,
            fontSize: SIZES.fontSize.subtitle,
            color: theme.muted,
            textAlign: 'center',
            margin: 0,
            maxWidth: '80%',
            lineHeight: 1.5,
            opacity: subtitleAnim.opacity,
          }}
        >
          {slide.subtitle}
        </p>
      )}

      {/* 底部装饰 */}
      <div
        style={{
          position: 'absolute',
          bottom: 60,
          display: 'flex',
          gap: 12,
          opacity: subtitleAnim.opacity,
        }}
      >
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: i === 1 ? theme.accent : theme.border,
            }}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
};

