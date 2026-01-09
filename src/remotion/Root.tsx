/**
 * Remotion 入口组件
 * 
 * 数据加载方式：
 * 从 public/remotion-course-data.json 加载（由脚本预先获取）
 * 
 * 使用方法：
 * pnpm remotion:course <courseId>
 */

import React from 'react';
import { Composition, staticFile } from 'remotion';
import { HtmlSlideVideo, type HtmlSlideVideoProps } from './compositions/HtmlSlideVideo';

// 默认的视频配置
const FPS = 60; // 60fps 更流畅
const WIDTH = 1920;
const HEIGHT = 1080;

// 示例幻灯片
const createExampleSlide = (message: string, subMessage?: string) => ({
  index: 0,
  title: 'Remotion Studio',
  html: `
    <div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:linear-gradient(135deg,#0f0f23 0%,#1a1a3e 100%);font-family:Inter,system-ui,sans-serif;">
      <h1 style="font-size:4rem;color:#64ffda;margin-bottom:1rem;">🎬 Remotion Studio</h1>
      <p style="font-size:1.5rem;color:#8892b0;margin-bottom:2rem;">${message}</p>
      ${subMessage ? `<p style="font-size:1rem;color:#64ffda;padding:1rem 2rem;background:rgba(100,255,218,0.1);border:1px solid #64ffda;border-radius:12px;">${subMessage}</p>` : ''}
    </div>
  `,
});

// 默认 props（在没有数据时显示）
const defaultProps: HtmlSlideVideoProps = {
  slides: [createExampleSlide(
    '在这里编辑和预览你的课程视频',
    '💡 使用命令加载课程: pnpm remotion:course [courseId]'
  )],
  frames: [],
  audioData: {},
  totalDuration: 10000,
};

// 从文件加载课程数据
async function loadCourseData(): Promise<{
  props: HtmlSlideVideoProps;
  durationInFrames: number;
}> {
  // 尝试多个路径加载数据
  const paths = [
    staticFile('remotion-course-data.json'),
    '/remotion-course-data.json',
    'http://localhost:3000/remotion-course-data.json',
  ];

  for (const path of paths) {
    try {
      const response = await fetch(path);
      if (!response.ok) continue;
      
      const data = await response.json();
      
      if (data.slides && data.slides.length > 0) {
        const duration = data.duration || data.totalDuration || 10000;
        const durationInFrames = Math.max(FPS * 10, Math.ceil((duration / 1000) * FPS));
        
        
        return {
          props: {
            slides: data.slides,
            frames: data.frames || [],
            audioData: data.audioData || {},
            totalDuration: duration,
            backgroundMusic: data.backgroundMusic || undefined,
          },
          durationInFrames,
        };
      }
    } catch (e) {
    }
  }
  
  return {
    props: defaultProps,
    durationInFrames: FPS * 10,
  };
}

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="HtmlSlideVideo"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        component={HtmlSlideVideo as any}
        durationInFrames={FPS * 10} // 默认值，会被 calculateMetadata 覆盖
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={defaultProps}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        calculateMetadata={async (): Promise<any> => {
          const { props, durationInFrames } = await loadCourseData();
          return {
            props,
            durationInFrames,
          };
        }}
      />
    </>
  );
};
