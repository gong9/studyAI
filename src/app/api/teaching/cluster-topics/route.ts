/**
 * POST /api/teaching/cluster-topics
 * 对碎片资料进行主题聚类（fragments 模式）
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { clusterDocumentsToTopics, topicsToChapterNodes } from '@/lib/teaching/topic-clustering';
import * as fs from 'fs-extra';
import * as path from 'path';
import pdfParse from 'pdf-parse';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const body = await request.json();
    const { knowledgeBaseId } = body;

    if (!knowledgeBaseId) {
      return NextResponse.json({ error: '缺少知识库 ID' }, { status: 400 });
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

    // 验证是 fragments 模式
    if (kb.sourceMode !== 'fragments') {
      return NextResponse.json({ 
        error: '此操作仅适用于碎片资料模式' 
      }, { status: 400 });
    }

    // 获取所有文档
    const documents = await prisma.document.findMany({
      where: { knowledgeBaseId },
      select: { id: true, name: true, content: true, path: true },
    });

    if (documents.length === 0) {
      return NextResponse.json({ error: '知识库中没有文档' }, { status: 400 });
    }

    // 解析文档内容（如果还没解析）
    for (const doc of documents) {
      if (!doc.content && doc.path) {
        console.log(`[ClusterTopics] Parsing document: ${doc.name}`);
        try {
          const ext = path.extname(doc.name).toLowerCase();
          let content = '';
          
          if (ext === '.pdf' && await fs.pathExists(doc.path)) {
            const buffer = await fs.readFile(doc.path);
            const pdfData = await pdfParse(buffer);
            content = pdfData.text || '';
          } else if ((ext === '.txt' || ext === '.md') && await fs.pathExists(doc.path)) {
            content = await fs.readFile(doc.path, 'utf-8');
          } else if (ext === '.docx' && await fs.pathExists(doc.path)) {
            const mammoth = require('mammoth');
            const buffer = await fs.readFile(doc.path);
            const result = await mammoth.extractRawText({ buffer });
            content = result.value || '';
          }
          
          if (content) {
            await prisma.document.update({
              where: { id: doc.id },
              data: { content, wordCount: content.length },
            });
            doc.content = content;
          }
        } catch (parseError) {
          console.error(`[ClusterTopics] Failed to parse ${doc.name}:`, parseError);
        }
      }
    }

    // 调用主题聚类
    console.log(`[ClusterTopics] Clustering ${documents.length} documents...`);
    const clusterResult = await clusterDocumentsToTopics(
      documents.map(d => ({
        id: d.id,
        name: d.name,
        content: d.content || '',
      }))
    );

    if (!clusterResult.success) {
      return NextResponse.json({ 
        error: clusterResult.error || '主题聚类失败' 
      }, { status: 500 });
    }

    // 将主题转换为章节结构
    const chapterNodes = topicsToChapterNodes(
      clusterResult.topics,
      documents.map(d => ({ id: d.id, name: d.name, content: d.content || '' }))
    );

    // 保存章节到数据库
    // 先删除旧的章节
    await prisma.teachingChapter.deleteMany({
      where: { knowledgeBaseId },
    });

    // 保存新章节
    for (const node of chapterNodes) {
      await prisma.teachingChapter.create({
        data: {
          knowledgeBaseId,
          title: node.title,
          level: node.level,
          orderIndex: node.orderIndex,
          contentPreview: node.contentPreview?.substring(0, 500),
          contentFull: node.contentFull,
          metadata: JSON.stringify({}),
        },
      });
    }

    // 更新文档状态
    await prisma.document.updateMany({
      where: { knowledgeBaseId },
      data: { status: 'completed' },
    });

    console.log(`[ClusterTopics] Created ${chapterNodes.length} topic chapters`);

    return NextResponse.json({
      success: true,
      topics: clusterResult.topics,
      metadata: clusterResult.metadata,
    });
  } catch (error: any) {
    console.error('[API] Cluster topics error:', error);
    return NextResponse.json(
      { error: error.message || '主题聚类失败' },
      { status: 500 }
    );
  }
}

