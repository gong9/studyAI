/**
 * GET /api/legal/manuscripts
 * 
 * 获取预置法律库的最近讲稿列表（用于 Dashboard 显示）
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// 标记为动态路由（使用了 session/headers）
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    // 查找预置法律库
    const presetKB = await prisma.knowledgeBase.findFirst({
      where: { isPreset: true, type: 'legal' },
    });

    if (!presetKB) {
      return NextResponse.json({ manuscripts: [] });
    }

    // 获取最近的讲稿
    const manuscripts = await prisma.teachingManuscript.findMany({
      where: { knowledgeBaseId: presetKB.id },
      include: {
        chapter: {
          select: { title: true, metadata: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return NextResponse.json({
      manuscripts: manuscripts.map(m => ({
        id: m.id,
        title: m.chapter.title,
        metadata: m.chapter.metadata ? JSON.parse(m.chapter.metadata) : {},
        status: m.status,
        createdAt: m.createdAt,
        kbId: presetKB.id,
      })),
    });
  } catch (error: any) {
    console.error('[Legal Manuscripts] Error:', error);
    return NextResponse.json({ error: '获取失败' }, { status: 500 });
  }
}

