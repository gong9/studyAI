/**
 * POST /api/teaching/manuscript/[id]/render
 * 
 * 阶段6：课件渲染
 * 
 * 流程：
 * 1. 使用 Python SlideDesignerAgent 生成精美 HTML 幻灯片（支持信息图装饰）
 * 
 * 注意：不再有 TypeScript fallback，Python Agent 失败时直接返回错误
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { 
  callPythonRenderSlidesAPI,
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
    const content = manuscript.slidevMd || 
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

    // 使用 Python SlideDesignerAgent 生成 HTML 幻灯片（支持智能分页 + 信息图装饰）
    console.log('[API] Using Python SlideDesignerAgent for rendering...');
    
    const renderResult = await callPythonRenderSlidesAPI({
      slidev_md: content,
      kb_type: kbType,
      enable_decoration: true,
    });

    // Python Agent 失败时直接返回错误
    if (!renderResult.success || !renderResult.slides) {
      console.error('[API] Python SlideDesignerAgent failed:', renderResult.error);
      return NextResponse.json(
        { error: `幻灯片渲染失败: ${renderResult.error || '未知错误'}` },
        { status: 500 }
      );
    }

    const htmlSlidesData = JSON.stringify(renderResult.slides);
    const slideCount = renderResult.total_count || renderResult.slides.length;
    const decoratedCount = renderResult.decorated_count || 0;
    const visualPlan = renderResult.visual_plan;
    const traceId = renderResult.trace_id || null;
    // 使用智能分页后的 Markdown（如果有），否则使用原始内容
    const paginatedMd = renderResult.paginated_md || content;

    console.log(`[API] Python rendering complete: ${slideCount} slides, ${decoratedCount} with infographics`);

    // 更新手稿记录
    await prisma.teachingManuscript.update({
      where: { id },
      data: {
        htmlSlides: htmlSlidesData,
        slidevMd: paginatedMd,  // 保存分页后的 Markdown，确保前端能正确解析
        status: 'completed',
      },
    });

    return NextResponse.json({
      success: true,
      manuscriptId: id,
      slideCount,
      decoratedCount,
      htmlSlidesGenerated: true,
      processedByAgent: true,
      usedPythonRenderer: true,
      visualPlan,
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
