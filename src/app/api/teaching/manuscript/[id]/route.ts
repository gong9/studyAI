/**
 * GET/PUT /api/teaching/manuscript/[id]
 * 
 * GET: 获取手稿详情
 * PUT: 保存用户编辑
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const manuscript = await prisma.teachingManuscript.findUnique({
      where: { id },
      include: {
        chapter: true,
        knowledgeBase: true,
      },
    });

    if (!manuscript) {
      return NextResponse.json(
        { error: '手稿不存在' },
        { status: 404 }
      );
    }

    // 解析 JSON 字段
    let teachingPlan = null;
    let reviewComments = null;
    try {
      if (manuscript.teachingPlan) {
        teachingPlan = JSON.parse(manuscript.teachingPlan);
      }
      if (manuscript.reviewComments) {
        reviewComments = JSON.parse(manuscript.reviewComments);
      }
    } catch (e) {
      // ignore
    }

    return NextResponse.json({
      id: manuscript.id,
      status: manuscript.status,
      chapter: {
        id: manuscript.chapter.id,
        title: manuscript.chapter.title,
        level: manuscript.chapter.level,
        metadata: manuscript.chapter.metadata ? JSON.parse(manuscript.chapter.metadata) : null,
      },
      knowledgeBase: {
        id: manuscript.knowledgeBase.id,
        name: manuscript.knowledgeBase.name,
        type: manuscript.knowledgeBase.type,
        isPreset: manuscript.knowledgeBase.isPreset,
      },
      teachingPlan,
      draftContent: manuscript.draftContent,
      confirmedContent: manuscript.confirmedContent,
      reviewComments,
      enrichedContent: manuscript.enrichedContent,
      slidevMd: manuscript.slidevMd,
      exportedPdf: manuscript.exportedPdf,
      exportedPptx: manuscript.exportedPptx,
      htmlSlides: (manuscript as any).htmlSlides,          // HTML 幻灯片数据
      lectureScript: (manuscript as any).lectureScript,   // 讲解指令脚本
      createdAt: manuscript.createdAt,
      updatedAt: manuscript.updatedAt,
    });

  } catch (error: any) {
    console.error('[API] Error fetching manuscript:', error);
    return NextResponse.json(
      { error: error.message || '服务器错误' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { content } = body;

    if (content === undefined) {
      return NextResponse.json(
        { error: '缺少 content 参数' },
        { status: 400 }
      );
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

    // 如果已确认，不允许直接修改 draftContent，需要先解锁
    if (manuscript.status === 'confirmed') {
      return NextResponse.json(
        { error: '手稿已确认，如需修改请先解锁' },
        { status: 400 }
      );
    }

    // 更新内容，同时更新状态为 user_editing
    await prisma.teachingManuscript.update({
      where: { id },
      data: {
        draftContent: content,
        status: 'user_editing',
      },
    });


    return NextResponse.json({
      success: true,
      manuscriptId: id,
      status: 'user_editing',
    });

  } catch (error: any) {
    console.error('[API] Error updating manuscript:', error);
    return NextResponse.json(
      { error: error.message || '服务器错误' },
      { status: 500 }
    );
  }
}

