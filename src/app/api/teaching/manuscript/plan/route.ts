/**
 * POST /api/teaching/manuscript/plan
 * 
 * 阶段1：生成教学规划
 * 输入：chapterId
 * 输出：创建 TeachingManuscript 记录，返回教学规划
 * 
 * 优化：根据知识库类型自动推断场景类型
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateTeachingPlan, SceneType } from '@/lib/teaching/agents/teaching-planner';

/** 根据知识库类型推断场景类型 */
function getSceneTypeFromKbType(kbType: string): SceneType {
  switch (kbType) {
    case 'tech':
    case 'k12':
    case 'teaching':
      return 'tech_training';
    case 'policy':
      return 'company_training';
    case 'legal':
      return 'legal_training';
    default:
      return 'general';
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { chapterId, sceneType } = body;

    if (!chapterId) {
      return NextResponse.json(
        { error: '缺少 chapterId 参数' },
        { status: 400 }
      );
    }

    // 获取章节信息
    const chapter = await prisma.teachingChapter.findUnique({
      where: { id: chapterId },
      include: {
        knowledgeBase: true,
      },
    });

    if (!chapter) {
      return NextResponse.json(
        { error: '章节不存在' },
        { status: 404 }
      );
    }

    console.log('[API] Generating teaching plan for:', chapter.title);

    // 解析元数据
    let metadata: { grade?: string; subject?: string } = {};
    if (chapter.metadata) {
      try {
        metadata = JSON.parse(chapter.metadata);
      } catch (e) {
        // ignore
      }
    }

    // 根据知识库类型推断场景类型（如果前端未传入）
    const inferredSceneType = getSceneTypeFromKbType(chapter.knowledgeBase.type);
    const finalSceneType = sceneType || inferredSceneType;
    console.log(`[API] Scene type: requested=${sceneType}, inferred=${inferredSceneType}, final=${finalSceneType}`);

    // 生成教学规划
    const result = await generateTeachingPlan({
      chapterTitle: chapter.title,
      chapterContent: chapter.contentFull || chapter.contentPreview || '',
      sceneType: finalSceneType,
      metadata,
    });

    if (!result.success || !result.plan) {
      return NextResponse.json(
        { error: result.error || '教学规划生成失败' },
        { status: 500 }
      );
    }

    // 创建手稿记录
    const manuscript = await prisma.teachingManuscript.create({
      data: {
        knowledgeBaseId: chapter.knowledgeBaseId,
        chapterId: chapter.id,
        teachingPlan: JSON.stringify(result.plan),
        status: 'draft',
      },
    });

    console.log('[API] Manuscript created:', manuscript.id);

    return NextResponse.json({
      success: true,
      manuscriptId: manuscript.id,
      plan: result.plan,
    });

  } catch (error: any) {
    console.error('[API] Error generating teaching plan:', error);
    return NextResponse.json(
      { error: error.message || '服务器错误' },
      { status: 500 }
    );
  }
}

