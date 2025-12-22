/**
 * GET /api/teaching/manuscript/[id]/export
 * 
 * 导出课件为 PDF 或 PPTX
 * 
 * 参数:
 * - format: pdf | pptx (默认 pptx)
 * - style: classic | banana (默认 classic)
 *   - classic: 使用传统 pptxgenjs 渲染（可编辑文字）
 *   - banana: 使用 Gemini 生成的精美图片（图片格式）
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { renderSlidev } from '@/lib/teaching/slidev/renderer';
import { createPptxFromImages } from '@/lib/teaching/banana/pptx-exporter';
import * as fs from 'fs/promises';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const format = (url.searchParams.get('format') || 'pptx') as 'pdf' | 'pptx';
    const style = (url.searchParams.get('style') || 'classic') as 'classic' | 'banana';

    const manuscript = await prisma.teachingManuscript.findUnique({
      where: { id },
    });

    if (!manuscript) {
      return NextResponse.json(
        { error: '手稿不存在' },
        { status: 404 }
      );
    }

    console.log('[API] Exporting to', format, 'with style', style, ':', id);

    // Banana 模式：使用精美图片导出
    if (style === 'banana') {
      if (!manuscript.bananaImages) {
        return NextResponse.json(
          { error: '请先生成精美 PPT 图片' },
          { status: 400 }
        );
      }

      const images = JSON.parse(manuscript.bananaImages) as string[];
      
      if (images.length === 0) {
        return NextResponse.json(
          { error: '没有可导出的图片' },
          { status: 400 }
        );
      }

      console.log(`[API] Exporting ${images.length} banana images to PPTX`);

      const pptxBuffer = await createPptxFromImages(images);
      
      return new NextResponse(pptxBuffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'Content-Disposition': `attachment; filename="courseware-banana.pptx"`,
        },
      });
    }

    // Classic 模式：使用传统渲染
    if (!manuscript.slidevMd) {
      return NextResponse.json(
        { error: '请先生成 Slidev 格式' },
        { status: 400 }
      );
    }

    // 渲染并导出
    const result = await renderSlidev(manuscript.slidevMd, id, { format });

    if (!result.success || !result.outputPath) {
      return NextResponse.json(
        { error: result.error || '导出失败' },
        { status: 500 }
      );
    }

    // 读取文件并返回
    const fileBuffer = await fs.readFile(result.outputPath);
    const contentType = format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    const fileName = `courseware.${format}`;

    console.log('[API] Export completed:', result.outputPath);

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });

  } catch (error: any) {
    console.error('[API] Error exporting:', error);
    return NextResponse.json(
      { error: error.message || '服务器错误' },
      { status: 500 }
    );
  }
}
