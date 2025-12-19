/**
 * GET /api/teaching/manuscript/[id]/export
 * 
 * 导出课件为 PDF 或 PPTX
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { renderSlidev } from '@/lib/teaching/slidev/renderer';
import * as fs from 'fs/promises';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const format = (url.searchParams.get('format') || 'pdf') as 'pdf' | 'pptx';

    const manuscript = await prisma.teachingManuscript.findUnique({
      where: { id },
    });

    if (!manuscript) {
      return NextResponse.json(
        { error: '手稿不存在' },
        { status: 404 }
      );
    }

    if (!manuscript.slidevMd) {
      return NextResponse.json(
        { error: '请先生成 Slidev 格式' },
        { status: 400 }
      );
    }

    console.log('[API] Exporting to', format, ':', id);

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

