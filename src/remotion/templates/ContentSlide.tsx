/**
 * 内容页模板
 * 
 * 用于展示列表、要点等内容
 */

import React from 'react';
import { AbsoluteFill } from 'remotion';
import type { SlideData, ContentBlock } from '@/lib/teaching/remotion/types';
import { useSlideUp, useStaggeredItems } from '../utils/animations';
import { THEME_COLORS, getBackgroundStyle, FONT_STYLES, SIZES } from '../utils/styles';

interface ContentSlideProps {
  slide: SlideData;
  index: number;
}

export const ContentSlide: React.FC<ContentSlideProps> = ({ slide }) => {
  const theme = THEME_COLORS[slide.style];
  const backgroundStyle = getBackgroundStyle(slide.style, slide.background);

  // 标题动画
  const titleAnim = useSlideUp(0, 40);

  // 内容列表动画
  const contentBlocks = slide.content || [];
  const staggeredContent = useStaggeredItems(contentBlocks, 10);

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

      {/* 内容区域 */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-start',
          gap: SIZES.spacing.itemGap,
        }}
      >
        {staggeredContent.map(({ item, style }, blockIndex) => (
          <ContentBlockRenderer
            key={blockIndex}
            block={item}
            theme={theme}
            style={style}
          />
        ))}
      </div>

      {/* 页码 */}
      <div
        style={{
          position: 'absolute',
          bottom: 40,
          right: 60,
          ...FONT_STYLES.body,
          fontSize: SIZES.fontSize.small,
          color: theme.muted,
        }}
      >
        {/* 页码由外层组件处理 */}
      </div>
    </AbsoluteFill>
  );
};

// 内容块渲染器
interface ContentBlockRendererProps {
  block: ContentBlock;
  theme: typeof THEME_COLORS.dark;
  style: { opacity: number; transform: string };
}

const ContentBlockRenderer: React.FC<ContentBlockRendererProps> = ({
  block,
  theme,
  style,
}) => {
  if (block.type === 'text') {
    return (
      <p
        style={{
          ...FONT_STYLES.body,
          fontSize: SIZES.fontSize.body,
          color: block.highlight ? theme.accent : theme.text,
          margin: 0,
          lineHeight: 1.6,
          ...style,
        }}
      >
        {block.content}
      </p>
    );
  }

  if (block.type === 'list') {
    return (
      <div style={style}>
        {block.items.map((item, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 16,
              marginBottom: 16,
            }}
          >
            <span
              style={{
                ...FONT_STYLES.body,
                fontSize: SIZES.fontSize.body,
                color: theme.accent,
                fontWeight: 700,
                minWidth: 24,
              }}
            >
              {block.ordered ? `${i + 1}.` : '•'}
            </span>
            <span
              style={{
                ...FONT_STYLES.body,
                fontSize: SIZES.fontSize.body,
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
          ...style,
        }}
      >
        <img
          src={block.src}
          alt={block.alt || ''}
          style={{
            maxWidth: '100%',
            maxHeight: 400,
            objectFit: 'contain',
            borderRadius: 12,
          }}
        />
        {block.caption && (
          <p
            style={{
              ...FONT_STYLES.body,
              fontSize: SIZES.fontSize.small,
              color: theme.muted,
              marginTop: 12,
            }}
          >
            {block.caption}
          </p>
        )}
      </div>
    );
  }

  if (block.type === 'formula') {
    return (
      <div
        style={{
          ...FONT_STYLES.code,
          fontSize: SIZES.fontSize.heading,
          color: theme.accent,
          textAlign: 'center',
          padding: 32,
          backgroundColor: `${theme.border}33`,
          borderRadius: 12,
          ...style,
        }}
      >
        {block.latex}
      </div>
    );
  }

  return null;
};

