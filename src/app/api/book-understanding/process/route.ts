/**
 * POST /api/book-understanding/process
 * 
 * 启动全书理解处理流程（链路B）
 * 
 * 新架构：
 * - 阶段0：按页解析PDF，保留页码结构
 * - 阶段1：LLM识别章节边界 → 分类角色 → 构建DAG
 * - 阶段2：知识图谱构建
 * - 阶段3：精读填充
 * - 阶段4：输出呈现
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// 文档解析（新）
import { parsePdfBufferByPage, type PageParsedDocument } from '@/lib/document-parser';

// 阶段1：粗读建结构
import { analyzeBook } from '@/lib/book-understanding/stage1-skim/book-analyzer';
import { 
  detectChapterBoundaries, 
  getChapterContent,
  getChapterWordCount,
  type ChapterBoundary 
} from '@/lib/book-understanding/stage1-skim/chapter-boundary-detector';
import { classifyChapterRoles, type RawChapter } from '@/lib/book-understanding/stage1-skim/chapter-role-classifier';
import { buildChapterDAG } from '@/lib/book-understanding/stage1-skim/chapter-dependency';

// 阶段2：知识图谱
import { extractConcepts } from '@/lib/book-understanding/stage2-kg/concept-extractor';
import { buildRelations } from '@/lib/book-understanding/stage2-kg/relation-builder';
import { weightConcepts } from '@/lib/book-understanding/stage2-kg/concept-weighter';

// 阶段3：精读填充
import { enrichConcepts } from '@/lib/book-understanding/stage3-deep-read/concept-enricher';
import { generateSectionContent } from '@/lib/book-understanding/stage3-deep-read/section-generator';

// 阶段4：输出
import { generateManuscript } from '@/lib/book-understanding/stage4-output/manuscript-generator';
import { generateCourseMap } from '@/lib/book-understanding/stage4-output/course-map';

import type { 
  ProcessingStatus,
  SkimResult,
  KGBuildResult,
  DeepReadResult,
  OutputResult
} from '@/lib/book-understanding/types';

import * as fs from 'fs-extra';
import * as path from 'path';

export const maxDuration = 300; // 5 分钟超时

// 超长章节阈值（字数）
const LONG_CHAPTER_THRESHOLD = 20000;
// 每批处理的章节数
const BATCH_SIZE = 5;

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

    // 创建处理会话
    const sessionId = `bu_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // SSE 流式返回进度
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendProgress = (status: ProcessingStatus, message: string, percent: number, data?: any) => {
          const event = `data: ${JSON.stringify({ status, message, percent, data })}\n\n`;
          controller.enqueue(encoder.encode(event));
        };

        try {
          // ========== 阶段0：按页解析文档 ==========
          sendProgress('stage1_skim', '阶段0：按页解析文档...', 5);
          
          const documents = await prisma.document.findMany({
            where: { knowledgeBaseId },
            select: { id: true, name: true, content: true, path: true },
          });

          // 解析所有PDF文档（保留页码结构）
          const parsedDocs: PageParsedDocument[] = [];
          let fullContent = '';

          for (const doc of documents) {
            const ext = path.extname(doc.name).toLowerCase();
            
            if (ext === '.pdf' && doc.path && await fs.pathExists(doc.path)) {
              // 使用新的按页解析器
              const buffer = await fs.readFile(doc.path);
              const parsed = await parsePdfBufferByPage(buffer, doc.name, {
                onProgress: (current, total) => {
                  sendProgress('stage1_skim', `解析 ${doc.name}: ${current}/${total} 页...`, 5 + (current / total) * 5);
                }
              });
              parsedDocs.push(parsed);
              fullContent += `\n\n=== ${doc.name} ===\n\n${parsed.fullText}`;
              
            } else if ((ext === '.txt' || ext === '.md') && doc.path && await fs.pathExists(doc.path)) {
              // 文本文件：模拟单页文档
              const content = await fs.readFile(doc.path, 'utf-8');
              parsedDocs.push({
                fileName: doc.name,
                totalPages: 1,
                pages: [{ pageNumber: 1, text: content, wordCount: content.length }],
                fullText: content,
              });
              fullContent += `\n\n=== ${doc.name} ===\n\n${content}`;
            } else if (doc.content) {
              // 已有内容：模拟单页文档
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
            throw new Error('文档内容为空');
          }

          // 选取主文档（页数最多的）用于结构分析
          const mainDoc = parsedDocs.reduce((a, b) => a.totalPages > b.totalPages ? a : b);


          // ========== 阶段1：粗读建结构 ==========
          sendProgress('stage1_skim', '阶段1：分析全书主题（RAG 检索关键内容）...', 12);
          
          const bookResult = await analyzeBook({ 
            knowledgeBaseId,  // 使用 RAG 检索前言/目录/结语
            content: fullContent,  // 备选：如果 RAG 失败用这个
          });
          if (!bookResult.success || !bookResult.thesis) {
            throw new Error(bookResult.error || '全书主题分析失败');
          }

          sendProgress('stage1_skim', '阶段1：识别章节边界（LLM分析目录+正文）...', 18);
          
          // 使用新的章节边界检测器
          const boundaryResult = await detectChapterBoundaries({
            document: mainDoc,
            maxAnalysisPages: 50,
          });
          
          if (!boundaryResult.success || boundaryResult.chapters.length === 0) {
            // 降级：使用传统正则方法
          }


          sendProgress('stage1_skim', '阶段1：提取章节内容并分类...', 25);
          
          // 将 ChapterBoundary 转换为 RawChapter（带完整内容）
          const rawChapters = convertBoundariesToRawChapters(mainDoc, boundaryResult.chapters);
          

          sendProgress('stage1_skim', '阶段1：批量分类章节角色...', 30);
          
          // 批量处理章节分类（每批 BATCH_SIZE 个）
          const roleResult = await classifyChapterRolesInBatches(
            bookResult.thesis,
            rawChapters,
            BATCH_SIZE,
            (current, total) => {
              const progress = 30 + (current / total) * 8;
              sendProgress('stage1_skim', `分类章节: ${current}/${total}...`, progress);
            }
          );

          if (!roleResult.success) {
            throw new Error(roleResult.error || '章节角色分类失败');
          }

          sendProgress('stage1_skim', '阶段1：构建章节依赖图...', 38);
          
          const dagResult = await buildChapterDAG({
            thesis: bookResult.thesis,
            chapters: roleResult.chapters,
          });
          if (!dagResult.success || !dagResult.dag) {
            throw new Error(dagResult.error || 'DAG 构建失败');
          }

          const skimResult: SkimResult = {
            thesis: bookResult.thesis,
            chapters: roleResult.chapters,
            chapterGraph: dagResult.dag,
          };

          sendProgress('stage1_skim', '阶段1 完成：全局结构已建立', 40, {
            thesis: skimResult.thesis.title,
            chapterCount: skimResult.chapters.length,
            tocPages: boundaryResult.tocPages,
          });

          // ========== 阶段2：知识图谱构建 ==========
          sendProgress('stage2_kg', '阶段2：抽取概念节点...', 45);
          
          const conceptResult = await extractConcepts({
            thesis: skimResult.thesis,
            chapters: skimResult.chapters,
          });
          if (!conceptResult.success) {
            throw new Error(conceptResult.error || '概念抽取失败');
          }

          sendProgress('stage2_kg', '阶段2：构建概念关系...', 55);
          
          const relationResult = await buildRelations({
            thesis: skimResult.thesis,
            chapters: skimResult.chapters,
            concepts: conceptResult.concepts,
          });
          if (!relationResult.success) {
            throw new Error(relationResult.error || '关系构建失败');
          }

          sendProgress('stage2_kg', '阶段2：计算概念权重...', 60);
          
          const weightResult = weightConcepts({
            concepts: conceptResult.concepts,
            relations: relationResult.relations,
            chapters: skimResult.chapters,
            bookId: knowledgeBaseId,
          });
          if (!weightResult.success || !weightResult.result) {
            throw new Error(weightResult.error || '概念加权失败');
          }

          const kgResult: KGBuildResult = weightResult.result;

          sendProgress('stage2_kg', '阶段2 完成：知识图谱已构建', 65, {
            conceptCount: kgResult.graph.concepts.length,
            relationCount: kgResult.graph.relations.length,
          });

          // ========== 阶段3：精读填充 ==========
          sendProgress('stage3_deepread', '阶段3：RAG 精读填充概念...', 70);
          
          const enrichResult = await enrichConcepts({
            knowledgeBaseId,
            graph: kgResult.graph,
            priorityQueue: kgResult.readingPriority,
            maxConcepts: 15,
          });
          if (!enrichResult.success) {
            throw new Error(enrichResult.error || '精读填充失败');
          }

          sendProgress('stage3_deepread', '阶段3：生成章节讲解内容...', 80);
          
          const sectionResult = await generateSectionContent({
            chapters: skimResult.chapters,
            graph: kgResult.graph,
            enrichedConcepts: enrichResult.enrichedConcepts,
          });
          if (!sectionResult.success || !sectionResult.result) {
            throw new Error(sectionResult.error || '章节内容生成失败');
          }

          const deepReadResult: DeepReadResult = sectionResult.result;

          sendProgress('stage3_deepread', '阶段3 完成：精读填充完成', 85, {
            enrichedCount: deepReadResult.enrichedConcepts.length,
            sectionCount: deepReadResult.sectionContents.length,
          });

          // ========== 阶段4：输出呈现 ==========
          sendProgress('stage4_output', '阶段4：生成讲稿...', 90);
          
          const manuscriptResult = generateManuscript({
            thesis: skimResult.thesis,
            chapters: skimResult.chapters,
            graph: kgResult.graph,
            deepReadResult,
          });
          if (!manuscriptResult.success || !manuscriptResult.manuscript) {
            throw new Error(manuscriptResult.error || '讲稿生成失败');
          }

          sendProgress('stage4_output', '阶段4：生成课程地图...', 95);
          
          const courseMapResult = generateCourseMap({
            chapters: skimResult.chapters,
            chapterDAG: skimResult.chapterGraph,
            graph: kgResult.graph,
            includeConcepts: true,
          });

          const outputResult: OutputResult = {
            manuscript: manuscriptResult.manuscript,
            courseMap: courseMapResult.courseMap!,
          };

          // ========== 完成 ==========
          sendProgress('completed', '全书理解完成！', 100, {
            sessionId,
            manuscript: {
              title: outputResult.manuscript.title,
              sectionCount: outputResult.manuscript.sections.length,
              totalDuration: outputResult.manuscript.totalDuration,
            },
            courseMap: {
              nodeCount: outputResult.courseMap.nodes.length,
              edgeCount: outputResult.courseMap.edges.length,
            },
          });

          // 发送最终结果
          const finalEvent = `data: ${JSON.stringify({
            status: 'completed',
            result: {
              sessionId,
              skimResult,
              kgResult,
              deepReadResult,
              outputResult,
            },
          })}\n\n`;
          controller.enqueue(encoder.encode(finalEvent));

        } catch (error: any) {
          console.error('[BookUnderstanding] Error:', error);
          const errorEvent = `data: ${JSON.stringify({
            status: 'failed',
            error: error.message || '处理失败',
          })}\n\n`;
          controller.enqueue(encoder.encode(errorEvent));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error: any) {
    console.error('[API] Book understanding error:', error);
    return NextResponse.json(
      { error: error.message || '处理失败' },
      { status: 500 }
    );
  }
}

// ==================== 辅助函数 ====================

/**
 * 将 ChapterBoundary 转换为 RawChapter（带完整内容）
 */
