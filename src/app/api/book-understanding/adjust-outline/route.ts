/**
 * POST /api/book-understanding/adjust-outline
 * 
 * 大纲调整 API - 支持多模态输入
 * 
 * 功能：
 * - 接收用户输入（文字或图片）
 * - 使用多模态模型识别目录结构
 * - 对比新旧大纲，智能增量更新
 * - 返回更新后的章节结构
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getVisionModelConfig } from '@/lib/llm/config';
import { OpenAI } from '@llamaindex/openai';
import { 
  type ChapterBoundary 
} from '@/lib/book-understanding/stage1-skim/chapter-boundary-detector';
import { classifyChapterRoles, type RawChapter } from '@/lib/book-understanding/stage1-skim/chapter-role-classifier';
import { buildChapterDAG } from '@/lib/book-understanding/stage1-skim/chapter-dependency';
import type { ChapterMeta, BookThesis } from '@/lib/book-understanding/types';

export const maxDuration = 60;

// ==================== Prompt ====================

const OUTLINE_RECOGNITION_PROMPT = `你是一位文档结构分析专家。请分析以下内容，识别其章节目录结构。

## 输入内容
{input}

## 任务
1. 识别目录中的所有章节标题
2. 根据缩进、编号、格式等判断层级关系
3. 如果有页码信息，提取页码

## 如何判断层级
- 无缩进或顶格的条目是 level=1（主章节）
- 有一级缩进的条目是 level=2（子章节）
- 有二级缩进的条目是 level=3（小节）
- 编号格式也可以判断：1, 2, 3 是 level=1；1.1, 1.2 是 level=2；1.1.1 是 level=3

## 输出格式 (JSON)
{
  "chapters": [
    {
      "title": "章节标题",
      "level": 1,
      "startPage": 5,
      "sections": [
        {
          "title": "子章节标题",
          "level": 2,
          "startPage": 6
        }
      ]
    }
  ]
}

## 重要
1. 必须识别层级关系，缩进的条目放在父级的 sections 数组中
2. 如果没有页码信息，startPage 设为 0
3. level: 1 表示主章节，2 表示子章节，3 表示小节

请直接输出 JSON，不要包含其他文字。`;

const IMAGE_OUTLINE_PROMPT = `你是一位文档结构分析专家。请分析这张目录截图，识别其章节结构。

## 任务
1. 识别图片中的所有章节标题
2. 根据视觉上的缩进、格式判断层级关系
3. 提取页码信息（如果可见）

## 如何判断层级
- 视觉上无缩进或顶格的条目是 level=1（主章节）
- 有缩进的条目是 level=2（子章节）
- 更深缩进的条目是 level=3（小节）

## 输出格式 (JSON)
{
  "chapters": [
    {
      "title": "章节标题",
      "level": 1,
      "startPage": 5,
      "sections": [
        {
          "title": "子章节标题",
          "level": 2,
          "startPage": 6
        }
      ]
    }
  ]
}

请直接输出 JSON，不要包含其他文字。`;

// ==================== 主处理函数 ====================

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const body = await request.json();
    const { knowledgeBaseId, text, image, applyChanges = false } = body;

    if (!knowledgeBaseId) {
      return NextResponse.json({ error: '缺少 knowledgeBaseId' }, { status: 400 });
    }

    if (!text && !image) {
      return NextResponse.json({ error: '请提供文字或图片输入' }, { status: 400 });
    }

    // 验证知识库
    const kb = await prisma.knowledgeBase.findFirst({
      where: {
        id: knowledgeBaseId,
        userId: (session.user as any).id,
      },
    });

    if (!kb) {
      return NextResponse.json({ error: '知识库不存在' }, { status: 404 });
    }

    console.log(`[AdjustOutline] Starting for KB: ${knowledgeBaseId}, input type: ${image ? 'image' : 'text'}`);

    // ========== 步骤1：识别新大纲结构 ==========
    const newChapters = await recognizeOutline({ text, image });
    
    if (newChapters.length === 0) {
      return NextResponse.json({ error: '无法识别目录结构' }, { status: 400 });
    }

    console.log(`[AdjustOutline] Recognized ${newChapters.length} top-level chapters`);

    // ========== 步骤2：获取现有大纲 ==========
    const existingChapters = await prisma.teachingChapter.findMany({
      where: { knowledgeBaseId },
      orderBy: { orderIndex: 'asc' },
    });

    // ========== 步骤3：对比差异 ==========
    const diff = compareOutlines(existingChapters, newChapters);
    console.log(`[AdjustOutline] Diff: added=${diff.added.length}, removed=${diff.removed.length}, modified=${diff.modified.length}, unchanged=${diff.unchanged.length}`);

    // 如果只是预览，返回差异信息
    if (!applyChanges) {
      return NextResponse.json({
        success: true,
        preview: true,
        newChapters,
        diff,
      });
    }

    // ========== 步骤4：应用变更 ==========
    console.log('[AdjustOutline] Applying changes...');

    // 获取书籍论点信息（用于角色分类）
    const thesis = await getBookThesis(knowledgeBaseId);

    // 只对新增和修改的章节进行角色分类
    const chaptersToClassify = [...diff.added, ...diff.modified];
    let classifiedChapters: ChapterMeta[] = [];

    if (chaptersToClassify.length > 0) {
      const rawChapters = chaptersToClassify.map((ch, i) => ({
        title: ch.title,
        level: ch.level,
        orderIndex: i + 1,
        firstParagraph: '',
        contentFull: '',
        startPage: ch.startPage,
        endPage: ch.endPage,
      }));

      const roleResult = await classifyChapterRoles({
        thesis,
        chapters: rawChapters,
      });

      if (roleResult.success) {
        classifiedChapters = roleResult.chapters;
      }
    }

    // 保存更新后的章节
    await saveUpdatedChapters(knowledgeBaseId, newChapters, classifiedChapters, thesis);

    // 重建 DAG
    const allChapters = await getAllChaptersAsMeta(knowledgeBaseId);
    const dagResult = await buildChapterDAG({
      thesis,
      chapters: allChapters,
    });

    console.log(`[AdjustOutline] Completed: ${newChapters.length} chapters saved`);

    return NextResponse.json({
      success: true,
      applied: true,
      chapters: newChapters,
      diff,
      chapterDAG: dagResult.dag,
    });

  } catch (error: any) {
    console.error('[AdjustOutline] Error:', error);
    return NextResponse.json(
      { error: error.message || '大纲调整失败' },
      { status: 500 }
    );
  }
}

// ==================== 辅助函数 ====================

/**
 * 识别大纲结构（支持文字和图片）
 */
