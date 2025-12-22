/**
 * POST /api/teaching/manuscript/[id]/banana
 * 
 * 使用 Banana 模式生成精美 PPT 图片
 * - 读取现有 slidevMd 内容
 * - 调用 Gemini 图像模型生成每页精美图片
 * - 保存到 bananaImages 字段
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateAllSlideImages } from '@/lib/teaching/banana/image-generator';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { templateId = "default" } = body;

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

    console.log('[Banana API] Starting generation for manuscript:', id);

    // 生成精美 PPT 图片
    const images = await generateAllSlideImages(
      content,
      templateId,
      (progress) => {
        console.log(`[Banana API] Progress: ${progress.current}/${progress.total} - ${progress.message}`);
      }
    );

    console.log(`[Banana API] Generated ${images.length} images`);

    // 保存到数据库（JSON 格式）
    await prisma.teachingManuscript.update({
      where: { id },
      data: {
        bananaImages: JSON.stringify(images),
      },
    });

    console.log('[Banana API] Saved to database');

    return NextResponse.json({
      success: true,
      imageCount: images.length,
      message: `成功生成 ${images.length} 页精美 PPT`,
    });

  } catch (error: any) {
    console.error('[Banana API] Error:', error);
    return NextResponse.json(
      { error: error.message || '生成失败' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/teaching/manuscript/[id]/banana
 * 
 * 获取已生成的 Banana 图片
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
        bananaImages: true,
      },
    });

    if (!manuscript) {
      return NextResponse.json(
        { error: '手稿不存在' },
        { status: 404 }
      );
    }

    if (!manuscript.bananaImages) {
      return NextResponse.json({
        success: true,
        hasImages: false,
        images: [],
      });
    }

    const images = JSON.parse(manuscript.bananaImages);

    return NextResponse.json({
      success: true,
      hasImages: true,
      imageCount: images.length,
      images,
    });

  } catch (error: any) {
    console.error('[Banana API] Error:', error);
    return NextResponse.json(
      { error: error.message || '获取失败' },
      { status: 500 }
    );
  }
}

