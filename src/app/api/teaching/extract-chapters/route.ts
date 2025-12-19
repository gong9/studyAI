/**
 * POST /api/teaching/extract-chapters
 * 上传教材后，提取章节结构
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { extractChapters, extractChaptersByRules, type ChapterNode } from '@/lib/teaching';
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
    const { knowledgeBaseId, useLLM = true } = body;

    if (!knowledgeBaseId) {
      return NextResponse.json({ error: '缺少知识库 ID' }, { status: 400 });
    }

    // 验证知识库存在且属于当前用户
    const kb = await prisma.knowledgeBase.findFirst({
      where: {
        id: knowledgeBaseId,
        userId: (session.user as any).id,
      },
      include: {
        documents: true,
      },
    });

    if (!kb) {
      return NextResponse.json({ error: '知识库不存在' }, { status: 404 });
    }

    // 获取所有文档
    const documents = await prisma.document.findMany({
      where: { knowledgeBaseId },
      select: { id: true, name: true, content: true, path: true },
    });

    if (documents.length === 0) {
      return NextResponse.json({ error: '知识库中没有文档' }, { status: 400 });
    }

    // 解析 PDF 内容（如果还没解析）
    for (const doc of documents) {
      if (!doc.content && doc.path) {
        console.log(`[ExtractChapters] Parsing PDF: ${doc.name}`);
        try {
          const ext = path.extname(doc.name).toLowerCase();
          let content = '';
          
          if (ext === '.pdf' && await fs.pathExists(doc.path)) {
            const buffer = await fs.readFile(doc.path);
            const pdfData = await pdfParse(buffer);
            content = pdfData.text || '';
            console.log(`[ExtractChapters] Extracted ${content.length} chars from ${doc.name}`);
          } else if ((ext === '.txt' || ext === '.md') && await fs.pathExists(doc.path)) {
            content = await fs.readFile(doc.path, 'utf-8');
          } else if (ext === '.docx' && await fs.pathExists(doc.path)) {
            const mammoth = require('mammoth');
            const buffer = await fs.readFile(doc.path);
            const result = await mammoth.extractRawText({ buffer });
            content = result.value || '';
          }
          
          if (content) {
            // 更新数据库中的内容
            await prisma.document.update({
              where: { id: doc.id },
              data: { 
                content,
                wordCount: content.length,
              },
            });
            doc.content = content;
          }
        } catch (parseError) {
          console.error(`[ExtractChapters] Failed to parse ${doc.name}:`, parseError);
        }
      }
    }

    // 合并所有文档内容
    const fullContent = documents
      .map(doc => `\n\n=== ${doc.name} ===\n\n${doc.content || ''}`)
      .join('\n');
    
    // 检查是否有实际内容
    const actualContent = fullContent.replace(/===.*?===/g, '').trim();
    if (!actualContent) {
      return NextResponse.json({ 
        error: 'PDF 内容提取失败，可能是扫描版图片 PDF。请使用可搜索的文字版 PDF。' 
      }, { status: 400 });
    }

    // 提取章节结构
    let result;
    if (useLLM) {
      result = await extractChapters(fullContent);
    } else {
      const chapters = extractChaptersByRules(fullContent);
      result = {
        success: true,
        chapters,
        metadata: { totalChapters: chapters.length },
      };
    }

    if (!result.success) {
      return NextResponse.json({ error: result.error || '章节提取失败' }, { status: 500 });
    }

    // 保存章节到数据库
    await saveChaptersToDb(knowledgeBaseId, result.chapters, result.metadata);

    // 更新知识库类型为 teaching
    await prisma.knowledgeBase.update({
      where: { id: knowledgeBaseId },
      data: { type: 'teaching' },
    });

    // 更新文档状态为已处理
    await prisma.document.updateMany({
      where: { knowledgeBaseId },
      data: { status: 'completed' },
    });

    return NextResponse.json({
      success: true,
      chapters: result.chapters,
      metadata: result.metadata,
    });
  } catch (error: any) {
    console.error('[API] Extract chapters error:', error);
    return NextResponse.json(
      { error: error.message || '提取章节失败' },
      { status: 500 }
    );
  }
}

/**
 * 保存章节树到数据库
 */
async function saveChaptersToDb(
  knowledgeBaseId: string,
  chapters: ChapterNode[],
  metadata?: { grade?: string; subject?: string }
) {
  // 先删除旧的章节
  await prisma.teachingChapter.deleteMany({
    where: { knowledgeBaseId },
  });

  // 递归保存章节
  async function saveNode(
    node: ChapterNode,
    parentId: string | null,
    orderIndex: number
  ): Promise<string> {
    const chapter = await prisma.teachingChapter.create({
      data: {
        knowledgeBaseId,
        title: node.title,
        level: node.level,
        parentId,
        orderIndex,
        contentPreview: node.contentPreview?.substring(0, 500),
        contentFull: node.contentFull,
        metadata: JSON.stringify({
          grade: metadata?.grade || node.metadata?.grade,
          subject: metadata?.subject || node.metadata?.subject,
          difficulty: node.metadata?.difficulty,
          keywords: node.metadata?.keywords,
        }),
      },
    });

    // 保存子章节
    if (node.children) {
      for (let i = 0; i < node.children.length; i++) {
        await saveNode(node.children[i], chapter.id, i + 1);
      }
    }

    return chapter.id;
  }

  // 保存所有根章节
  for (let i = 0; i < chapters.length; i++) {
    await saveNode(chapters[i], null, i + 1);
  }
}

