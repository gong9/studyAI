/**
 * POST /api/remotion/export
 * 触发 FFmpeg 脚本导出视频
 * 
 * 调用 scripts/ffmpeg-render.ts 执行实际渲染
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const body = await request.json();
    const { courseId } = body;

    if (!courseId) {
      return NextResponse.json({ error: '缺少课程 ID' }, { status: 400 });
    }

    // 检查课程数据是否存在
    const dataPath = path.join(process.cwd(), 'public', 'remotion-course-data.json');
    try {
      await fs.access(dataPath);
    } catch {
      return NextResponse.json({ error: '请先在 Remotion Studio 中加载课程' }, { status: 400 });
    }

    // 创建 SSE 流
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendProgress = (percent: number, message: string) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ percent, message })}\n\n`));
        };

        try {
          sendProgress(5, '启动 FFmpeg 渲染脚本...');

          // 调用 ffmpeg 渲染脚本
          const child = spawn('npx', ['tsx', 'scripts/ffmpeg-render.ts'], {
            cwd: process.cwd(),
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env },
          });

          let lastProgress = 5;

          child.stdout?.on('data', (data: Buffer) => {
            const text = data.toString();
            
            // 解析进度
            if (text.includes('截图幻灯片')) {
              sendProgress(15, '截图幻灯片...');
              lastProgress = 15;
            } else if (text.includes('保存音频')) {
              sendProgress(40, '保存音频...');
              lastProgress = 40;
            } else if (text.includes('生成视频片段')) {
              sendProgress(50, '生成视频片段...');
              lastProgress = 50;
            } else if (text.includes('合并视频')) {
              sendProgress(85, '合并视频...');
              lastProgress = 85;
            } else if (text.includes('片段')) {
              // 解析片段进度 "片段 3/11"
              const match = text.match(/片段\s+(\d+)\/(\d+)/);
              if (match) {
                const current = parseInt(match[1]);
                const total = parseInt(match[2]);
                const progress = 50 + Math.floor((current / total) * 35);
                sendProgress(progress, `生成视频片段 ${current}/${total}`);
                lastProgress = progress;
              }
            } else if (text.includes('幻灯片') && text.includes(':')) {
              // 解析幻灯片截图进度
              const match = text.match(/幻灯片\s+(\d+)/);
              if (match) {
                const progress = 15 + Math.floor((parseInt(match[1]) / 11) * 25);
                sendProgress(Math.min(progress, 40), `截图幻灯片 ${match[1]}...`);
              }
            }
          });

          child.stderr?.on('data', (data: Buffer) => {
            console.error('[FFmpeg Script Error]', data.toString());
          });

          await new Promise<void>((resolve, reject) => {
            child.on('close', (code) => {
              if (code === 0) {
                resolve();
              } else {
                reject(new Error(`脚本退出码: ${code}`));
              }
            });
            child.on('error', reject);
          });

          // 检查输出文件
          const outputFile = path.join(process.cwd(), 'out', 'course-ffmpeg.mp4');
          try {
            await fs.access(outputFile);
          } catch {
            throw new Error('视频文件生成失败');
          }

          // 复制到 public 供下载
          const exportId = `export_${Date.now()}`;
          const publicPath = path.join(process.cwd(), 'public', 'exports');
          await fs.mkdir(publicPath, { recursive: true });
          const finalPath = path.join(publicPath, `${exportId}.mp4`);
          await fs.copyFile(outputFile, finalPath);

          sendProgress(100, '导出完成！');
          
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            complete: true,
            downloadUrl: `/exports/${exportId}.mp4`,
          })}\n\n`));

          controller.close();
        } catch (error: any) {
          console.error('Export error:', error);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            error: error.message || '导出失败',
          })}\n\n`));
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
  } catch (error: any) {
    console.error('Export API error:', error);
    return NextResponse.json({ error: error.message || '导出失败' }, { status: 500 });
  }
}
