/**
 * GET /api/teaching/chapters/[kbId]
 * 获取知识库的章节树
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

interface ChapterTreeNode {
  id: string;
  title: string;
  level: number;
  orderIndex: number;
  contentPreview?: string | null;
  metadata?: any;
  children: ChapterTreeNode[];
}

export async function GET(
  request: Request,
  { params }: { params: { kbId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const { kbId } = params;

    // 验证知识库存在且属于当前用户
    const kb = await prisma.knowledgeBase.findFirst({
      where: {
        id: kbId,
        userId: (session.user as any).id,
      },
    });

    if (!kb) {
      return NextResponse.json({ error: '知识库不存在' }, { status: 404 });
    }

    // 获取所有章节
    const chapters = await prisma.teachingChapter.findMany({
      where: { knowledgeBaseId: kbId },
      orderBy: [{ level: 'asc' }, { orderIndex: 'asc' }],
    });

    // 如果有章节，确保文档状态已更新（修复历史数据）
    if (chapters.length > 0) {
      await prisma.document.updateMany({
        where: { 
          knowledgeBaseId: kbId,
          status: 'pending',
        },
        data: { status: 'completed' },
      });
    }

    // 构建树形结构
    const tree = buildChapterTree(chapters);

    return NextResponse.json({
      chapters: tree,
      total: chapters.length,
      metadata: kb.type === 'teaching' ? { type: 'teaching' } : null,
    });
  } catch (error: any) {
    console.error('[API] Get chapters error:', error);
    return NextResponse.json(
      { error: error.message || '获取章节失败' },
      { status: 500 }
    );
  }
}

/**
 * 构建章节树
 */
function buildChapterTree(chapters: any[]): ChapterTreeNode[] {
  const map = new Map<string, ChapterTreeNode>();
  const roots: ChapterTreeNode[] = [];

  // 先创建所有节点
  for (const ch of chapters) {
    map.set(ch.id, {
      id: ch.id,
      title: ch.title,
      level: ch.level,
      orderIndex: ch.orderIndex,
      contentPreview: ch.contentPreview,
      metadata: ch.metadata ? JSON.parse(ch.metadata) : null,
      children: [],
    });
  }

  // 构建父子关系
  for (const ch of chapters) {
    const node = map.get(ch.id)!;
    if (ch.parentId && map.has(ch.parentId)) {
      map.get(ch.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // 排序
  const sortNodes = (nodes: ChapterTreeNode[]) => {
    nodes.sort((a, b) => a.orderIndex - b.orderIndex);
    nodes.forEach(n => sortNodes(n.children));
  };
  sortNodes(roots);

  return roots;
}

