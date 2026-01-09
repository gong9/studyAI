/**
 * POST /api/teaching/manuscript/plan
 * 
 * 阶段1：生成教学规划
 * 输入：chapterId
 * 输出：创建 TeachingManuscript 记录，返回教学规划
 * 
 * 优化：
 * - 根据知识库类型自动推断场景类型
 * - 递归合并子章节内容，覆盖更多知识点
 * - 章节过大时给出警告和建议
 * - 支持 Python deepagents 服务（通过 USE_DEEPAGENTS 环境变量控制）
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateTeachingPlan, SceneType } from '@/lib/teaching/agents/teaching-planner';
import { getMergedChapterContent, checkChapterSize } from '@/lib/teaching/utils/chapter-content-merger';
import { isDeepAgentsEnabled, callPythonPlanAPI } from '@/lib/teaching/python-agent-client';

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

    // 获取合并后的章节内容（包含子章节）
    const mergedResult = await getMergedChapterContent(chapterId);
    
    if (!mergedResult.success) {
      return NextResponse.json(
        { error: mergedResult.warning || '获取章节内容失败' },
        { status: 500 }
      );
    }

    if (mergedResult.warning) {
    }

    // 生成教学规划
    let result: { success: boolean; plan: any; error?: string };
    
    // 如果启用了 Python deepagents 服务，优先使用
    if (isDeepAgentsEnabled()) {
      console.log('[API] Using Python deepagents service for plan generation');
      const pythonResult = await callPythonPlanAPI({
        knowledge_base_id: chapter.knowledgeBaseId,
        chapter_title: chapter.title,
        chapter_content: mergedResult.content,
        scene_type: finalSceneType,
      });
      
      result = {
        success: pythonResult.success,
        plan: pythonResult.plan,
        error: pythonResult.error,
      };
    } else {
      // 使用原有的 TypeScript 实现
      result = await generateTeachingPlan({
        chapterTitle: chapter.title,
        chapterContent: mergedResult.content,
        sceneType: finalSceneType,
        metadata,
      });
    }

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


    // 构建响应，包含警告信息
    const response: any = {
      success: true,
      manuscriptId: manuscript.id,
      plan: result.plan,
      // 合并统计信息
      mergeStats: {
        chapterCount: mergedResult.chapterCount,
        totalLength: mergedResult.totalLength,
        truncated: mergedResult.truncated,
        childTitles: mergedResult.childTitles,
      },
    };

    // 如果有警告，添加到响应中
    if (mergedResult.warning) {
      response.warning = mergedResult.warning;
      response.suggestion = mergedResult.suggestion;
    }

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('[API] Error generating teaching plan:', error);
    return NextResponse.json(
      { error: error.message || '服务器错误' },
      { status: 500 }
    );
  }
}

