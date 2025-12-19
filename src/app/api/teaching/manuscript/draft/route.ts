/**
 * POST /api/teaching/manuscript/draft
 * 
 * 阶段2：生成教学手稿初稿
 * 输入：manuscriptId
 * 输出：更新 TeachingManuscript 的 draftContent
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateManuscript } from '@/lib/teaching/agents/manuscript-generator';
import type { TeachingPlan } from '@/lib/teaching/agents/teaching-planner';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { manuscriptId } = body;

    if (!manuscriptId) {
      return NextResponse.json(
        { error: '缺少 manuscriptId 参数' },
        { status: 400 }
      );
    }

    // 获取手稿记录
    const manuscript = await prisma.teachingManuscript.findUnique({
      where: { id: manuscriptId },
      include: {
        chapter: true,
      },
    });

    if (!manuscript) {
      return NextResponse.json(
        { error: '手稿记录不存在' },
        { status: 404 }
      );
    }

    if (!manuscript.teachingPlan) {
      return NextResponse.json(
        { error: '请先生成教学规划' },
        { status: 400 }
      );
    }

    console.log('[API] Generating manuscript draft for:', manuscript.chapter.title);

    // 解析教学规划
    let plan: TeachingPlan;
    try {
      plan = JSON.parse(manuscript.teachingPlan);
    } catch (e) {
      return NextResponse.json(
        { error: '教学规划数据无效' },
        { status: 400 }
      );
    }

    // 生成手稿
    const result = await generateManuscript({
      plan,
      chapterContent: manuscript.chapter.contentFull || manuscript.chapter.contentPreview || '',
    });

    if (!result.success || !result.markdown) {
      return NextResponse.json(
        { error: result.error || '教学手稿生成失败' },
        { status: 500 }
      );
    }

    // 更新手稿记录
    await prisma.teachingManuscript.update({
      where: { id: manuscriptId },
      data: {
        draftContent: result.markdown,
        status: 'draft',
      },
    });

    console.log('[API] Manuscript draft saved, length:', result.markdown.length);

    return NextResponse.json({
      success: true,
      manuscriptId,
      markdown: result.markdown,
    });

  } catch (error: any) {
    console.error('[API] Error generating manuscript draft:', error);
    return NextResponse.json(
      { error: error.message || '服务器错误' },
      { status: 500 }
    );
  }
}

