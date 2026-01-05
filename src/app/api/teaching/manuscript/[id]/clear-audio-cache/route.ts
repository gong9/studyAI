/**
 * POST /api/teaching/manuscript/[id]/clear-audio-cache
 * 
 * 只清除讲解稿和音频缓存，保留PPT课件不变
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: manuscriptId } = await params;

    if (!manuscriptId) {
      return NextResponse.json(
        { error: '缺少 manuscriptId 参数' },
        { status: 400 }
      );
    }

    // 只清除讲解稿和音频缓存，保留 htmlSlides、enrichedContent 等PPT相关内容
    await prisma.teachingManuscript.update({
      where: { id: manuscriptId },
      data: {
        lectureScript: null,  // 清除讲解稿（TTS 脚本）
        cachedAudio: null,    // 清除音频缓存
        // 不清除 enrichedContent、htmlSlides、slidevMd
        // 不改变 status
      },
    });

    console.log(`[API] Audio cache cleared for manuscript: ${manuscriptId}`);

    return NextResponse.json({
      success: true,
      message: '音频缓存已清除',
    });

  } catch (error: any) {
    console.error('[API] Error clearing audio cache:', error);
    return NextResponse.json(
      { error: error.message || '清除缓存失败' },
      { status: 500 }
    );
  }
}

