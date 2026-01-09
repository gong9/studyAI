/**
 * POST /api/documents/paste
 * 直接粘贴文本内容创建文档
 * 会创建物理文件以支持索引流程
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import * as fs from 'fs/promises';
import * as path from 'path';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const body = await request.json();
    const { knowledgeBaseId, title, content } = body;

    if (!knowledgeBaseId) {
      return NextResponse.json({ error: '缺少知识库 ID' }, { status: 400 });
    }

    if (!content || !content.trim()) {
      return NextResponse.json({ error: '内容不能为空' }, { status: 400 });
    }

    // 验证知识库所有权
    const knowledgeBase = await prisma.knowledgeBase.findUnique({
      where: { id: knowledgeBaseId },
    });

    if (!knowledgeBase) {
      return NextResponse.json({ error: '知识库不存在' }, { status: 404 });
    }

    if (knowledgeBase.userId !== userId) {
      return NextResponse.json({ error: '无权访问此知识库' }, { status: 403 });
    }

    // 生成文档名称（添加时间戳避免冲突）
    const docName = title?.trim() || `手稿_${new Date().toISOString().slice(0, 10)}`;
    const timestamp = Date.now();
    const safeFileName = docName.replace(/[<>:"/\\|?*]/g, '_'); // 移除文件名非法字符
    const fileName = `${timestamp}_${safeFileName}.txt`;

    // 创建物理文件以支持索引流程
    const uploadDir = path.join(
      process.env.UPLOAD_DIR || './uploads',
      `kb_${knowledgeBaseId}`,
    );
    await fs.mkdir(uploadDir, { recursive: true });
    
    const filePath = path.join(uploadDir, fileName);
    await fs.writeFile(filePath, content.trim(), 'utf-8');

    // 创建文档记录
    const document = await prisma.document.create({
      data: {
        name: fileName,
        path: filePath,
        content: content.trim(),
        wordCount: content.trim().length,
        knowledgeBaseId,
        status: 'pending', // 等待索引处理
      },
    });


    return NextResponse.json(document, { status: 201 });
  } catch (error: any) {
    console.error('[PasteDocument] Error:', error);
    return NextResponse.json({ error: error.message || '保存失败' }, { status: 500 });
  }
}

