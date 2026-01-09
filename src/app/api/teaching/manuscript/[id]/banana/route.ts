/**
 * POST /api/teaching/manuscript/[id]/banana
 * 
 * 生成精美 HTML 幻灯片
 * - 读取手稿内容
 * - 使用 Gemini 直接生成 HTML
 * - 保存到 htmlSlides 字段
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
    const body = await request.json().catch(() => ({}));
    const theme = body.theme || 'dark';

    // 获取手稿
    const manuscript = await prisma.teachingManuscript.findUnique({
      where: { id },
      select: {
        id: true,
        slidevMd: true,
        enrichedContent: true,
        confirmedContent: true,
        draftContent: true,
      },
    });

    if (!manuscript) {
      return NextResponse.json(
        { error: '手稿不存在' },
        { status: 404 }
      );
    }

    // 优先使用 slidevMd，回退到其他内容
    const content = manuscript.slidevMd || 
                    manuscript.enrichedContent || 
                    manuscript.confirmedContent || 
                    manuscript.draftContent;

    if (!content) {
      return NextResponse.json(
        { error: '没有可生成的内容，请先完成手稿编辑' },
        { status: 400 }
      );
    }


    // 使用 Skill 生成 HTML 幻灯片
    const result = await generateHtmlSlides({
      slidevMd: content,
      theme: theme as 'dark' | 'light' | 'auto',
    });


    // 保存到数据库
    await prisma.teachingManuscript.update({
      where: { id },
      data: {
        htmlSlides: JSON.stringify(result.slides),
      },
    });


    return NextResponse.json({
      success: true,
      slideCount: result.totalCount,
      message: `成功生成 ${result.totalCount} 页精美课件`,
      slides: result.slides.map((slide) => ({
        index: slide.index,
        title: slide.title,
      })),
    });

  } catch (error: any) {
    console.error('[HTML Slide API] 生成失败:', error);
    return NextResponse.json(
      { error: error.message || '生成失败' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/teaching/manuscript/[id]/banana
 * 
 * 获取已生成的 HTML 幻灯片数据
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const manuscript = await prisma.teachingManuscript.findUnique({
      where: { id },
      select: {
        htmlSlides: true,
      },
    });

    if (!manuscript) {
      return NextResponse.json(
        { error: '手稿不存在' },
        { status: 404 }
      );
    }

    if (manuscript.htmlSlides) {
      const slides = JSON.parse(manuscript.htmlSlides);
      return NextResponse.json({
        success: true,
        hasSlides: true,
        slideCount: slides.length,
        slides,
      });
    }

    return NextResponse.json({
      success: true,
      hasSlides: false,
      slides: [],
    });

  } catch (error: any) {
    console.error('[HTML Slide API] 获取失败:', error);
    return NextResponse.json(
      { error: error.message || '获取失败' },
      { status: 500 }
    );
  }
}
