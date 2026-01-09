/**
 * POST /api/teaching/manuscript/[id]/process
 * 
 * 处理用户手稿 - 智能分页布局
 * 在渲染 HTML 之前调用，确保手稿内容被合理布局到 PPT
 * 
 * 调用 Python Agent 的 process-manuscript 端点
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { 
  isDeepAgentsEnabled, 
  callPythonProcessManuscriptAPI 
} from '@/lib/teaching/python-agent-client';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { skipProcessing = false } = body;

    // 获取手稿
    const manuscript = await prisma.teachingManuscript.findUnique({
      where: { id },
      include: {
        knowledgeBase: {
          select: { id: true, type: true }
        }
      }
    });

    if (!manuscript) {
      return NextResponse.json(
        { error: '手稿不存在' },
        { status: 404 }
      );
    }

    // 获取手稿内容（优先级：enrichedContent > confirmedContent > draftContent）
    const content = manuscript.enrichedContent || 
                    manuscript.confirmedContent || 
                    manuscript.draftContent;

    if (!content) {
      return NextResponse.json(
        { error: '没有可处理的内容' },
        { status: 400 }
      );
    }

    // 如果跳过处理或未启用 Python Agent，直接返回原内容
    if (skipProcessing || !isDeepAgentsEnabled()) {
      console.log('[API] Skipping Python Agent processing');
      return NextResponse.json({
        success: true,
        processed: false,
        content: content,
      });
    }

    // 调用 Python Agent 处理手稿
    console.log('[API] Calling Python Agent to process manuscript...');
    
    const kbType = manuscript.knowledgeBase?.type || 'tech';
    const sceneType = getSceneTypeFromKbType(kbType);

    const result = await callPythonProcessManuscriptAPI({
      knowledge_base_id: manuscript.knowledgeBase?.id || '',
      manuscript_content: content,
      scene_type: sceneType,
    });

    if (!result.success) {
      console.error('[API] Python Agent processing failed:', result.error);
      // 失败时返回原内容，不阻断流程
      return NextResponse.json({
        success: true,
        processed: false,
        content: content,
        warning: result.error,
      });
    }

    // 处理成功，保存处理后的内容
    const processedContent = result.processed_content || content;

    // 更新手稿（保存到 slidevMd 字段，用于渲染）
    await prisma.teachingManuscript.update({
      where: { id },
      data: {
        slidevMd: processedContent,
        metadata: JSON.stringify({
          ...JSON.parse(manuscript.metadata || '{}'),
          processedByAgent: true,
          processedAt: new Date().toISOString(),
          traceId: result.trace_id,
          stats: result.stats,
        }),
      },
    });

    console.log('[API] Manuscript processed successfully:', result.stats);

    return NextResponse.json({
      success: true,
      processed: true,
      content: processedContent,
      stats: result.stats,
      traceId: result.trace_id,
    });

  } catch (error: any) {
    console.error('[API] Error processing manuscript:', error);
    return NextResponse.json(
      { error: error.message || '处理失败' },
      { status: 500 }
    );
  }
}

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