async function recognizeOutline(input: { text?: string; image?: string }): Promise<ChapterBoundary[]> {
  const config = getVisionModelConfig();
  
  const llm = new OpenAI({
    apiKey: config.apiKey,
    model: config.model,
    baseURL: config.baseURL,
  });

  let response;

  if (input.image) {
    // 图片输入 - 使用多模态
    console.log('[AdjustOutline] Using vision model for image input');
    
    // 构建多模态消息
    const messages = [
      {
        role: 'user' as const,
        content: [
          { type: 'text' as const, text: IMAGE_OUTLINE_PROMPT },
          { 
            type: 'image_url' as const, 
            image_url: { 
              url: input.image.startsWith('data:') 
                ? input.image 
                : `data:image/png;base64,${input.image}` 
            } 
          },
        ],
      },
    ];

    response = await llm.chat({ messages });
  } else {
    // 文字输入
    console.log('[AdjustOutline] Using text input');
    const prompt = OUTLINE_RECOGNITION_PROMPT.replace('{input}', input.text || '');
    response = await llm.complete({ prompt });
  }

  const text = response.message?.content?.toString() || response.text || '';
  
  // 解析 JSON
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('[AdjustOutline] Failed to parse JSON from response');
    return [];
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return parseChaptersFromRecognition(parsed.chapters || []);
  } catch (e) {
    console.error('[AdjustOutline] JSON parse error:', e);
    return [];
  }
}

/**
 * 解析识别结果为 ChapterBoundary
 */
function parseChaptersFromRecognition(chaptersData: any[]): ChapterBoundary[] {
  if (!Array.isArray(chaptersData)) return [];

  return chaptersData.map(ch => ({
    title: ch.title || '未知章节',
    level: ch.level || 1,
    startPage: ch.startPage || 0,
    endPage: ch.endPage || 0,
    sections: ch.sections ? parseChaptersFromRecognition(ch.sections) : undefined,
  }));
}

/**
 * 对比新旧大纲
 */
interface OutlineDiff {
  added: ChapterBoundary[];
  removed: { id: string; title: string }[];
  modified: ChapterBoundary[];
  unchanged: ChapterBoundary[];
}

