/**
 * POST /api/teaching/extract-chapters
 * 上传教材后，提取章节结构
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { extractChapters, extractChaptersByRules, type ChapterNode } from '@/lib/teaching';
import { analyzeChapter } from '@/lib/teaching/agents/chapter-analyzer';
import { loadIndex } from '@/lib/llm/index-manager';
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

    // 检查索引是否就绪（必须先完成文档处理）
    const indexReady = await isIndexReady(knowledgeBaseId);
    if (!indexReady) {
      return NextResponse.json({ 
        error: '文档正在处理中，请等待处理完成后再进行智能扫描' 
      }, { status: 400 });
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

    // 根据知识库类型确定提取方式
    // tech -> 技术文档结构, policy -> 制度条款
    const kbType = kb.type || 'tech';
    const sourceMode = kb.sourceMode || 'book';
    console.log(`[ExtractChapters] KB type: ${kbType}, sourceMode: ${sourceMode}`);

    // 根据 sourceMode 选择不同的处理逻辑
    let result;
    
    if (sourceMode === 'docs') {
      // docs 模式：每个文档直接作为一个章节，跳过 LLM 提取
      console.log(`[ExtractChapters] Using docs mode: ${documents.length} documents -> chapters`);
      const chapters: ChapterNode[] = documents.map((doc, index) => ({
        title: doc.name.replace(/\.(pdf|docx|txt|md)$/i, ''),
        level: 1,
        orderIndex: index + 1,
        contentPreview: (doc.content || '').substring(0, 500),
        contentFull: doc.content || '',
        children: [],
      }));
      result = {
        success: true,
        chapters,
        metadata: { totalChapters: chapters.length, sourceMode: 'docs' },
      };
    } else if (sourceMode === 'fragments') {
      // fragments 模式：使用 AI 主题聚类
      console.log(`[ExtractChapters] Using fragments mode with topic clustering`);
      const clusterResult = await clusterDocumentsToTopics(
        documents.map(d => ({
          id: d.id,
          name: d.name,
          content: d.content || '',
        }))
      );
      
      if (clusterResult.success) {
        const chapterNodes = topicsToChapterNodes(
          clusterResult.topics,
          documents.map(d => ({ id: d.id, name: d.name, content: d.content || '' }))
        );
        result = {
          success: true,
          chapters: chapterNodes,
          metadata: { 
            totalChapters: chapterNodes.length, 
            sourceMode: 'fragments',
            ...clusterResult.metadata 
          },
        };
      } else {
        // 聚类失败时回退到普通 LLM 提取
        console.log(`[ExtractChapters] Clustering failed, falling back to LLM extraction`);
        result = await extractChapters(fullContent, kbType);
      }
    } else {
      // book 模式（默认）：使用现有的 LLM 智能提取
      if (useLLM) {
        result = await extractChapters(fullContent, kbType);
      } else {
        const chapters = extractChaptersByRules(fullContent);
        result = {
          success: true,
          chapters,
          metadata: { totalChapters: chapters.length },
        };
      }
    }

    if (!result.success) {
      return NextResponse.json({ error: result.error || '章节提取失败' }, { status: 500 });
    }

    // 保存章节到数据库
    await saveChaptersToDb(knowledgeBaseId, result.chapters, result.metadata);

    // 注意：不再强制覆盖类型，保留用户创建时选择的类型（tech/policy/legal）
    // 只有当类型是 document 时才更新为对应的场景类型
    const currentType = kb.type;
    if (currentType === 'document') {
      await prisma.knowledgeBase.update({
        where: { id: knowledgeBaseId },
        data: { type: 'tech' }, // 默认设为 tech
      });
    }

    // 更新文档状态为已处理
    await prisma.document.updateMany({
      where: { knowledgeBaseId },
      data: { status: 'completed' },
    });

    // 异步触发章节分析（不阻塞响应）
    analyzeAllChapters(knowledgeBaseId).catch(err => {
      console.error('[ExtractChapters] Background analysis failed:', err);
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

/**
 * 异步分析所有章节（后台任务）
 */
async function analyzeAllChapters(knowledgeBaseId: string) {
  console.log(`[ExtractChapters] Starting background analysis for KB: ${knowledgeBaseId}`);
  
  // 检查索引是否就绪（不创建，只检查）
  const indexReady = await isIndexReady(knowledgeBaseId);
  if (!indexReady) {
    console.log('[ExtractChapters] Index not ready, skipping chapter analysis. Please wait for document processing to complete.');
    return;
  }
  
  // 获取所有未分析的叶子章节（level 最深的章节）
  const chapters = await prisma.teachingChapter.findMany({
    where: {
      knowledgeBaseId,
      analyzed: false,
    },
    select: {
      id: true,
      title: true,
      level: true,
    },
    orderBy: { orderIndex: 'asc' },
  });

  if (chapters.length === 0) {
    console.log('[ExtractChapters] No chapters to analyze');
    return;
  }

  console.log(`[ExtractChapters] Analyzing ${chapters.length} chapters...`);

  for (const chapter of chapters) {
    try {
      console.log(`[ExtractChapters] Analyzing: ${chapter.title}`);
      
      const result = await analyzeChapter({
        knowledgeBaseId,
        chapterTitle: chapter.title,
        chapterLevel: chapter.level,
      });

      if (result.success) {
        // 更新章节的分析结果
        await prisma.teachingChapter.update({
          where: { id: chapter.id },
          data: {
            keyPoints: JSON.stringify(result.keyPoints),
            summary: result.summary,
            analyzed: true,
          },
        });
        console.log(`[ExtractChapters] ✓ Analyzed: ${chapter.title} (${result.keyPoints.length} key points)`);
      } else {
        console.log(`[ExtractChapters] ✗ Failed: ${chapter.title} - ${result.error}`);
      }

      // 避免 API 限流
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (err) {
      console.error(`[ExtractChapters] Error analyzing ${chapter.title}:`, err);
    }
  }

  console.log(`[ExtractChapters] Background analysis completed for KB: ${knowledgeBaseId}`);
}

/**
 * 检查索引是否就绪
 * 不创建，只检查。没就绪就返回 false
 */
async function isIndexReady(knowledgeBaseId: string): Promise<boolean> {
  try {
    await loadIndex(knowledgeBaseId);
    console.log(`[ExtractChapters] ✓ Index is ready`);
    return true;
  } catch (error: any) {
    console.log(`[ExtractChapters] Index not ready: ${error.message}`);
    return false;
  }
}