function convertBoundariesToRawChapters(
  doc: PageParsedDocument,
  boundaries: ChapterBoundary[]
): RawChapter[] {
  const rawChapters: RawChapter[] = [];

  for (let i = 0; i < boundaries.length; i++) {
    const boundary = boundaries[i];
    
    // 获取章节完整内容
    const chapterContent = getChapterContent(doc, boundary);
    const wordCount = getChapterWordCount(doc, boundary);
    
    // 判断是否为超长章节
    const isLongChapter = wordCount > LONG_CHAPTER_THRESHOLD;
    
    // 提取首段（用于快速预览）
    const firstParagraph = chapterContent.substring(0, 500);

    rawChapters.push({
      title: boundary.title,
      level: boundary.level,
      orderIndex: i + 1,
      firstParagraph,
      // 超长章节：只存储部分内容，后续用 RAG 补充
      contentFull: isLongChapter 
        ? chapterContent.substring(0, LONG_CHAPTER_THRESHOLD) + '\n\n[内容过长，已截断...]'
        : chapterContent,
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
 * 批量分类章节角色
 */
async function classifyChapterRolesInBatches(
  thesis: any,
  chapters: RawChapter[],
  batchSize: number,
  onProgress?: (current: number, total: number) => void
): Promise<{ success: boolean; chapters: any[]; error?: string }> {
  const allClassified: any[] = [];
  const totalBatches = Math.ceil(chapters.length / batchSize);

  for (let i = 0; i < chapters.length; i += batchSize) {
    const batch = chapters.slice(i, i + batchSize);
    const batchIndex = Math.floor(i / batchSize) + 1;


    const result = await classifyChapterRoles({
      thesis,
      chapters: batch,
    });

    if (!result.success) {
      return { success: false, chapters: allClassified, error: result.error };
    }

    allClassified.push(...result.chapters);

    if (onProgress) {
      onProgress(i + batch.length, chapters.length);
    }

    // 避免 API 限流
    if (i + batchSize < chapters.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return { success: true, chapters: allClassified };
}
