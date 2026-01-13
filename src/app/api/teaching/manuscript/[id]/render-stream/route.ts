/**
 * 流式 PPT 渲染 API
 * 
 * 直接代理 Python Agent 的 SSE 流，实时显示 AI 思考过程
 */

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

const PYTHON_SERVICE_URL = process.env.PYTHON_AGENT_URL || 'http://localhost:8000';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: manuscriptId } = await params;

  // 验证手稿存在
  const manuscript = await prisma.teachingManuscript.findUnique({
    where: { id: manuscriptId },
    include: { 
      chapter: true,
      knowledgeBase: { select: { id: true, type: true } }
    },
  });

  if (!manuscript) {
    return new Response(
      JSON.stringify({ error: '手稿不存在' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const content = manuscript.slidevMd || 
                manuscript.enrichedContent || 
                manuscript.confirmedContent ||
                manuscript.draftContent;

  if (!content) {
    return new Response(
      JSON.stringify({ error: '手稿内容为空' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const kbType = manuscript.knowledgeBase?.type || 'tech';

  // 创建 SSE 流
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();

  const sendEvent = async (type: string, data: any) => {
    try {
      const event = `data: ${JSON.stringify({ type, ...data })}\n\n`;
      await writer.write(encoder.encode(event));
    } catch (e) {
      // 连接可能已关闭
    }
  };

  // 异步处理
  (async () => {
    let pythonResult: any = null;
    
    try {
      // 调用 Python SSE 流式端点
      const response = await fetch(`${PYTHON_SERVICE_URL}/api/v1/teaching/render-slides/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slidev_md: content,
          kb_type: kbType,
          enable_decoration: true,
          enable_qa: true,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Python 服务调用失败');
      }

      // 读取 SSE 流并转发
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('无法读取响应流');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        // 解析 SSE 事件
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // 保留不完整的行
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data.trim()) {
              try {
                const event = JSON.parse(data);
                
                // 跳过心跳
                if (event.type === 'heartbeat') continue;
                
                // 保存结果事件（包含完整 slides 数据）
                if (event.type === 'result' && event.data) {
                  pythonResult = event.data;
                  // 不转发 result 事件到前端（太大了）
                  continue;
                }
                
                // 转发其他事件到前端
                await writer.write(encoder.encode(`data: ${data}\n\n`));
              } catch (e) {
                // 解析失败，可能是大数据被截断
                console.warn('SSE 解析失败:', e);
              }
            }
          }
        }
      }

      // 如果有结果，更新数据库
      if (pythonResult && pythonResult.slides) {
        try {
          await prisma.teachingManuscript.update({
            where: { id: manuscriptId },
            data: {
              htmlSlides: JSON.stringify(pythonResult.slides),
              hasSlidev: true,
            },
          });
          console.log(`✅ 数据库更新成功: ${pythonResult.slides.length} slides`);
        } catch (dbError) {
          console.error('数据库更新失败:', dbError);
          await sendEvent('error', {
            message: '数据库更新失败',
            error: String(dbError),
          });
        }
      }

    } catch (error: any) {
      await sendEvent('error', {
        message: 'PPT 生成失败',
        error: error.message,
      });
    } finally {
      try {
        await writer.close();
      } catch (e) {
        // 忽略关闭错误
      }
    }
  })();

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
