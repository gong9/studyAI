/**
 * POST /api/teaching/manuscript/[id]/render
 * 
 * 阶段6：Slidev 渲染
 * 将润色后的手稿转换为 Slidev 格式
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { preprocessToSlidev } from '@/lib/teaching/slidev/preprocessor';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { title, author } = body;

    const manuscript = await prisma.teachingManuscript.findUnique({
      where: { id },
      include: { chapter: true },
    });

    if (!manuscript) {
      return NextResponse.json(
        { error: '手稿不存在' },
        { status: 404 }
      );
    }

    // 使用润色后内容，或回退到确认内容
    const content = manuscript.enrichedContent || manuscript.confirmedContent;
    
    if (!content) {
      return NextResponse.json(
        { error: '没有可渲染的内容' },
        { status: 400 }
      );
    }

    console.log('[API] Rendering to Slidev:', id);

    // 预处理为 Slidev 格式
    const result = preprocessToSlidev(content, {
      title: title || manuscript.chapter.title,
      author,
    });

    // 更新手稿记录
    await prisma.teachingManuscript.update({
      where: { id },
      data: {
        slidevMd: result.slidevMd,
        status: 'completed',
      },
    });

    console.log('[API] Slidev MD generated, slides:', result.slideCount);

    return NextResponse.json({
      success: true,
      manuscriptId: id,
      slidevMd: result.slidevMd,
      slideCount: result.slideCount,
    });

  } catch (error: any) {
    console.error('[API] Error rendering to Slidev:', error);
    return NextResponse.json(
      { error: error.message || '服务器错误' },
      { status: 500 }
    );
  }
}

