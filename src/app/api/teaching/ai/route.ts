/**
 * POST /api/teaching/ai
 * 
 * AI 辅助编辑 API
 * 支持：润色、扩写、问答、总结
 */

import { NextRequest, NextResponse } from 'next/server';
import { executeAIAction, type AIAction } from '@/lib/teaching/ai-assistant';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, text, knowledgeBaseId, context } = body;

    // 参数验证
    if (!action || !['polish', 'expand', 'ask', 'summary'].includes(action)) {
      return NextResponse.json(
        { error: '无效的操作类型，支持：polish, expand, ask, summary' },
        { status: 400 }
      );
    }

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json(
        { error: '请提供要处理的文本' },
        { status: 400 }
      );
    }

    if (!knowledgeBaseId) {
      return NextResponse.json(
        { error: '请提供知识库 ID' },
        { status: 400 }
      );
    }

    console.log(`[API] AI action: ${action}, text length: ${text.length}, kbId: ${knowledgeBaseId}`);

    // 执行 AI 操作
    const result = await executeAIAction({
      action: action as AIAction,
      text: text.trim(),
      knowledgeBaseId,
      context,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'AI 处理失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      result: result.result,
      sources: result.sources,
    });

  } catch (error: any) {
    console.error('[API] AI error:', error);
    return NextResponse.json(
      { error: error.message || '服务器错误' },
      { status: 500 }
    );
  }
}

