/**
 * 幻灯片渲染器
 * 
 * 根据 SlideData 的 type 字段选择对应的模板组件进行渲染
 */

import React from 'react';
import type { SlideData } from '@/lib/teaching/remotion/types';
import { TitleSlide } from './TitleSlide';
import { ContentSlide } from './ContentSlide';
import { TwoColumnSlide } from './TwoColumnSlide';
import { QuoteSlide } from './QuoteSlide';
import { CodeSlide } from './CodeSlide';

interface SlideRendererProps {
  slide: SlideData;
  index: number;
}

export const SlideRenderer: React.FC<SlideRendererProps> = ({ slide, index }) => {
  switch (slide.type) {
    case 'title':
      return <TitleSlide slide={slide} index={index} />;
    case 'content':
      return <ContentSlide slide={slide} index={index} />;
    case 'twoColumn':
      return <TwoColumnSlide slide={slide} index={index} />;
    case 'quote':
      return <QuoteSlide slide={slide} index={index} />;
    case 'code':
      return <CodeSlide slide={slide} index={index} />;
    case 'imageText':
      // imageText 使用 TwoColumnSlide 的变体
      return <TwoColumnSlide slide={slide} index={index} />;
    default:
      // 默认使用内容页模板
      return <ContentSlide slide={slide} index={index} />;
  }
};