function compareOutlines(
  existing: any[],
  newChapters: ChapterBoundary[]
): OutlineDiff {
  const diff: OutlineDiff = {
    added: [],
    removed: [],
    modified: [],
    unchanged: [],
  };

  // 扁平化新章节用于对比
  const flatNewChapters = flattenChapters(newChapters);
  const existingTitles = new Set(existing.map(ch => ch.title.toLowerCase().trim()));
  const newTitles = new Set(flatNewChapters.map(ch => ch.title.toLowerCase().trim()));

  // 找出新增的章节
  for (const ch of flatNewChapters) {
    const titleKey = ch.title.toLowerCase().trim();
    if (!existingTitles.has(titleKey)) {
      diff.added.push(ch);
    } else {
      // 检查是否有修改（层级变化等）
      const existingCh = existing.find(e => e.title.toLowerCase().trim() === titleKey);
      if (existingCh && existingCh.level !== ch.level) {
        diff.modified.push(ch);
      } else {
        diff.unchanged.push(ch);
      }
    }
  }

  // 找出删除的章节
  for (const ch of existing) {
    const titleKey = ch.title.toLowerCase().trim();
    if (!newTitles.has(titleKey)) {
      diff.removed.push({ id: ch.id, title: ch.title });
    }
  }

  return diff;
}

/**
 * 扁平化章节结构
 */
function flattenChapters(chapters: ChapterBoundary[]): ChapterBoundary[] {
  const result: ChapterBoundary[] = [];
  for (const ch of chapters) {
    result.push(ch);
    if (ch.sections && ch.sections.length > 0) {
      result.push(...flattenChapters(ch.sections));
    }
  }
  return result;
}

/**
 * 获取书籍论点信息
 */
async function getBookThesis(knowledgeBaseId: string): Promise<BookThesis> {
  const kb = await prisma.knowledgeBase.findUnique({
    where: { id: knowledgeBaseId },
  });

  return {
    title: kb?.name || '未知书籍',
    topic: kb?.description || '',
    audience: '通用读者',
    knowledgeType: 'technical',
    summary: kb?.description || '',
  };
}

/**
 * 保存更新后的章节
 */
async function saveUpdatedChapters(
  knowledgeBaseId: string,
  newChapters: ChapterBoundary[],
  classifiedChapters: ChapterMeta[],
  thesis: BookThesis
) {
  // 删除所有旧章节
  await prisma.teachingChapter.deleteMany({
    where: { knowledgeBaseId },
  });

  // 创建分类信息映射
  const classificationMap = new Map<string, ChapterMeta>();
  for (const ch of classifiedChapters) {
    classificationMap.set(ch.title.toLowerCase().trim(), ch);
  }

  // 递归保存章节
  let orderIndex = 0;
  
  const saveRecursive = async (
    chapters: ChapterBoundary[],
    parentId: string | null
  ) => {
    for (const ch of chapters) {
      orderIndex++;
      const classification = classificationMap.get(ch.title.toLowerCase().trim());
      
      const created = await prisma.teachingChapter.create({
        data: {
          knowledgeBaseId,
          title: ch.title,
          level: ch.level,
          parentId,
          orderIndex,
          contentPreview: '',
          contentFull: '',
          metadata: JSON.stringify({
            role: classification?.role || 'core',
            goal: classification?.goal || '',
            keyConcepts: classification?.keyConcepts || [],
            dependencies: classification?.dependencies || [],
            startPage: ch.startPage,
            endPage: ch.endPage,
            bookTitle: thesis.title,
            knowledgeType: thesis.knowledgeType,
          }),
          analyzed: true,
          summary: classification?.goal || '',
        },
      });

      if (ch.sections && ch.sections.length > 0) {
        await saveRecursive(ch.sections, created.id);
      }
    }
  };

  await saveRecursive(newChapters, null);
}

/**
 * 获取所有章节作为 ChapterMeta
 */
async function getAllChaptersAsMeta(knowledgeBaseId: string): Promise<ChapterMeta[]> {
  const chapters = await prisma.teachingChapter.findMany({
    where: { knowledgeBaseId },
    orderBy: { orderIndex: 'asc' },
  });

  return chapters.map(ch => {
    let metadata: any = {};
    try {
      metadata = JSON.parse(ch.metadata as string || '{}');
    } catch {}

    return {
      id: ch.id,
      title: ch.title,
      level: ch.level,
      orderIndex: ch.orderIndex,
      role: metadata.role || 'core',
      goal: metadata.goal || '',
      keyConcepts: metadata.keyConcepts || [],
      dependencies: metadata.dependencies || [],
      contentPreview: ch.contentPreview || '',
      contentFull: ch.contentFull || '',
      startPage: metadata.startPage || 0,
      endPage: metadata.endPage || 0,
    };
  });
}

