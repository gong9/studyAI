/**
 * POST /api/teaching/manuscript/[id]/enrich
 * 
 * 阶段5：润色手稿内容
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { enrichManuscript } from '@/lib/teaching/agents/enrich-agent';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // 解析请求体，获取 force 参数
    let force = false;
    try {
      const body = await request.json();
      force = body.force === true;
    } catch {
      // 没有请求体，忽略
    }

    const manuscript = await prisma.teachingManuscript.findUnique({
      where: { id },
    });

    if (!manuscript) {
      return NextResponse.json(
        { error: '手稿不存在' },
        { status: 404 }
      );
    }

    // 允许的状态：draft, confirmed, reviewing；如果 force=true 则也允许 completed, enriching
    const allowedStatuses = force 
      ? ['draft', 'confirmed', 'reviewing', 'completed', 'enriching']
      : ['draft', 'confirmed', 'reviewing'];
    
    if (!allowedStatuses.includes(manuscript.status)) {
      return NextResponse.json(
        { error: '手稿状态不正确' },
        { status: 400 }
      );
    }

    // 获取要润色的内容：优先 confirmedContent，其次 draftContent，最后 enrichedContent
    const contentToEnrich = manuscript.confirmedContent || manuscript.draftContent || manuscript.enrichedContent;
    
    if (!contentToEnrich) {
      return NextResponse.json(
        { error: '没有可润色的内容' },
        { status: 400 }
      );
    }


    // 更新状态
    await prisma.teachingManuscript.update({
      where: { id },
      data: { status: 'enriching' },
    });

    // 解析审核意见
    let reviewComments: string[] = [];
    if (manuscript.reviewComments) {
      try {
        const parsed = JSON.parse(manuscript.reviewComments);
        // 支持新格式（对象）和旧格式（数组）
        if (Array.isArray(parsed)) {
          reviewComments = parsed;
        } else if (parsed.suggestions) {
          // 新格式：从 suggestions 提取建议
          reviewComments = parsed.suggestions.map((s: any) => `[${s.type}] ${s.issue}: ${s.suggestion}`);
        }
      } catch (e) {
        // ignore
      }
    }

    // 执行润色
    const result = await enrichManuscript({
      confirmedContent: contentToEnrich,
      reviewComments,
    });

    if (!result.success || !result.enrichedContent) {
      // 润色失败，恢复状态
      await prisma.teachingManuscript.update({
        where: { id },
        data: { status: 'confirmed' },
      });
      return NextResponse.json(
        { error: result.error || '润色失败' },
        { status: 500 }
      );
    }


    // 保存润色结果
    await prisma.teachingManuscript.update({
      where: { id },
      data: {
        enrichedContent: result.enrichedContent,
        status: 'completed',  // 润色完成后状态为 completed
      },
    });


    return NextResponse.json({
      success: true,
      manuscriptId: id,
      enrichedContent: result.enrichedContent,
    });

  } catch (error: any) {
    console.error('[API] Error enriching manuscript:', error);
    return NextResponse.json(
      { error: error.message || '服务器错误' },
      { status: 500 }
    );
  }
}
