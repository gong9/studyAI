/**
 * POST /api/teaching/manuscript/[id]/confirm
 * 
 * 阶段3：用户确认手稿
 * 将 draftContent 复制到 confirmedContent，状态变为 confirmed
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const manuscript = await prisma.teachingManuscript.findUnique({
      where: { id },
    });

    if (!manuscript) {
      return NextResponse.json(
        { error: '手稿不存在' },
        { status: 404 }
      );
    }

    if (!manuscript.draftContent) {
      return NextResponse.json(
        { error: '没有可确认的内容' },
        { status: 400 }
      );
    }

    // 确认手稿：复制 draftContent 到 confirmedContent
    await prisma.teachingManuscript.update({
      where: { id },
      data: {
        confirmedContent: manuscript.draftContent,
        status: 'confirmed',
      },
    });


    return NextResponse.json({
      success: true,
      manuscriptId: id,
      status: 'confirmed',
    });

  } catch (error: any) {
    console.error('[API] Error confirming manuscript:', error);
    return NextResponse.json(
      { error: error.message || '服务器错误' },
      { status: 500 }
    );
  }
}

