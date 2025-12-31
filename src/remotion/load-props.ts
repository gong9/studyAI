/**
 * Remotion Props 加载器
 * 
 * 从 API 加载课程数据供 Remotion 使用
 * 使用方法：pnpm remotion --props="$(node scripts/load-remotion-props.js courseId)"
 */

import type { HtmlSlideVideoProps } from './compositions/HtmlSlideVideo';

const API_BASE = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export async function loadCourseProps(courseId: string): Promise<HtmlSlideVideoProps> {
  const response = await fetch(`${API_BASE}/api/remotion/course/${courseId}`);
  
  if (!response.ok) {
    throw new Error(`Failed to load course: ${response.statusText}`);
  }
  
  const data = await response.json();
  
  return {
    slides: data.slides || [],
    frames: data.frames || [],
    audioData: data.audioData || {},
    totalDuration: data.duration || 60000,
  };
}

// 如果直接运行此脚本
if (typeof process !== 'undefined' && process.argv[2]) {
  const courseId = process.argv[2];
  loadCourseProps(courseId)
    .then(props => {
      console.log(JSON.stringify(props));
    })
    .catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
}

