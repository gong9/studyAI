/**
 * POST /api/teaching/manuscript/[id]/render
 * 
 * 阶段6：课件渲染
 * 使用 Gemini 生成精美 HTML 幻灯片
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateHtmlSlides } from '@/lib/skills/slide-generation';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const manuscript = await prisma.teachingManuscript.findUnique({
      where: { id },
      include: { 
        chapter: true,
        knowledgeBase: {
          select: { type: true }
        }
      },
    });

    if (!manuscript) {
      return NextResponse.json(
        { error: '手稿不存在' },
        { status: 404 }
      );
    }

    // 使用润色后内容，或回退到确认内容
    const content = manuscript.enrichedContent || manuscript.confirmedContent;
    
    if (!content) {
      return NextResponse.json(
        { error: '没有可渲染的内容' },
        { status: 400 }
      );
    }

    console.log('[API] Rendering slides:', id);

    // 使用 Gemini 生成精美 HTML 幻灯片
    // 根据知识库类型自动选择主题风格
    const kbType = manuscript.knowledgeBase?.type || 'tech';
    console.log(`[API] Generating HTML slides with Gemini, KB type: ${kbType}`);
    
    let htmlSlidesData = null;
    let slideCount = 0;
    try {
      const slideResult = await generateHtmlSlides({
        slidevMd: content, // 直接使用内容，skill 内部会解析
        knowledgeBaseType: kbType,
      });
      htmlSlidesData = JSON.stringify(slideResult.slides);
      slideCount = slideResult.totalCount;
      console.log('[API] HTML slides generated:', slideResult.totalCount);
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
    });

  } catch (error: any) {
    console.error('[API] Error rendering slides:', error);
    return NextResponse.json(
      { error: error.message || '服务器错误' },
      { status: 500 }
    );
  }
}
