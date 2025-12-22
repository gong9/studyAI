/**
 * POST /api/teaching/chapters/create-from-docs
 * 制度培训专用：直接将上传的文档作为"章节"条目
 * 不需要智能扫描，每个文档就是一个完整的培训内容
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const body = await request.json();
    const { knowledgeBaseId, documents } = body;

    if (!knowledgeBaseId || !documents || documents.length === 0) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    // 验证知识库存在且属于当前用户
    const kb = await prisma.knowledgeBase.findFirst({
      where: {
        id: knowledgeBaseId,
        userId: (session.user as any).id,
      },
    });

    if (!kb) {
      return NextResponse.json({ error: '知识库不存在' }, { status: 404 });
    }

    // 获取现有章节数量，用于排序
    const existingCount = await prisma.teachingChapter.count({
      where: { knowledgeBaseId },
    });

    // 为每个文档创建一个章节记录
    const createdChapters = [];
    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      
      // 移除文件扩展名作为标题
      const title = doc.name.replace(/\.(pdf|docx?|txt|md)$/i, '');
      
      // 检查是否已存在同名章节
      const existing = await prisma.teachingChapter.findFirst({
        where: {
          knowledgeBaseId,
          title,
        },
      });

      if (!existing) {
        const chapter = await prisma.teachingChapter.create({
          data: {
            knowledgeBaseId,
            title,
            level: 1, // 制度文档都是顶级
            parentId: null,
            orderIndex: existingCount + i + 1,
            contentPreview: `制度文档：${doc.name}`,
            metadata: JSON.stringify({
              documentId: doc.id,
              documentName: doc.name,
              type: 'policy',
            }),
          },
        });
        createdChapters.push(chapter);
      }
    }

    // 更新文档状态为已处理
    await prisma.document.updateMany({
      where: { knowledgeBaseId },
      data: { status: 'completed' },
    });

    return NextResponse.json({
      success: true,
      chapters: createdChapters,
      message: `已创建 ${createdChapters.length} 个培训条目`,
    });
  } catch (error: any) {
    console.error('[API] Create chapters from docs error:', error);
    return NextResponse.json(
      { error: error.message || '创建失败' },
      { status: 500 }
    );
  }
}

