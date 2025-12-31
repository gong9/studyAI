/**
 * 引用/金句模板
 * 
 * 用于展示名言、重点结论等
 */

import React from 'react';
import { AbsoluteFill } from 'remotion';
import type { SlideData } from '@/lib/teaching/remotion/types';
import { useSlideUp, useFadeIn, useScale } from '../utils/animations';
import { THEME_COLORS, getBackgroundStyle, FONT_STYLES, SIZES } from '../utils/styles';

interface QuoteSlideProps {
  slide: SlideData;
  index: number;
}

export const QuoteSlide: React.FC<QuoteSlideProps> = ({ slide }) => {
  const theme = THEME_COLORS[slide.style];
  const backgroundStyle = getBackgroundStyle(slide.style, slide.background);

  // 动画
  const quoteMarkAnim = useScale(0, 0.5);
  const quoteTextAnim = useSlideUp(10, 40);
  const authorAnim = useFadeIn(30, 20);

  const quoteText = slide.quote || slide.title || '';
  const author = slide.author || slide.subtitle || '';

  return (
    <AbsoluteFill
      style={{
        ...backgroundStyle,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: SIZES.padding.slide * 1.5,
      }}
    >
      {/* 引号装饰 */}
      <div
        style={{
          position: 'absolute',
          top: 120,
          left: 100,
          fontSize: 200,
          color: theme.accent,
          opacity: 0.15,
          ...FONT_STYLES.title,
          lineHeight: 1,
          ...quoteMarkAnim,
        }}
      >
        "
      </div>

      {/* 引用文本 */}
      <blockquote
        style={{
          ...FONT_STYLES.title,
          fontSize: SIZES.fontSize.heading + 8,
          color: theme.text,
          textAlign: 'center',
          margin: 0,
          maxWidth: '85%',
          lineHeight: 1.4,
          position: 'relative',
          zIndex: 1,
          ...quoteTextAnim,
        }}
      >
        {quoteText}
      </blockquote>

      {/* 作者/来源 */}
      {author && (
        <div
          style={{
            marginTop: 48,
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            opacity: authorAnim.opacity,
          }}
        >
          <div
            style={{
              width: 60,
              height: 2,
              backgroundColor: theme.accent,
            }}
          />
          <span
            style={{
              ...FONT_STYLES.body,
              fontSize: SIZES.fontSize.subtitle,
              color: theme.muted,
              fontStyle: 'italic',
            }}
          >
            — {author}
          </span>
        </div>
      )}

      {/* 底部装饰 */}
      <div
        style={{
          position: 'absolute',
          bottom: 60,
          display: 'flex',
          gap: 8,
          opacity: authorAnim.opacity,
        }}
      >
        <div
          style={{
            width: 40,
            height: 4,
            backgroundColor: theme.accent,
            borderRadius: 2,
          }}
        />
        <div
          style={{
            width: 20,
            height: 4,
            backgroundColor: theme.border,
            borderRadius: 2,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

