/**
 * POST /api/teaching/manuscript/[id]/review-enrich
 * 
 * 手稿审阅 + 智能润色（一键完成）
 * 使用 Python DeepAgents 服务进行审阅和润色
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { reviewManuscript } from '@/lib/teaching/agents/manuscript-reviewer';
import { smartEnrichManuscript } from '@/lib/teaching/agents/smart-enrich-agent';
import { callPythonEnrichAPI } from '@/lib/teaching/python-agent-client';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // 解析请求体
    let force = false;
    try {
      const body = await request.json();
      force = body.force === true;
    } catch {
      // 没有请求体，忽略
    }

    // 获取手稿
    const manuscript = await prisma.teachingManuscript.findUnique({
      where: { id },
      include: {
        chapter: {
          select: {
            title: true,
            metadata: true,
          },
        },
        knowledgeBase: {
          select: {
            id: true,
            type: true,
            sourceMode: true,
          },
        },
      },
    });

    if (!manuscript) {
      return NextResponse.json(
        { error: '手稿不存在' },
        { status: 404 }
      );
    }

    // 检查状态：draft 或之后的状态都可以
    const allowedStatuses = ['draft', 'confirmed', 'reviewing', 'enriching', 'completed'];
    
    if (!allowedStatuses.includes(manuscript.status)) {
      return NextResponse.json(
        { error: '手稿状态不正确' },
        { status: 400 }
      );
    }

    // 获取要审阅的内容（优先使用草稿内容）
    const contentToReview = manuscript.draftContent || manuscript.confirmedContent;
    if (!contentToReview) {
      return NextResponse.json(
        { error: '没有可审阅的内容' },
        { status: 400 }
      );
    }


    // 更新状态为审阅中
    await prisma.teachingManuscript.update({
      where: { id },
      data: { status: 'reviewing' },
    });

    // 确定内容类型
    const sourceMode = manuscript.knowledgeBase?.sourceMode;
    const kbType = manuscript.knowledgeBase?.type;
    let contentType: 'paper' | 'tech' | 'policy' | 'legal' = 'tech';
    if (sourceMode === 'paper') {
      contentType = 'paper';
    } else if (kbType === 'policy') {
      contentType = 'policy';
    } else if (kbType === 'legal') {
      contentType = 'legal';
    }

    // ========== 使用 Python DeepAgents 进行审阅润色 ==========
    console.log('[API] Using Python DeepAgents service for review-enrich');
    
    // 解析教学规划
    let plan = {};
    if (manuscript.teachingPlan) {
      try {
        plan = JSON.parse(manuscript.teachingPlan);
      } catch {
        // ignore
      }
    }
    
    try {
      const pythonResult = await callPythonEnrichAPI({
        knowledge_base_id: manuscript.knowledgeBaseId,
        draft_content: contentToReview,
        plan,
      });
      
      if (pythonResult.success && pythonResult.enriched_content) {
        // Python Agent 成功，保存结果
        await prisma.teachingManuscript.update({
          where: { id },
          data: {
            reviewComments: JSON.stringify({
              suggestions: pythonResult.review_notes || [],
              reviewedAt: new Date().toISOString(),
              source: 'python-deepagents',
            }),
            enrichedContent: pythonResult.enriched_content,
            status: 'completed',
          },
        });
        
        return NextResponse.json({
          success: true,
          manuscriptId: id,
          review: {
            suggestionsCount: (pythonResult.review_notes || []).length,
          },
          enrich: {
            contentLength: pythonResult.enriched_content.length,
          },
          enrichedContent: pythonResult.enriched_content,
        });
      }
      
      // Python Agent 返回失败，回退到 TypeScript
      console.warn('[API] Python DeepAgents failed, falling back to TypeScript:', pythonResult.error);
    } catch (pythonError: any) {
      console.warn('[API] Python DeepAgents call failed, falling back to TypeScript:', pythonError.message);
    }

    // ========== 回退：使用 TypeScript 实现 ==========
    
    const reviewResult = await reviewManuscript({
      manuscriptContent: contentToReview,
      chapterTitle: manuscript.chapter.title,
      contentType,
    });

    if (!reviewResult.success) {
      await prisma.teachingManuscript.update({
        where: { id },
        data: { status: 'confirmed' },
      });
      return NextResponse.json(
        { error: reviewResult.error || '审阅失败' },
        { status: 500 }
      );
    }


    // 保存审阅结果
    await prisma.teachingManuscript.update({
      where: { id },
      data: {
        reviewComments: JSON.stringify({
          score: reviewResult.score,
          overallAssessment: reviewResult.overallAssessment,
          suggestions: reviewResult.suggestions,
          supplementKeywords: reviewResult.supplementKeywords,
          reviewedAt: new Date().toISOString(),
        }),
        status: 'enriching',
      },
    });

    // ========== 阶段2：智能润色 ==========
    
    const enrichResult = await smartEnrichManuscript({
      manuscriptContent: contentToReview,
      reviewSuggestions: reviewResult.suggestions,
      supplementKeywords: reviewResult.supplementKeywords,
      knowledgeBaseId: manuscript.knowledgeBaseId,
      chapterTitle: manuscript.chapter.title,
    });

    if (!enrichResult.success || !enrichResult.enrichedContent) {
      await prisma.teachingManuscript.update({
        where: { id },
        data: { status: 'confirmed' },
      });
      return NextResponse.json(
        { error: enrichResult.error || '润色失败' },
        { status: 500 }
      );
    }


    // 保存润色结果
    await prisma.teachingManuscript.update({
      where: { id },
      data: {
        enrichedContent: enrichResult.enrichedContent,
        status: 'completed',
      },
    });


    return NextResponse.json({
      success: true,
      manuscriptId: id,
      review: {
        score: reviewResult.score,
        overallAssessment: reviewResult.overallAssessment,
        suggestionsCount: reviewResult.suggestions.length,
      },
      enrich: {
        contentLength: enrichResult.enrichedContent.length,
        appliedSuggestions: enrichResult.appliedSuggestions,
        hasSupplementContent: !!enrichResult.supplementedContent,
      },
      enrichedContent: enrichResult.enrichedContent,
    });

  } catch (error: any) {
    console.error('[API] Error in review-enrich:', error);
    return NextResponse.json(
      { error: error.message || '服务器错误' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/teaching/manuscript/[id]/review-enrich
 * 
 * 获取审阅结果（如果已审阅）
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const manuscript = await prisma.teachingManuscript.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        reviewComments: true,
        enrichedContent: true,
      },
    });

    if (!manuscript) {
      return NextResponse.json(
        { error: '手稿不存在' },
        { status: 404 }
      );
    }

    let reviewData = null;
    if (manuscript.reviewComments) {
      try {
        reviewData = JSON.parse(manuscript.reviewComments);
      } catch {
        // ignore
      }
    }

    return NextResponse.json({
      manuscriptId: id,
      status: manuscript.status,
      hasReview: !!reviewData,
      review: reviewData,
      hasEnrichedContent: !!manuscript.enrichedContent,
    });

  } catch (error: any) {
    console.error('[API] Error getting review:', error);
    return NextResponse.json(
      { error: error.message || '服务器错误' },
      { status: 500 }
    );
  }
}

