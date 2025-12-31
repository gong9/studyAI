/**
 * 双栏布局模板
 * 
 * 用于对比、图文混排等场景
 */

import React from 'react';
import { AbsoluteFill } from 'remotion';
import type { SlideData, ContentBlock } from '@/lib/teaching/remotion/types';
import { useSlideUp, useFadeIn } from '../utils/animations';
import { THEME_COLORS, getBackgroundStyle, FONT_STYLES, SIZES } from '../utils/styles';

interface TwoColumnSlideProps {
  slide: SlideData;
  index: number;
}

export const TwoColumnSlide: React.FC<TwoColumnSlideProps> = ({ slide }) => {
  const theme = THEME_COLORS[slide.style];
  const backgroundStyle = getBackgroundStyle(slide.style, slide.background);

  // 动画
  const titleAnim = useSlideUp(0, 40);
  const leftAnim = useFadeIn(15, 25);
  const rightAnim = useFadeIn(25, 25);

  const leftContent = slide.leftContent || [];
  const rightContent = slide.rightContent || [];

  return (
    <AbsoluteFill
      style={{
        ...backgroundStyle,
        display: 'flex',
        flexDirection: 'column',
        padding: SIZES.padding.slide,
      }}
    >
      {/* 标题区域 */}
      {slide.title && (
        <div
          style={{
            marginBottom: SIZES.spacing.titleMargin,
            ...titleAnim,
          }}
        >
          <h2
            style={{
              ...FONT_STYLES.title,
              fontSize: SIZES.fontSize.heading,
              color: theme.text,
              margin: 0,
              paddingBottom: 16,
              borderBottom: `3px solid ${theme.accent}`,
              display: 'inline-block',
            }}
          >
            {slide.title}
          </h2>
        </div>
      )}

      {/* 双栏内容区域 */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          gap: 60,
        }}
      >
        {/* 左栏 */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            opacity: leftAnim.opacity,
          }}
        >
          {leftContent.map((block, i) => (
            <ColumnContent key={i} block={block} theme={theme} />
          ))}
        </div>

        {/* 分隔线 */}
        <div
          style={{
            width: 2,
            backgroundColor: theme.border,
            opacity: 0.5,
          }}
        />

        {/* 右栏 */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            opacity: rightAnim.opacity,
          }}
        >
          {rightContent.map((block, i) => (
            <ColumnContent key={i} block={block} theme={theme} />
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// 列内容渲染器
interface ColumnContentProps {
  block: ContentBlock;
  theme: typeof THEME_COLORS.dark;
}

const ColumnContent: React.FC<ColumnContentProps> = ({ block, theme }) => {
  if (block.type === 'text') {
    return (
      <p
        style={{
          ...FONT_STYLES.body,
          fontSize: SIZES.fontSize.body,
          color: block.highlight ? theme.accent : theme.text,
          margin: 0,
          marginBottom: 16,
          lineHeight: 1.6,
        }}
      >
        {block.content}
      </p>
    );
  }

  if (block.type === 'list') {
    return (
      <div style={{ marginBottom: 16 }}>
        {block.items.map((item, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              marginBottom: 12,
            }}
          >
            <span
              style={{
                ...FONT_STYLES.body,
                fontSize: SIZES.fontSize.body - 4,
                color: theme.accent,
                fontWeight: 700,
              }}
            >
              {block.ordered ? `${i + 1}.` : '→'}
            </span>
            <span
              style={{
                ...FONT_STYLES.body,
                fontSize: SIZES.fontSize.body - 4,
                color: theme.text,
                lineHeight: 1.5,
              }}
            >
              {item}
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (block.type === 'image') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <img
          src={block.src}
          alt={block.alt || ''}
          style={{
            maxWidth: '100%',
            maxHeight: 350,
            objectFit: 'contain',
            borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }}
        />
        {block.caption && (
          <p
            style={{
              ...FONT_STYLES.body,
              fontSize: SIZES.fontSize.small - 4,
              color: theme.muted,
              marginTop: 8,
              textAlign: 'center',
            }}
          >
            {block.caption}
          </p>
        )}
      </div>
    );
  }

  return null;
};

