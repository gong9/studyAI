/**
 * 流式课程发布 API
 * 
 * 使用 SSE 实时返回课程生成的进度：
 * 1. 生成讲解稿
 * 2. TTS 语音合成
 * 3. 课程发布
 * 
 * 这是对原有 publish API 的流式封装，会调用原有逻辑并实时汇报进度
 */

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: manuscriptId } = await params;

  // 创建 SSE 流
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();

  const sendEvent = async (type: string, data: any) => {
    const event = `data: ${JSON.stringify({ type, ...data })}\n\n`;
    await writer.write(encoder.encode(event));
  };

  // 异步处理
  (async () => {
    try {
      // 验证手稿存在
      const manuscript = await prisma.teachingManuscript.findUnique({
        where: { id: manuscriptId },
        include: { chapter: true },
      });

      if (!manuscript) {
        await sendEvent('error', { message: '手稿不存在' });
        await writer.close();
        return;
      }

      await sendEvent('start', {
        message: '🎬 启动课程生成 Agent',
        manuscriptTitle: manuscript.chapter?.title || manuscriptId,
        phase: 'initialization',
      });

      // 检查是否已有课程
      const existingCourse = await prisma.course.findUnique({
        where: { 
          manuscriptId_language: {
            manuscriptId,
            language: 'zh',
          }
        },
      });

      if (existingCourse) {
        await sendEvent('complete', {
          message: '✅ 课程已存在',
          isExisting: true,
          courseId: existingCourse.id,
          phase: 'completed',
        });
        await writer.close();
        return;
      }

      // 检查讲解稿
      if (!manuscript.lectureScript) {
        await sendEvent('step', {
          message: '正在生成讲解稿...',
          phase: 'lecture_generation',
        });
        
        const lectureRes = await fetch(
          `${request.nextUrl.origin}/api/teaching/lecture/${manuscriptId}`
        );
        
        if (!lectureRes.ok) {
          const err = await lectureRes.json();
          throw new Error(err.error || '生成讲解稿失败');
        }
        
        const lectureData = await lectureRes.json();
        await sendEvent('step', {
          message: `✓ 讲解稿生成完成`,
          details: `${lectureData.totalSlides} 页, ${lectureData.totalActions} 条指令`,
          phase: 'lecture_complete',
        });
      } else {
        await sendEvent('step', {
          message: '✓ 使用已有讲解稿',
          phase: 'lecture_exists',
        });
      }

      // TTS 语音合成阶段
      await sendEvent('executing', {
        message: '🔊 调用 MiniMax TTS 服务批量生成语音...',
        phase: 'tts_generating',
        progress: 30,
      });

      // 调用原有的发布 API
      const publishRes = await fetch(
        `${request.nextUrl.origin}/api/teaching/manuscript/${manuscriptId}/publish`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ force: false }),
        }
      );

      const result = await publishRes.json();

      if (!publishRes.ok || !result.success) {
        throw new Error(result.error || '课程发布失败');
      }

      // 发送完成事件
      const durationMinutes = Math.round((result.duration || 0) / 1000 / 60);
      await sendEvent('complete', {
        message: '✨ 课程发布成功！',
        courseId: result.courseId,
        audioCount: result.audioCount || 0,
        duration: result.duration || 0,
        durationText: `${durationMinutes} 分钟`,
        phase: 'completed',
      });

    } catch (error: any) {
      await sendEvent('error', {
        message: '课程生成失败',
        error: error.message,
      });
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

