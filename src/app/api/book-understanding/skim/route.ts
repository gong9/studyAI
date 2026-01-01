/**
 * POST /api/book-understanding/skim
 * 
 * 全书理解 - 阶段1：粗读建结构
 * 
 * 功能：
 * - 按页解析PDF，保留页码结构
 * - LLM识别章节边界
 * - 分类章节角色
 * - 构建章节依赖DAG
 * - 保存章节到数据库（替代原有的智能扫描）
 * 
 * 返回：章节列表 + 全书DAG结构
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// 文档解析
import { 
  parsePdfBufferByPage, 
  extractPdfOutline,
  outlineToChapterBoundaries,
  type PageParsedDocument 
} from '@/lib/document-parser';

// 阶段1模块
import { analyzeBook } from '@/lib/book-understanding/stage1-skim/book-analyzer';
import { 
  detectChapterBoundaries, 
  getChapterContent,
  getChapterWordCount,
  inferHierarchyFromPageGaps,
  type ChapterBoundary 
} from '@/lib/book-understanding/stage1-skim/chapter-boundary-detector';
import { classifyChapterRoles, type RawChapter } from '@/lib/book-understanding/stage1-skim/chapter-role-classifier';
import { buildChapterDAG } from '@/lib/book-understanding/stage1-skim/chapter-dependency';

import type { ChapterMeta, ChapterDAG, BookThesis } from '@/lib/book-understanding/types';

import * as fs from 'fs-extra';
import * as path from 'path';

export const maxDuration = 120; // 2 分钟超时

// 超长章节阈值
const LONG_CHAPTER_THRESHOLD = 20000;

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const body = await request.json();
    const { knowledgeBaseId } = body;

    if (!knowledgeBaseId) {
      return NextResponse.json({ error: '缺少 knowledgeBaseId' }, { status: 400 });
    }

    // 验证知识库
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

    if (kb.documents.length === 0) {
      return NextResponse.json({ error: '知识库中没有文档' }, { status: 400 });
    }

    console.log(`[Skim] Starting for KB: ${knowledgeBaseId}`);

    // ========== 步骤1：按页解析文档 ==========
    const documents = await prisma.document.findMany({
      where: { knowledgeBaseId },
      select: { id: true, name: true, content: true, path: true },
    });

    const parsedDocs: PageParsedDocument[] = [];
    let fullContent = '';

    for (const doc of documents) {
      const ext = path.extname(doc.name).toLowerCase();
      
      if (ext === '.pdf' && doc.path && await fs.pathExists(doc.path)) {
        const buffer = await fs.readFile(doc.path);
        const parsed = await parsePdfBufferByPage(buffer, doc.name);
        parsedDocs.push(parsed);
        fullContent += `\n\n=== ${doc.name} ===\n\n${parsed.fullText}`;
        console.log(`[Skim] Parsed ${doc.name}: ${parsed.totalPages} pages`);
      } else if ((ext === '.txt' || ext === '.md') && doc.path && await fs.pathExists(doc.path)) {
        const content = await fs.readFile(doc.path, 'utf-8');
        parsedDocs.push({
          fileName: doc.name,
          totalPages: 1,
          pages: [{ pageNumber: 1, text: content, wordCount: content.length }],
          fullText: content,
        });
        fullContent += `\n\n=== ${doc.name} ===\n\n${content}`;
      } else if (doc.content) {
        parsedDocs.push({
          fileName: doc.name,
          totalPages: 1,
          pages: [{ pageNumber: 1, text: doc.content, wordCount: doc.content.length }],
          fullText: doc.content,
        });
        fullContent += `\n\n=== ${doc.name} ===\n\n${doc.content}`;
      }
    }

    if (parsedDocs.length === 0 || !fullContent.trim()) {
      return NextResponse.json({ error: '文档内容为空' }, { status: 400 });
    }

    // 选取主文档
    const mainDoc = parsedDocs.reduce((a, b) => a.totalPages > b.totalPages ? a : b);

    // ========== 步骤2：分析全书主题 ==========
    console.log('[Skim] Analyzing book theme...');
    const bookResult = await analyzeBook({ 
      knowledgeBaseId,
      content: fullContent,
    });
    
    if (!bookResult.success || !bookResult.thesis) {
      return NextResponse.json({ error: bookResult.error || '全书主题分析失败' }, { status: 500 });
    }

    // ========== 步骤3：识别章节边界 ==========
    // 优先从 PDF 书签提取（更准确）
    let boundaryResult: { success: boolean; chapters: ChapterBoundary[]; tocPages?: number[]; error?: string };
    
    // 找到主 PDF 文件的 buffer
    const mainPdfDoc = documents.find(d => path.extname(d.name).toLowerCase() === '.pdf' && d.path);
    
    if (mainPdfDoc?.path && await fs.pathExists(mainPdfDoc.path)) {
      const pdfBuffer = await fs.readFile(mainPdfDoc.path);
      console.log('[Skim] Trying to extract PDF outline/bookmarks...');
      
      const outlineResult = await extractPdfOutline(pdfBuffer);
      
      if (outlineResult.success && outlineResult.hasOutline && outlineResult.items.length > 0) {
        // 使用 PDF 书签
        console.log(`[Skim] ✓ Found ${outlineResult.items.length} bookmarks in PDF, using them directly`);
        
        const chapters = outlineToChapterBoundaries(outlineResult.items, mainDoc.totalPages);
        boundaryResult = {
          success: true,
          chapters: chapters as ChapterBoundary[],
        };
      } else {
        // 没有书签，使用 LLM 分析
        console.log('[Skim] No PDF bookmarks found, falling back to LLM analysis...');
        boundaryResult = await detectChapterBoundaries({
          document: mainDoc,
          maxAnalysisPages: 50,
        });
      }
    } else {
      // 非 PDF 或文件不存在，使用 LLM 分析
      console.log('[Skim] Detecting chapter boundaries with LLM...');
      boundaryResult = await detectChapterBoundaries({
        document: mainDoc,
        maxAnalysisPages: 50,
      });
    }

    if (!boundaryResult.success || boundaryResult.chapters.length === 0) {
      return NextResponse.json({ error: '章节边界识别失败' }, { status: 500 });
    }

    // ========== 后处理：根据页码差距推断层级 ==========
    // 检查是否需要推断层级
    const chaptersWithSections = boundaryResult.chapters.filter(ch => ch.sections && ch.sections.length > 0);
    const chaptersNotLevel1 = boundaryResult.chapters.filter(ch => ch.level !== 1);
    
    console.log(`[Skim] Chapter analysis: total=${boundaryResult.chapters.length}, withSections=${chaptersWithSections.length}, notLevel1=${chaptersNotLevel1.length}`);
    
    // 如果 LLM 返回的是扁平结构（所有 level=1 且无 sections），用页码推断层级
    const needsHierarchyInference = chaptersWithSections.length === 0 && chaptersNotLevel1.length === 0;
    
    if (needsHierarchyInference && boundaryResult.chapters.length > 3) {
      console.log('[Skim] All chapters are flat (level=1, no sections), inferring hierarchy from page gaps...');
      boundaryResult.chapters = inferHierarchyFromPageGaps(boundaryResult.chapters, 4);
    } else {
      console.log('[Skim] LLM already provided hierarchy structure, skipping inference');
    }

    console.log(`[Skim] Final structure: ${boundaryResult.chapters.length} top-level chapters`);

    // ========== 步骤4：分类章节角色 ==========
    console.log('[Skim] Classifying chapter roles...');
    const rawChapters = convertBoundariesToRawChapters(mainDoc, boundaryResult.chapters);
    
    const roleResult = await classifyChapterRoles({
      thesis: bookResult.thesis,
      chapters: rawChapters,
    });

    if (!roleResult.success) {
      return NextResponse.json({ error: roleResult.error || '章节角色分类失败' }, { status: 500 });
    }

    // ========== 步骤5：构建章节DAG ==========
    console.log('[Skim] Building chapter DAG...');
    const dagResult = await buildChapterDAG({
      thesis: bookResult.thesis,
      chapters: roleResult.chapters,
    });

    if (!dagResult.success || !dagResult.dag) {
      return NextResponse.json({ error: dagResult.error || 'DAG构建失败' }, { status: 500 });
    }

    // ========== 步骤6：保存到数据库 ==========
    console.log('[Skim] Saving chapters to database...');
    await saveChaptersToDb(knowledgeBaseId, roleResult.chapters, bookResult.thesis);

    // ========== 返回结果 ==========
    console.log(`[Skim] Completed: ${roleResult.chapters.length} chapters saved`);

    return NextResponse.json({
      success: true,
      thesis: bookResult.thesis,
      chapters: roleResult.chapters,
      chapterDAG: dagResult.dag,
      tocPages: boundaryResult.tocPages,
      totalPages: mainDoc.totalPages,
    });

  } catch (error: any) {
    console.error('[Skim] Error:', error);
    return NextResponse.json(
      { error: error.message || '粗读分析失败' },
      { status: 500 }
    );
  }
}

// ==================== 辅助函数 ====================

/**
 * 将 ChapterBoundary 转换为 RawChapter
 */
