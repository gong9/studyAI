/**
 * GET /api/teaching/manuscripts/[kbId]
 * 
 * 获取知识库的所有教学手稿记录
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ kbId: string }> }
) {
  try {
    const { kbId } = await params;

    const manuscripts = await prisma.teachingManuscript.findMany({
      where: { knowledgeBaseId: kbId },
      include: {
        chapter: {
          select: {
            id: true,
            title: true,
            level: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // 解析 teachingPlan JSON
    const result = manuscripts.map(m => ({
      id: m.id,
      status: m.status,
      chapterId: m.chapterId,
      chapterTitle: m.chapter?.title || '未知章节',
      teachingPlan: m.teachingPlan ? JSON.parse(m.teachingPlan) : null,
      hasEnriched: !!m.enrichedContent,
      hasSlidev: !!m.slidevMd,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    }));

    return NextResponse.json({ manuscripts: result });
  } catch (error: any) {
    console.error('[API] Error fetching manuscripts:', error);
    return NextResponse.json(
      { error: error.message || '获取手稿列表失败' },
      { status: 500 }
    );
  }
}

