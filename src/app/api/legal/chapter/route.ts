/**
 * POST /api/legal/chapter
 * 
 * 在预置法律库上创建普法讲座章节并自动生成讲稿
 * 
 * 输入：
 * - presetKbId: 预置法律库 ID
 * - lawName: 选择的法律名称（如"中华人民共和国劳动法"）
 * - topic: 讲座主题
 * - audience: 受众（普通群众/企业员工等）
 * 
 * 输出：
 * - chapterId: 创建的章节 ID
 * - manuscriptId: 创建的讲稿 ID
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateTeachingPlan, SceneType } from '@/lib/teaching/agents/teaching-planner';
import { generateManuscript } from '@/lib/teaching/agents/manuscript-generator';
import { hybridSearch } from '@/lib/hybrid-search';
import { loadIndex } from '@/lib/llm';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const body = await request.json();
    const { presetKbId, lawName, topic, audience } = body;

    if (!presetKbId || !lawName || !topic) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    // 验证预置法律库存在
    const presetKB = await prisma.knowledgeBase.findFirst({
      where: { id: presetKbId, isPreset: true, type: 'legal' },
    });

    if (!presetKB) {
      return NextResponse.json({ error: '预置法律库不存在' }, { status: 404 });
    }

    console.log(`[Legal Chapter] Creating chapter for topic: "${topic}" based on "${lawName}"`);

    // 1. 从预置法律库中检索相关法律条文
    let ragContent = '';
    try {
      const index = await loadIndex(presetKbId);
      const searchQuery = `${lawName} ${topic}`;
      const results = await hybridSearch(index, presetKbId, searchQuery, {
        vectorTopK: 10,
        keywordLimit: 5,
        minVectorScore: 0.3,
      });
      
      ragContent = results.map(r => r.content).join('\n\n---\n\n');
      console.log(`[Legal Chapter] Retrieved ${results.length} chunks, total ${ragContent.length} chars`);
    } catch (searchError) {
      console.error('[Legal Chapter] Search error:', searchError);
      // 继续执行，即使检索失败
    }

    // 2. 获取现有章节数量，计算 orderIndex
    const existingCount = await prisma.teachingChapter.count({
      where: { knowledgeBaseId: presetKbId },
    });

    // 创建章节记录
    const chapter = await prisma.teachingChapter.create({
      data: {
        knowledgeBaseId: presetKbId,
        title: topic,
        level: 1,
        orderIndex: existingCount + 1, // 递增排序
        contentPreview: `基于《${lawName}》的普法讲座，面向${audience || '普通群众'}`,
        contentFull: ragContent || `请根据《${lawName}》的相关规定，讲解关于"${topic}"的法律知识。`,
        metadata: JSON.stringify({
          lawName,
          audience: audience || '普通群众',
          type: 'legal_lecture',
        }),
        analyzed: true,
        summary: `本讲座基于《${lawName}》，面向${audience || '普通群众'}，讲解"${topic}"相关的法律知识。`,
      },
    });

    console.log(`[Legal Chapter] Chapter created: ${chapter.id}`);

    // 3. 生成教学规划
    const planResult = await generateTeachingPlan({
      chapterTitle: topic,
      chapterContent: ragContent || `《${lawName}》相关法律条文`,
      sceneType: 'legal_training' as SceneType,
      metadata: {
        grade: audience || '普通群众',
        subject: lawName,
      },
    });

    if (!planResult.success || !planResult.plan) {
      // 规划失败，但章节已创建，返回章节ID让用户手动操作
      console.error('[Legal Chapter] Plan generation failed:', planResult.error);
      return NextResponse.json({
        success: false,
        error: '教学规划生成失败，请稍后重试',
        chapterId: chapter.id,
      }, { status: 500 });
    }

    console.log(`[Legal Chapter] Plan generated with ${planResult.plan.sections.length} sections`);

    // 4. 创建讲稿记录
    const manuscript = await prisma.teachingManuscript.create({
      data: {
        knowledgeBaseId: presetKbId,
        chapterId: chapter.id,
        teachingPlan: JSON.stringify(planResult.plan),
        status: 'planning',
      },
    });

    console.log(`[Legal Chapter] Manuscript created: ${manuscript.id}`);

    // 5. 生成讲稿初稿
    const draftResult = await generateManuscript({
      plan: planResult.plan,
      knowledgeBaseId: presetKbId,
      chapterSummary: chapter.summary || undefined,
      chapterContent: ragContent,
    });

    if (draftResult.success && draftResult.markdown) {
      // 更新讲稿
      await prisma.teachingManuscript.update({
        where: { id: manuscript.id },
        data: {
          draftContent: draftResult.markdown,
          status: 'draft',
        },
      });
      console.log(`[Legal Chapter] Draft generated, length: ${draftResult.markdown.length}`);
    } else {
      console.warn('[Legal Chapter] Draft generation failed:', draftResult.error);
    }

    return NextResponse.json({
      success: true,
      chapterId: chapter.id,
      manuscriptId: manuscript.id,
      message: '普法讲座创建成功',
    });

  } catch (error: any) {
    console.error('[Legal Chapter] Error:', error);
    return NextResponse.json({ 
      error: '创建失败: ' + error.message 
    }, { status: 500 });
  }
}