function convertBoundariesToRawChapters(
  doc: PageParsedDocument,
  boundaries: ChapterBoundary[]
): RawChapter[] {
  const rawChapters: RawChapter[] = [];

  for (let i = 0; i < boundaries.length; i++) {
    const boundary = boundaries[i];
    const chapterContent = getChapterContent(doc, boundary);
    const wordCount = getChapterWordCount(doc, boundary);
    const isLongChapter = wordCount > LONG_CHAPTER_THRESHOLD;
    const firstParagraph = chapterContent.substring(0, 500);

    rawChapters.push({
      title: boundary.title,
      level: boundary.level,
      orderIndex: i + 1,
      firstParagraph,
      contentFull: isLongChapter 
        ? chapterContent.substring(0, LONG_CHAPTER_THRESHOLD) + '\n\n[内容过长，已截断...]'
        : chapterContent,
      startPage: boundary.startPage,
      endPage: boundary.endPage,
    });

    // 递归处理子章节
    if (boundary.sections && boundary.sections.length > 0) {
      const subChapters = convertBoundariesToRawChapters(doc, boundary.sections);
      rawChapters.push(...subChapters);
    }
  }

  return rawChapters;
}

/**
 * 保存章节到数据库（带层级关系）
 */
async function saveChaptersToDb(
  knowledgeBaseId: string,
  chapters: ChapterMeta[],
  thesis: BookThesis
) {
  // 先删除旧的章节
  await prisma.teachingChapter.deleteMany({
    where: { knowledgeBaseId },
  });

  // 用于追踪各层级的最近父级
  const parentStack: Array<{ id: string; level: number }> = [];
  const savedChapters: Array<{ id: string; level: number; tempId: string }> = [];

  // 第一遍：创建所有章节，先不设置 parentId
  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];
    
    const created = await prisma.teachingChapter.create({
      data: {
        knowledgeBaseId,
        title: chapter.title,
        level: chapter.level,
        parentId: null, // 先设为 null，后面更新
        orderIndex: chapter.orderIndex,
        contentPreview: chapter.contentPreview?.substring(0, 500),
        contentFull: chapter.contentFull,
        metadata: JSON.stringify({
          role: chapter.role,
          goal: chapter.goal,
          keyConcepts: chapter.keyConcepts,
          dependencies: chapter.dependencies,
          startPage: chapter.startPage,
          endPage: chapter.endPage,
          bookTitle: thesis.title,
          knowledgeType: thesis.knowledgeType,
        }),
        analyzed: true,
        summary: chapter.goal,
      },
    });

    savedChapters.push({
      id: created.id,
      level: chapter.level,
      tempId: chapter.id,
    });
  }

  // 第二遍：设置 parentId（根据 level 推断父子关系）
  console.log(`[SaveChapters] Processing ${savedChapters.length} chapters for parent-child relationships`);
  console.log(`[SaveChapters] Level distribution:`, savedChapters.map(c => c.level).join(','));
  
  let updatedCount = 0;
  for (let i = 0; i < savedChapters.length; i++) {
    const current = savedChapters[i];
    
    // 找到当前章节的父级：往回找第一个 level 比自己小的
    let parentId: string | null = null;
    
    if (current.level > 1) {
      for (let j = i - 1; j >= 0; j--) {
        if (savedChapters[j].level < current.level) {
          parentId = savedChapters[j].id;
          break;
        }
      }
    }
    
    if (parentId) {
      await prisma.teachingChapter.update({
        where: { id: current.id },
        data: { parentId },
      });
      updatedCount++;
    }
  }
  console.log(`[SaveChapters] Updated ${updatedCount} chapters with parentId`)

  // 更新知识库信息
  await prisma.knowledgeBase.update({
    where: { id: knowledgeBaseId },
    data: {
      description: thesis.summary || thesis.topic,
    },
  });
}

