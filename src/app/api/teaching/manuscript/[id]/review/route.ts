/**
 * POST /api/teaching/manuscript/[id]/review
 * 
 * 阶段4：LLM 审核
 * 对已确认的手稿进行教学逻辑审核
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { reviewManuscript } from '@/lib/teaching/agents/review-agent';

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

    if (manuscript.status !== 'confirmed') {
      return NextResponse.json(
        { error: '请先确认手稿' },
        { status: 400 }
      );
    }

    if (!manuscript.confirmedContent) {
      return NextResponse.json(
        { error: '没有已确认的内容' },
        { status: 400 }
      );
    }

    console.log('[API] Reviewing manuscript:', id);

    // 更新状态
    await prisma.teachingManuscript.update({
      where: { id },
      data: { status: 'reviewing' },
    });

    // 解析教学规划
    let teachingPlan = null;
    if (manuscript.teachingPlan) {
      try {
        teachingPlan = JSON.parse(manuscript.teachingPlan);
      } catch (e) {
        // ignore
      }
    }

    // 执行审核
    const result = await reviewManuscript({
      confirmedContent: manuscript.confirmedContent,
      teachingPlan,
    });

    if (!result.success) {
      // 审核失败，恢复状态
      await prisma.teachingManuscript.update({
        where: { id },
        data: { status: 'confirmed' },
      });
      return NextResponse.json(
        { error: result.error || '审核失败' },
        { status: 500 }
      );
    }

    // 保存审核结果，恢复状态为 confirmed（审核完成后用户可以继续操作）
    await prisma.teachingManuscript.update({
      where: { id },
      data: {
        reviewComments: JSON.stringify(result.comments),
        status: 'confirmed',
      },
    });

    console.log('[API] Review completed, comments:', result.comments.length);

    return NextResponse.json({
      success: true,
      manuscriptId: id,
      comments: result.comments,
    });

  } catch (error: any) {
    console.error('[API] Error reviewing manuscript:', error);
    return NextResponse.json(
      { error: error.message || '服务器错误' },
      { status: 500 }
    );
  }
}

