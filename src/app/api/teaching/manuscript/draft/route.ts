/**
 * POST /api/teaching/manuscript/draft
 * 
 * 阶段2：生成教学手稿初稿
 * 输入：manuscriptId
 * 输出：更新 TeachingManuscript 的 draftContent
 * 
 * 优化：
 * - 传入章节重点（keyPoints）和摘要（summary）
 * - 使用 RAG 检索教材内容
 * - 根据知识库类型自动推断场景类型
 * - 递归合并子章节内容，覆盖更多知识点
 * - 支持 Python deepagents 服务（通过 USE_DEEPAGENTS 环境变量控制）
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateManuscript } from '@/lib/teaching/agents/manuscript-generator';
import type { TeachingPlan, SceneType } from '@/lib/teaching/agents/teaching-planner';
import type { KeyPoint } from '@/lib/teaching/agents/chapter-analyzer';
import { getMergedChapterContent } from '@/lib/teaching/utils/chapter-content-merger';
import { isDeepAgentsEnabled, callPythonDraftAPI } from '@/lib/teaching/python-agent-client';

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
    const { manuscriptId } = body;

    if (!manuscriptId) {
      return NextResponse.json(
        { error: '缺少 manuscriptId 参数' },
        { status: 400 }
      );
    }

    // 获取手稿记录（包含章节信息和知识库类型）
    const manuscript = await prisma.teachingManuscript.findUnique({
      where: { id: manuscriptId },
      include: {
        chapter: true,
        knowledgeBase: {
          select: { type: true },
        },
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

    // 根据知识库类型推断并强制设置场景类型（修复 sceneType 丢失问题）
    const inferredSceneType = getSceneTypeFromKbType(manuscript.knowledgeBase.type);
    if (!plan.sceneType || plan.sceneType !== inferredSceneType) {
      plan.sceneType = inferredSceneType;
    }

    // 解析章节重点（如果已分析）
    let keyPoints: KeyPoint[] = [];
    if (manuscript.chapter.keyPoints) {
      try {
        keyPoints = JSON.parse(manuscript.chapter.keyPoints);
      } catch (e) {
        console.warn('[API] Failed to parse keyPoints:', e);
      }
    }

    const chapterSummary = manuscript.chapter.summary || undefined;


    // 获取合并后的章节内容（包含子章节）
    const mergedResult = await getMergedChapterContent(manuscript.chapterId);
    
    if (!mergedResult.success) {
      console.warn('[API] Failed to merge chapter content:', mergedResult.warning);
      // 回退到原来的逻辑
    }

    if (mergedResult.warning) {
    }

    // 使用合并后的内容（如果成功），否则回退到原内容
    const chapterContent = mergedResult.success && mergedResult.content
      ? mergedResult.content
      : (manuscript.chapter.contentFull || manuscript.chapter.contentPreview || '');

    // 生成手稿
    let result: { success: boolean; markdown: string | null; error?: string };
    
    // 如果启用了 Python deepagents 服务，优先使用
    if (isDeepAgentsEnabled()) {
      console.log('[API] Using Python deepagents service for draft generation');
      const pythonResult = await callPythonDraftAPI({
        knowledge_base_id: manuscript.knowledgeBaseId,
        plan,
        chapter_key_points: keyPoints,
        chapter_summary: chapterSummary,
        chapter_content: chapterContent,
      });
      
      result = {
        success: pythonResult.success,
        markdown: pythonResult.markdown || null,
        error: pythonResult.error,
      };
    } else {
      // 使用原有的 TypeScript 实现（带 RAG 检索）
      result = await generateManuscript({
        plan,
        knowledgeBaseId: manuscript.knowledgeBaseId,
        chapterKeyPoints: keyPoints,
        chapterSummary,
        chapterContent,
      });
    }

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
