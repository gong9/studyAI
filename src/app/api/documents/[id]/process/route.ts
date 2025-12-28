import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { LLMService } from '@/lib/llm';
import * as path from 'path';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const documentId = params.id;

    // 获取文档信息
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: { knowledgeBase: true },
    });

    if (!document) {
      return NextResponse.json({ error: '文档不存在' }, { status: 404 });
    }

    if (document.knowledgeBase.userId !== userId) {
      return NextResponse.json({ error: '无权访问此文档' }, { status: 403 });
    }

    // 创建 SSE 流
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let isClosed = false;
        
        const sendEvent = (event: string, data: any) => {
          // 检查 controller 是否已关闭
          if (isClosed) return;
          try {
            const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
            controller.enqueue(encoder.encode(message));
          } catch (e) {
            // controller 已关闭，标记并忽略
            isClosed = true;
          }
        };
        
        const safeClose = () => {
          if (isClosed) return;
          isClosed = true;
          try {
            controller.close();
          } catch (e) {
            // 已关闭，忽略
          }
        };

        // 心跳定时器，每 5 秒发送一次心跳，防止连接超时
        let lastProgress = 0;
        const heartbeatInterval = setInterval(() => {
          if (isClosed) {
            clearInterval(heartbeatInterval);
            return;
          }
          sendEvent('heartbeat', { 
            status: 'processing', 
            message: '处理中...',
            progress: lastProgress
          });
        }, 5000);

        try {
          // 更新状态为处理中
          await prisma.document.update({
            where: { id: documentId },
            data: { status: 'processing' },
          });

          sendEvent('status', { 
            status: 'processing', 
            message: '开始处理文档...',
            progress: 10
          });
          lastProgress = 10;

          // 获取上传目录
          const uploadDir = path.join(
            process.env.UPLOAD_DIR || './uploads',
            `kb_${document.knowledgeBaseId}`,
          );

          sendEvent('status', { 
            status: 'processing', 
            message: '正在创建向量索引...',
            progress: 30
          });
          lastProgress = 30;

          // 创建或更新索引（带进度回调）
          await LLMService.createOrUpdateIndex(
            document.knowledgeBaseId,
            uploadDir,
            (progress: number, message: string) => {
              lastProgress = 30 + (progress / 100) * 60;
              sendEvent('status', { 
                status: 'processing', 
                message,
                progress: lastProgress
              });
            }
          );

          sendEvent('status', { 
            status: 'processing', 
            message: '更新文档状态...',
            progress: 95
          });

          // 更新文档状态为完成
          await prisma.document.update({
            where: { id: documentId },
            data: { status: 'completed' },
          });

          // 清除心跳定时器
          clearInterval(heartbeatInterval);

          sendEvent('complete', { 
            status: 'completed', 
            message: '文档处理完成！',
            progress: 100
          });

          safeClose();
        } catch (error: any) {
          console.error('[Process] Error:', error);
          
          // 清除心跳定时器
          clearInterval(heartbeatInterval);
          
          // 更新状态为失败
          try {
            await prisma.document.update({
              where: { id: documentId },
              data: { status: 'failed' },
            });
          } catch (dbError) {
            console.error('[Process] Failed to update status:', dbError);
          }

          sendEvent('error', { 
            status: 'failed', 
            message: error.message || '处理失败',
            progress: 0
          });

          safeClose();
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
  } catch (error) {
    console.error('Process endpoint error:', error);
    return NextResponse.json({ error: '处理失败' }, { status: 500 });
  }
}

