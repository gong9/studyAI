/**
 * PPT 讲解 SSE 流式 API
 * 用于实时显示演讲稿生成进度
 */

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { 
  generateFullLectureScript,
  parseSlideElements,
  ProgressCallback
} from '@/lib/teaching/lecture/lecture-agent';
import type { SlideInfo, LectureAction } from '@/lib/teaching/lecture/types';

// 使用全局共享的讲解状态（与主 route 共享）
const globalForLecture = globalThis as unknown as {
  lectureStates: Map<string, {
    slides: SlideInfo[];
    script: { index: number; actions: LectureAction[] }[];
    currentSlideIndex: number;
    currentActionIndex: number;
    isReady: boolean;
  }>;
};

const lectureStates = globalForLecture.lectureStates || new Map();
if (!globalForLecture.lectureStates) {
  globalForLecture.lectureStates = lectureStates;
}

// 解析幻灯片
function parseSlides(content: string): SlideInfo[] {
  let parts = content.split(/\n---\n/);
  
  if (parts[0].trim().startsWith('---') || parts[0].includes('theme:')) {
    parts = parts.slice(1);
  }

  return parts
    .map(p => p.trim())
    .filter(p => p.length > 0)
    .map((content, index) => {
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1] : `第 ${index + 1} 页`;
      const elements = parseSlideElements(content, index);
      
      return { 
        index, 
        content, 
        title,
        elements,
      };
    });
}

// GET: SSE 流式初始化讲解，实时返回进度
export async function GET(
  request: NextRequest,
  { params }: { params: { manuscriptId: string } }
) {
  const { manuscriptId } = params;
  const startSlide = parseInt(request.nextUrl.searchParams.get('startSlide') || '0');

  // 创建 SSE 响应
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      // 发送 SSE 消息的辅助函数
      const sendEvent = (event: string, data: any) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // 发送开始事件
        sendEvent('progress', { stage: 'init', message: '正在获取课件内容...', percent: 5 });

        // 获取稿件内容
        const manuscript = await prisma.teachingManuscript.findUnique({
          where: { id: manuscriptId },
          select: {
            id: true,
            slidevMd: true,
            enrichedContent: true,
            confirmedContent: true,
            draftContent: true,
          },
        });

        if (!manuscript) {
          sendEvent('error', { message: '稿件不存在' });
          controller.close();
          return;
        }

        const content = manuscript.slidevMd || 
                        manuscript.enrichedContent || 
                        manuscript.confirmedContent || 
                        manuscript.draftContent;

        if (!content) {
          sendEvent('error', { message: '没有可讲解的内容' });
          controller.close();
          return;
        }

        const slides = parseSlides(content);
        
        if (slides.length === 0) {
          sendEvent('error', { message: '没有幻灯片' });
          controller.close();
          return;
        }

        sendEvent('progress', { stage: 'parsed', message: `已解析 ${slides.length} 页幻灯片`, percent: 15 });

        console.log(`[Lecture SSE] 初始化讲解: ${manuscriptId}, ${slides.length} 页`);

        // 进度回调
        const onProgress: ProgressCallback = (progress) => {
          sendEvent('progress', progress);
        };

        // 生成完整演讲稿（带进度回调）
        const scriptResult = await generateFullLectureScript(slides, onProgress);
        
        // 初始化讲解状态
        lectureStates.set(manuscriptId, {
          slides,
          script: scriptResult.slides,
          currentSlideIndex: startSlide,
          currentActionIndex: 0,
          isReady: true,
        });

        const totalActions = scriptResult.slides.reduce((sum, s) => sum + s.actions.length, 0);
        console.log(`[Lecture SSE] 演讲稿就绪: ${scriptResult.slides.length} 页, ${totalActions} 条指令`);

        // 提取所有 speak 文本，用于前端预加载 TTS
        const speakTexts: string[] = [];
        for (const slide of scriptResult.slides) {
          for (const action of slide.actions) {
            if (action.action === 'speak' && action.text) {
              speakTexts.push(action.text);
            }
          }
        }
        console.log(`[Lecture SSE] 提取 ${speakTexts.length} 条语音文本`);

        // 发送完成事件（包含 speak 文本列表）
        sendEvent('complete', {
          success: true,
          manuscriptId,
          totalSlides: slides.length,
          totalActions,
          startSlide,
          speakTexts, // 返回所有 speak 文本，用于 TTS 预加载
          message: '演讲稿已生成',
        });

      } catch (error: any) {
        console.error('[Lecture SSE] Error:', error);
        sendEvent('error', { message: error.message || '生成演讲稿失败' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

