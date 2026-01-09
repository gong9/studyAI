/**
 * POST /api/book-understanding/analyze
 * 
 * 全书理解 - 阶段2-4：深度分析
 * 
 * 功能：
 * - 接收选中的章节ID列表
 * - 对选中章节执行知识图谱构建（阶段2）
 * - 精读填充概念详情（阶段3）
 * - 生成讲稿和课程地图（阶段4）
 * 
 * 返回：知识图谱 + 讲稿 + 课程地图
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// 阶段2：知识图谱
import { extractConcepts } from '@/lib/book-understanding/stage2-kg/concept-extractor';
import { buildRelations } from '@/lib/book-understanding/stage2-kg/relation-builder';
import { weightConcepts } from '@/lib/book-understanding/stage2-kg/concept-weighter';

// 阶段3：精读填充
import { enrichConcepts } from '@/lib/book-understanding/stage3-deep-read/concept-enricher';
import { generateSectionContent } from '@/lib/book-understanding/stage3-deep-read/section-generator';

// 阶段4：输出
import { generateManuscript } from '@/lib/book-understanding/stage4-output/manuscript-generator';
import { generateCourseMap } from '@/lib/book-understanding/stage4-output/course-map';

import type { 
  ChapterMeta, 
  BookThesis, 
  KGBuildResult,
  DeepReadResult,
  OutputResult 
} from '@/lib/book-understanding/types';

export const maxDuration = 180; // 3 分钟超时

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const body = await request.json();
    const { knowledgeBaseId, chapterIds } = body;

    if (!knowledgeBaseId) {
      return NextResponse.json({ error: '缺少 knowledgeBaseId' }, { status: 400 });
    }

    if (!chapterIds || !Array.isArray(chapterIds) || chapterIds.length === 0) {
      return NextResponse.json({ error: '请选择至少一个章节' }, { status: 400 });
    }

    // 验证知识库
    const kb = await prisma.knowledgeBase.findFirst({
      where: {
        id: knowledgeBaseId,
        userId: (session.user as any).id,
      },
    });

    if (!kb) {
      return NextResponse.json({ error: '知识库不存在' }, { status: 404 });
    }


    // ========== 获取选中的章节 ==========
    const dbChapters = await prisma.teachingChapter.findMany({
      where: {
        id: { in: chapterIds },
        knowledgeBaseId,
      },
      orderBy: { orderIndex: 'asc' },
    });

    if (dbChapters.length === 0) {
      return NextResponse.json({ error: '未找到选中的章节' }, { status: 404 });
    }

    // 转换为 ChapterMeta 格式
    const chapters: ChapterMeta[] = dbChapters.map(ch => {
      const metadata = ch.metadata ? JSON.parse(ch.metadata as string) : {};
      return {
        id: ch.id,
        title: ch.title,
        level: ch.level,
        role: metadata.role || 'core',
        goal: metadata.goal || ch.summary || '',
        keyConcepts: metadata.keyConcepts || [],
        dependencies: metadata.dependencies || [],
        orderIndex: ch.orderIndex,
        contentPreview: ch.contentPreview || undefined,
        contentFull: ch.contentFull || undefined,
        startPage: metadata.startPage,
        endPage: metadata.endPage,
      };
    });

    // 构建全书主题（从第一个章节的元数据获取）
    const firstMeta = dbChapters[0]?.metadata ? JSON.parse(dbChapters[0].metadata as string) : {};
    const thesis: BookThesis = {
      title: firstMeta.bookTitle || kb.name,
      topic: kb.description || '',
      audience: '通用读者',
      knowledgeType: firstMeta.knowledgeType || 'concept',
      summary: kb.description || '',
      keywords: [],
    };

    // ========== 阶段2：知识图谱构建 ==========
    
    const conceptResult = await extractConcepts({
      thesis,
      chapters,
    });
    if (!conceptResult.success) {
      return NextResponse.json({ error: conceptResult.error || '概念抽取失败' }, { status: 500 });
    }

    const relationResult = await buildRelations({
      thesis,
      chapters,
      concepts: conceptResult.concepts,
    });
    if (!relationResult.success) {
      return NextResponse.json({ error: relationResult.error || '关系构建失败' }, { status: 500 });
    }

    const weightResult = weightConcepts({
      concepts: conceptResult.concepts,
      relations: relationResult.relations,
      chapters,
      bookId: knowledgeBaseId,
    });
    if (!weightResult.success || !weightResult.result) {
      return NextResponse.json({ error: weightResult.error || '概念加权失败' }, { status: 500 });
    }

    const kgResult: KGBuildResult = weightResult.result;

    // ========== 阶段3：精读填充 ==========
    
    const enrichResult = await enrichConcepts({
      knowledgeBaseId,
      graph: kgResult.graph,
      priorityQueue: kgResult.readingPriority,
      maxConcepts: 15,
    });
    if (!enrichResult.success) {
      return NextResponse.json({ error: enrichResult.error || '精读填充失败' }, { status: 500 });
    }

    const sectionResult = await generateSectionContent({
      chapters,
      graph: kgResult.graph,
      enrichedConcepts: enrichResult.enrichedConcepts,
    });
    if (!sectionResult.success || !sectionResult.result) {
      return NextResponse.json({ error: sectionResult.error || '章节内容生成失败' }, { status: 500 });
    }

    const deepReadResult: DeepReadResult = sectionResult.result;

    // ========== 阶段4：输出呈现 ==========
    
    // 构建简化的 DAG（用于课程地图）
    const simpleDAG = {
      nodes: chapters.map(ch => ({
        id: ch.id,
        title: ch.title,
        role: ch.role,
        weight: ch.role === 'core' ? 1 : 0.5,
      })),
      edges: [],
    };

    const manuscriptResult = generateManuscript({
      thesis,
      chapters,
      graph: kgResult.graph,
      deepReadResult,
    });
    if (!manuscriptResult.success || !manuscriptResult.manuscript) {
      return NextResponse.json({ error: manuscriptResult.error || '讲稿生成失败' }, { status: 500 });
    }

    const courseMapResult = generateCourseMap({
      chapters,
      chapterDAG: simpleDAG,
      graph: kgResult.graph,
      includeConcepts: true,
    });

    const outputResult: OutputResult = {
      manuscript: manuscriptResult.manuscript,
      courseMap: courseMapResult.courseMap!,
    };


    // ========== 保存讲稿到数据库 ==========
    // 为每个选中的章节创建/更新讲稿记录
    for (const ch of dbChapters) {
      const existingManuscript = await prisma.teachingManuscript.findFirst({
        where: { chapterId: ch.id },
      });

      const manuscriptData = {
        knowledgeBaseId,
        chapterId: ch.id,
        teachingPlan: JSON.stringify({
          thesis,
          concepts: kgResult.graph.concepts.filter(c => c.chapterId === ch.id),
        }),
        slideContent: outputResult.manuscript.markdown,
        status: 'completed' as const,
      };

      if (existingManuscript) {
        await prisma.teachingManuscript.update({
          where: { id: existingManuscript.id },
          data: manuscriptData,
        });
      } else {
        await prisma.teachingManuscript.create({
          data: manuscriptData,
        });
      }
    }

    return NextResponse.json({
      success: true,
      kgResult: {
        concepts: kgResult.graph.concepts,
        relations: kgResult.graph.relations,
        coreConceptIds: kgResult.coreConceptIds,
      },
      deepReadResult: {
        enrichedConcepts: deepReadResult.enrichedConcepts,
        sectionContents: deepReadResult.sectionContents,
      },
      outputResult: {
        manuscript: outputResult.manuscript,
        courseMap: outputResult.courseMap,
      },
    });

  } catch (error: any) {
    console.error('[Analyze] Error:', error);
    return NextResponse.json(
      { error: error.message || '深度分析失败' },
      { status: 500 }
    );
  }
}

