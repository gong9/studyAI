/**
 * GET /api/teaching/chapter/check-size?chapterId=xxx
 * 
 * 检查章节大小，返回是否需要分章节生成的建议
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkChapterSize } from '@/lib/teaching/utils/chapter-content-merger';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const chapterId = searchParams.get('chapterId');

    if (!chapterId) {
      return NextResponse.json(
        { error: '缺少 chapterId 参数' },
        { status: 400 }
      );
    }

    const result = await checkChapterSize(chapterId);

    return NextResponse.json({
      success: true,
      ...result,
    });

  } catch (error: any) {
    console.error('[API] Error checking chapter size:', error);
    return NextResponse.json(
      { error: error.message || '服务器错误' },
      { status: 500 }
    );
  }
}

