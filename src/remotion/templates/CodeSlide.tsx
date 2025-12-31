/**
 * 代码展示模板
 * 
 * 用于展示代码片段
 */

import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import type { SlideData, CodeBlock } from '@/lib/teaching/remotion/types';
import { useSlideUp, useFadeIn } from '../utils/animations';
import { THEME_COLORS, getBackgroundStyle, FONT_STYLES, SIZES } from '../utils/styles';

interface CodeSlideProps {
  slide: SlideData;
  index: number;
}

export const CodeSlide: React.FC<CodeSlideProps> = ({ slide }) => {
  const theme = THEME_COLORS[slide.style];
  const backgroundStyle = getBackgroundStyle(slide.style, slide.background);
  const frame = useCurrentFrame();

  // 动画
  const titleAnim = useSlideUp(0, 30);
  const codeAnim = useFadeIn(15, 25);

  const codeBlocks = slide.codeBlocks || [];

  // 代码高亮配色（深色主题）
  const codeTheme = {
    background: '#1e1e2e',
    text: '#cdd6f4',
    keyword: '#cba6f7',
    string: '#a6e3a1',
    comment: '#6c7086',
    function: '#89b4fa',
    number: '#fab387',
    operator: '#89dceb',
    lineNumber: '#6c7086',
  };

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

      {/* 代码区域 */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
          opacity: codeAnim.opacity,
        }}
      >
        {codeBlocks.map((block, blockIndex) => (
          <CodeBlockRenderer
            key={blockIndex}
            block={block}
            codeTheme={codeTheme}
            frame={frame}
            delay={blockIndex * 10}
          />
        ))}

        {/* 如果没有 codeBlocks，尝试从 content 中提取 */}
        {codeBlocks.length === 0 &&
          slide.content?.map((block, i) => {
            if (block.type === 'code') {
              return (
                <CodeBlockRenderer
                  key={i}
                  block={block}
                  codeTheme={codeTheme}
                  frame={frame}
                  delay={i * 10}
                />
              );
            }
            return null;
          })}
      </div>
    </AbsoluteFill>
  );
};

// 代码块渲染器
interface CodeBlockRendererProps {
  block: CodeBlock;
  codeTheme: {
    background: string;
    text: string;
    keyword: string;
    string: string;
    comment: string;
    function: string;
    number: string;
    operator: string;
    lineNumber: string;
  };
  frame: number;
  delay: number;
}

const CodeBlockRenderer: React.FC<CodeBlockRendererProps> = ({
  block,
  codeTheme,
  frame,
  delay,
}) => {
  const lines = block.code.split('\n');
  
  // 逐行显示动画
  const visibleLines = Math.min(
    lines.length,
    Math.max(0, Math.floor((frame - delay - 20) / 2))
  );

  return (
    <div
      style={{
        backgroundColor: codeTheme.background,
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
      }}
    >
      {/* 窗口标题栏 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 20px',
          backgroundColor: 'rgba(0,0,0,0.3)',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#ff5f57' }} />
        <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#febc2e' }} />
        <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#28c840' }} />
        <span
          style={{
            marginLeft: 12,
            ...FONT_STYLES.code,
            fontSize: 14,
            color: codeTheme.lineNumber,
          }}
        >
          {block.language || 'code'}
        </span>
      </div>

      {/* 代码内容 */}
      <div
        style={{
          padding: 24,
          overflowX: 'auto',
        }}
      >
        <pre
          style={{
            margin: 0,
            ...FONT_STYLES.code,
            fontSize: SIZES.fontSize.code,
            lineHeight: 1.6,
          }}
        >
          {lines.slice(0, visibleLines).map((line, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: 24,
              }}
            >
              <span
                style={{
                  color: codeTheme.lineNumber,
                  minWidth: 32,
                  textAlign: 'right',
                  userSelect: 'none',
                }}
              >
                {i + 1}
              </span>
              <span style={{ color: codeTheme.text }}>{line || ' '}</span>
            </div>
          ))}
          {/* 光标闪烁效果 */}
          {visibleLines < lines.length && (
            <div
              style={{
                display: 'flex',
                gap: 24,
              }}
            >
              <span
                style={{
                  color: codeTheme.lineNumber,
                  minWidth: 32,
                  textAlign: 'right',
                }}
              >
                {visibleLines + 1}
              </span>
              <span
                style={{
                  width: 2,
                  height: 24,
                  backgroundColor: codeTheme.text,
                  opacity: frame % 30 < 15 ? 1 : 0,
                }}
              />
            </div>
          )}
        </pre>
      </div>
    </div>
  );
};

