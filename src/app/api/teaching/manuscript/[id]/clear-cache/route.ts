/**
 * POST /api/teaching/manuscript/[id]/clear-cache
 * 
 * 清除讲稿的缓存数据（讲解稿、音频缓存等）
 * 用于重新生成时确保使用最新内容
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

    // 清除讲解稿和音频缓存
    await prisma.teachingManuscript.update({
      where: { id: manuscriptId },
      data: {
        lectureScript: null,  // 清除讲解稿（TTS 脚本）
        cachedAudio: null,    // 清除音频缓存
        enrichedContent: null, // 清除润色内容
        slidevMd: null,       // 清除课件
        status: 'draft',      // 重置状态
      },
    });

    console.log(`[API] Cache cleared for manuscript: ${manuscriptId}`);

    return NextResponse.json({
      success: true,
      message: '缓存已清除',
    });

  } catch (error: any) {
    console.error('[API] Error clearing cache:', error);
    return NextResponse.json(
      { error: error.message || '清除缓存失败' },
      { status: 500 }
    );
  }
}

