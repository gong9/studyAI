/**
 * POST /api/teaching/manuscript/create-blank
 * 
 * 创建空白手稿，用户可以自己从头编写内容
 * 不需要上传文档或选择章节
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { knowledgeBaseId, title } = body;

    if (!knowledgeBaseId) {
      return NextResponse.json(
        { error: '缺少 knowledgeBaseId 参数' },
        { status: 400 }
      );
    }

    // 检查知识库是否存在
    const kb = await prisma.knowledgeBase.findUnique({
      where: { id: knowledgeBaseId },
    });

    if (!kb) {
      return NextResponse.json(
        { error: '知识库不存在' },
        { status: 404 }
      );
    }

    // 生成默认标题
    const defaultTitle = title || `空白手稿_${new Date().toLocaleDateString('zh-CN')}`;

    // 创建一个虚拟章节来关联手稿
    const chapter = await prisma.teachingChapter.create({
      data: {
        knowledgeBaseId,
        title: defaultTitle,
        level: 1,
        orderIndex: 999, // 放在最后
        contentPreview: '用户自主创作的空白手稿',
        metadata: JSON.stringify({ isBlank: true }),
      },
    });

    // 创建空白手稿记录
    const manuscript = await prisma.teachingManuscript.create({
      data: {
        knowledgeBaseId,
        chapterId: chapter.id,
        teachingPlan: JSON.stringify({
          source: 'blank',  // 标记为用户手稿，前端会根据此标记显示简化按钮
          title: defaultTitle,
          objectives: ['用户自定义'],
          keyPoints: [],
          structure: [
            {
              section: '开场',
              duration: '2分钟',
              content: '在这里编写开场内容...',
            },
            {
              section: '主体',
              duration: '10分钟',
              content: '在这里编写主体内容...',
            },
            {
              section: '总结',
              duration: '2分钟',
              content: '在这里编写总结内容...',
            },
          ],
        }),
        draftContent: '', // 空白内容，由用户自己填写
        status: 'draft',
      },
    });


    return NextResponse.json({
      success: true,
      manuscriptId: manuscript.id,
      chapterId: chapter.id,
    });

  } catch (error: any) {
    console.error('[API] Error creating blank manuscript:', error);
    return NextResponse.json(
      { error: error.message || '服务器错误' },
      { status: 500 }
    );
  }
}

