/**
 * POST /api/teaching/manuscript/[id]/render
 * 
 * 阶段6：课件渲染
 * 将润色后的手稿转换为 Slidev 格式，并使用 Gemini 生成精美 HTML 幻灯片
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { preprocessToSlidev } from '@/lib/teaching/slidev/preprocessor';
import { generateHtmlSlides } from '@/lib/teaching/remotion/html-slide-generator';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { title, author } = body;

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

    // 预处理为 Slidev 格式
    const result = preprocessToSlidev(content, {
      title: title || manuscript.chapter.title,
      author,
    });

    console.log('[API] Slidev MD generated, slides:', result.slideCount);

    // 使用 Gemini 生成精美 HTML 幻灯片
    // 根据知识库类型自动选择主题风格
    const kbType = manuscript.knowledgeBase?.type || 'tech';
    console.log(`[API] Generating HTML slides with Gemini, KB type: ${kbType}`);
    
    let htmlSlidesData = null;
    try {
      const slideResult = await generateHtmlSlides({
        slidevMd: result.slidevMd,
        knowledgeBaseType: kbType, // 传递知识库类型，自动选择主题
      });
      htmlSlidesData = JSON.stringify(slideResult.slides);
      console.log('[API] HTML slides generated:', slideResult.totalCount);
    } catch (slideError: any) {
      console.error('[API] Failed to generate HTML slides:', slideError);
      // 如果 HTML 生成失败，继续保存 Slidev 格式
    }

    // 更新手稿记录
    await prisma.teachingManuscript.update({
      where: { id },
      data: {
        slidevMd: result.slidevMd,
        htmlSlides: htmlSlidesData,
        status: 'completed',
      },
    });

    return NextResponse.json({
      success: true,
      manuscriptId: id,
      slidevMd: result.slidevMd,
      slideCount: result.slideCount,
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

