/**
 * POST /api/teaching/manuscript/[id]/render
 * 
 * 阶段6：课件渲染
 * 
 * 流程：
 * 1. 如果启用 Python Agent，先调用处理手稿（智能分页布局）
 * 2. 使用 Gemini 生成精美 HTML 幻灯片
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateHtmlSlides } from '@/lib/skills/slide-generation';
import { 
  isDeepAgentsEnabled, 
  callPythonProcessManuscriptAPI 
} from '@/lib/teaching/python-agent-client';

// 根据知识库类型获取场景类型
function getSceneTypeFromKbType(kbType: string): string {
  const mapping: Record<string, string> = {
    'k12': 'k12_teaching',
    'tech': 'tech_training',
    'policy': 'company_training',
    'legal': 'legal_training',
  };
  return mapping[kbType] || 'general';
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { skipProcessing = false, user_manuscript = false } = body;

    const manuscript = await prisma.teachingManuscript.findUnique({
      where: { id },
      include: { 
        chapter: true,
        knowledgeBase: {
          select: { id: true, type: true }
        }
      },
    });

    if (!manuscript) {
      return NextResponse.json(
        { error: '手稿不存在' },
        { status: 404 }
      );
    }

    // 使用润色后内容，或回退到确认内容/草稿内容
    let content = manuscript.slidevMd || 
                  manuscript.enrichedContent || 
                  manuscript.confirmedContent ||
                  manuscript.draftContent;
    
    if (!content) {
      return NextResponse.json(
        { error: '没有可渲染的内容' },
        { status: 400 }
      );
    }

    const kbType = manuscript.knowledgeBase?.type || 'tech';
    let processedByAgent = false;
    let processStats = null;
    let traceId: string | null = null;

    // 检查是否为用户手稿（从 teachingPlan 中的 source 标记判断）
    let isUserManuscript = user_manuscript;
    if (!isUserManuscript && manuscript.teachingPlan) {
      try {
        const plan = typeof manuscript.teachingPlan === 'string' 
          ? JSON.parse(manuscript.teachingPlan) 
          : manuscript.teachingPlan;
        isUserManuscript = plan?.source === 'blank' || plan?.source === 'user_manuscript';
      } catch {}
    }

    // Step 1: 如果启用 Python Agent，先处理手稿（智能分页布局）
    // 对于用户手稿，强制使用 Python Agent 进行智能布局
    const shouldProcess = !skipProcessing && isDeepAgentsEnabled() && (isUserManuscript || !manuscript.slidevMd);
    if (shouldProcess) {
      console.log(`[API] Processing ${isUserManuscript ? 'user manuscript' : 'AI manuscript'} with Python Agent...`);
      
      const sceneType = getSceneTypeFromKbType(kbType);
      
      try {
        const processResult = await callPythonProcessManuscriptAPI({
          knowledge_base_id: manuscript.knowledgeBase?.id || '',
          manuscript_content: content,
          scene_type: sceneType,
        });

        if (processResult.success && processResult.processed_content) {
          content = processResult.processed_content;
          processedByAgent = true;
          processStats = processResult.stats;
          traceId = processResult.trace_id || null;
          
          // 保存处理后的内容
          await prisma.teachingManuscript.update({
            where: { id },
            data: {
              slidevMd: content,
            },
          });
          
          console.log('[API] Manuscript processed:', processStats, 'trace_id:', traceId);
        } else if (processResult.error) {
          console.warn('[API] Python Agent processing failed, using original content:', processResult.error);
        }
      } catch (processError: any) {
        console.warn('[API] Python Agent call failed, using original content:', processError.message);
      }
    }

    // Step 2: 使用 Gemini 生成精美 HTML 幻灯片
    let htmlSlidesData = null;
    let slideCount = 0;
    try {
      const slideResult = await generateHtmlSlides({
        slidevMd: content,
        knowledgeBaseType: kbType,
      });
      htmlSlidesData = JSON.stringify(slideResult.slides);
      slideCount = slideResult.totalCount;
    } catch (slideError: any) {
      console.error('[API] Failed to generate HTML slides:', slideError);
      return NextResponse.json(
        { error: slideError.message || '幻灯片生成失败' },
        { status: 500 }
      );
    }

    // 更新手稿记录
    await prisma.teachingManuscript.update({
      where: { id },
      data: {
        htmlSlides: htmlSlidesData,
        status: 'completed',
      },
    });

    return NextResponse.json({
      success: true,
      manuscriptId: id,
      slideCount,
      htmlSlidesGenerated: !!htmlSlidesData,
      processedByAgent,
      processStats,
      trace_id: traceId,
    });

  } catch (error: any) {
    console.error('[API] Error rendering slides:', error);
    return NextResponse.json(
      { error: error.message || '服务器错误' },
      { status: 500 }
    );
  }
}
