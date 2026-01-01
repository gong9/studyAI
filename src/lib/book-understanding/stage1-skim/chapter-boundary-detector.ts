/**
 * 章节边界识别器
 * 
 * 职责：
 * - 分析按页解析的文档，识别章节边界
 * - 通过 LLM 分析目录页 + 正文特征
 * - 输出带页码边界的章节结构
 * 
 * 原则：结构先行，精确定位
 */

import { OpenAI } from '@llamaindex/openai';
import { configureLLM } from '../../llm/config';
import type { PageParsedDocument } from '../../document-parser';
import { isLikelyTocPage, isLikelyChapterStart, getPageRangeContent } from '../../document-parser';

// ==================== 类型定义 ====================

/** 章节边界 */
export interface ChapterBoundary {
  /** 章节标题 */
  title: string;
  /** 层级：1=章, 2=节, 3=小节 */
  level: number;
  /** 起始页（含） */
  startPage: number;
  /** 结束页（含） */
  endPage: number;
  /** 嵌套的子章节 */
  sections?: ChapterBoundary[];
}

/** 检测器输入 */
export interface BoundaryDetectorInput {
  /** 按页解析的文档 */
  document: PageParsedDocument;
  /** 最大分析页数（默认50，用于限制目录和首章分析） */
  maxAnalysisPages?: number;
}

/** 检测器输出 */
export interface BoundaryDetectorOutput {
  success: boolean;
  /** 检测到的章节边界 */
  chapters: ChapterBoundary[];
  /** 目录页位置（如果找到） */
  tocPages?: number[];
  error?: string;
}

// ==================== Prompt ====================

const TOC_ANALYSIS_PROMPT = `你是一位文档结构分析专家。请分析以下文档内容，识别其章节结构和页码边界。

## 文档内容（前几页）
{content}

## 任务
1. 识别目录页（Table of Contents），提取章节层级结构
2. 仔细观察目录中的缩进关系，缩进的条目是其上方未缩进条目的子章节
3. 对每个章节，确定其起始页和结束页

## 如何判断层级
- 目录中**无缩进或顶格**的条目是 level=1（主章节）
- 目录中**有一级缩进**的条目是 level=2（子章节），它们属于其上方最近的 level=1 章节
- 目录中**有二级缩进**的条目是 level=3（小节），它们属于其上方最近的 level=2 章节

## 输出格式 (JSON)
{
  "hasToc": true,
  "tocPages": [2, 3],
  "chapters": [
    {
      "title": "What is an agent?",
      "level": 1,
      "startPage": 5,
      "endPage": 11,
      "sections": [
        {
          "title": "The model",
          "level": 2,
          "startPage": 6,
          "endPage": 6
        },
        {
          "title": "The tools",
          "level": 2,
          "startPage": 7,
          "endPage": 7
        }
      ]
    },
    {
      "title": "Tools: Our keys to the outside world",
      "level": 1,
      "startPage": 12,
      "endPage": 32,
      "sections": [
        {
          "title": "Extensions",
          "level": 2,
          "startPage": 13,
          "endPage": 14
        }
      ]
    }
  ]
}

## 重要
1. **必须识别层级关系**：观察目录中的缩进，缩进的条目是子章节，放在 sections 数组里
2. 页码必须是具体数字
3. level: 1 表示主章节，2 表示子章节，3 表示小节
4. Introduction、Summary、Endnotes 等通常是 level=1 的独立章节
5. 如果某条目有缩进，它必须放在其父章节的 sections 数组中，而不是顶级 chapters 数组

请直接输出 JSON，不要包含其他文字。`;

const BOUNDARY_REFINEMENT_PROMPT = `请根据以下页面内容，验证并修正章节的起止页码。

## 待验证章节
{chapterInfo}

## 相关页面内容
{pageContent}

## 任务
验证章节的起止页是否正确。如果发现错误，请修正。

## 输出格式 (JSON)
{
  "title": "章节标题",
  "startPage": 实际起始页,
  "endPage": 实际结束页,
  "confidence": 0.9
}

请直接输出 JSON。`;

// ==================== 核心函数 ====================

/**
 * 检测章节边界
 */
export async function detectChapterBoundaries(
  input: BoundaryDetectorInput
): Promise<BoundaryDetectorOutput> {
  try {
    configureLLM();

    const { document, maxAnalysisPages = 50 } = input;
    const { pages, totalPages } = document;

    if (pages.length === 0) {
      return {
        success: false,
        chapters: [],
        error: '文档没有可解析的页面',
      };
    }

    const llm = new OpenAI({
      model: process.env.OPENAI_MODEL || 'qwen-plus',
      apiKey: process.env.OPENAI_API_KEY!,
      baseURL: process.env.OPENAI_API_BASE || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });

    console.log(`[BoundaryDetector] Analyzing ${totalPages} pages document`);

    // 步骤1：寻找目录页
    const tocResult = await findTableOfContents(document, llm, maxAnalysisPages);

    let chapters: ChapterBoundary[] = [];

    if (tocResult.hasToc && tocResult.chapters.length > 0) {
      // 有目录：使用目录信息
      console.log(`[BoundaryDetector] Found TOC at pages: ${tocResult.tocPages?.join(', ')}`);
      chapters = tocResult.chapters;
      
      // 步骤2：验证和修正边界
      chapters = await refineBoundaries(document, chapters, llm);
    } else {
      // 无目录：通过正文特征识别
      console.log('[BoundaryDetector] No TOC found, detecting from content');
      chapters = await detectFromContent(document, llm);
    }

    // 步骤3：填充缺失的 endPage
    chapters = fillMissingEndPages(chapters, totalPages);

    console.log(`[BoundaryDetector] Detected ${chapters.length} chapters`);

    return {
      success: true,
      chapters,
      tocPages: tocResult.tocPages,
    };
  } catch (error: any) {
    console.error('[BoundaryDetector] Error:', error);
    return {
      success: false,
      chapters: [],
      error: error.message || '章节边界检测失败',
    };
  }
}

// ==================== 步骤函数 ====================

/**
 * 寻找并解析目录页
 */
async function findTableOfContents(
  document: PageParsedDocument,
  llm: OpenAI,
  maxPages: number
): Promise<{ hasToc: boolean; tocPages?: number[]; chapters: ChapterBoundary[] }> {
  const { pages } = document;
  
  // 只分析前 N 页
  const analysisPages = pages.slice(0, Math.min(maxPages, pages.length));
  
  // 快速检测可能的目录页
  const potentialTocPages: number[] = [];
  for (const page of analysisPages) {
    if (isLikelyTocPage(page.text)) {
      potentialTocPages.push(page.pageNumber);
    }
  }

  // 构建分析内容（前 30 页或更少）
  const contentForAnalysis = analysisPages
    .slice(0, 30)
    .map(p => `=== 第${p.pageNumber}页 ===\n${p.text.substring(0, 2000)}`)
    .join('\n\n');

  // 内容太短，无法分析
  if (contentForAnalysis.length < 200) {
    return { hasToc: false, chapters: [] };
  }

  const prompt = TOC_ANALYSIS_PROMPT.replace('{content}', contentForAnalysis);

  try {
    const response = await llm.complete({ prompt });
    const text = response.text.trim();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { hasToc: false, chapters: [] };
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      hasToc: !!parsed.hasToc,
      tocPages: parsed.tocPages || potentialTocPages,
      chapters: parseChaptersFromLLM(parsed.chapters || []),
    };
  } catch (e) {
    console.error('[BoundaryDetector] TOC analysis failed:', e);
    return { hasToc: false, chapters: [] };
  }
}

/**
 * 从正文内容检测章节
 */
async function detectFromContent(
  document: PageParsedDocument,
  llm: OpenAI
): Promise<ChapterBoundary[]> {
  const { pages } = document;
  const chapters: ChapterBoundary[] = [];

  // 找出所有可能的章节起始页
  const chapterStartPages: Array<{ pageNumber: number; title: string }> = [];

  for (const page of pages) {
    if (isLikelyChapterStart(page.text)) {
      // 提取标题
      const titleMatch = page.text.match(
        /^(第[一二三四五六七八九十\d]+章\s*.+|Chapter\s+\d+.+|第[一二三四五六七八九十\d]+节\s*.+)/im
      );
      if (titleMatch) {
        chapterStartPages.push({
          pageNumber: page.pageNumber,
          title: titleMatch[1].trim(),
        });
      }
    }
  }

  // 根据检测到的起始页构建章节
  for (let i = 0; i < chapterStartPages.length; i++) {
    const current = chapterStartPages[i];
    const next = chapterStartPages[i + 1];

    const isSection = /^(第[一二三四五六七八九十\d]+节|\d+\.\d+)/.test(current.title);

    chapters.push({
      title: current.title,
      level: isSection ? 2 : 1,
      startPage: current.pageNumber,
      endPage: next ? next.pageNumber - 1 : document.totalPages,
    });
  }

  // 如果没有检测到章节，创建默认
  if (chapters.length === 0) {
    chapters.push({
      title: '全文',
      level: 1,
      startPage: 1,
      endPage: document.totalPages,
    });
  }

  return chapters;
}

/**
 * 验证和修正边界
 */
async function refineBoundaries(
  document: PageParsedDocument,
  chapters: ChapterBoundary[],
  llm: OpenAI
): Promise<ChapterBoundary[]> {
  // 对大型文档，只验证关键章节的边界
  const refined: ChapterBoundary[] = [];

  for (const chapter of chapters) {
    // 获取起始页附近的内容用于验证
    const startContent = getPageRangeContent(
      document,
      Math.max(1, chapter.startPage - 1),
      Math.min(document.totalPages, chapter.startPage + 1)
    );

    // 简单验证：检查起始页是否包含章节标题
    const titleKeyword = chapter.title.substring(0, 10);
    const pageWithTitle = document.pages.find(
      p => p.pageNumber >= chapter.startPage - 2 &&
           p.pageNumber <= chapter.startPage + 2 &&
           p.text.includes(titleKeyword)
    );

    if (pageWithTitle && pageWithTitle.pageNumber !== chapter.startPage) {
      console.log(`[BoundaryDetector] Adjusting "${chapter.title}" start: ${chapter.startPage} -> ${pageWithTitle.pageNumber}`);
      chapter.startPage = pageWithTitle.pageNumber;
    }

    // 递归处理子章节
    if (chapter.sections && chapter.sections.length > 0) {
      chapter.sections = await refineBoundaries(document, chapter.sections, llm);
    }

    refined.push(chapter);
  }

  return refined;
}

/**
 * 填充缺失的 endPage
 */
function fillMissingEndPages(chapters: ChapterBoundary[], totalPages: number): ChapterBoundary[] {
  const sorted = [...chapters].sort((a, b) => a.startPage - b.startPage);

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];

    // 如果没有 endPage 或者 endPage 不合理
    if (!current.endPage || current.endPage < current.startPage) {
      current.endPage = next ? next.startPage - 1 : totalPages;
    }

    // 确保 endPage 不超过下一章的 startPage
    if (next && current.endPage >= next.startPage) {
      current.endPage = next.startPage - 1;
    }

    // 递归处理子章节
    if (current.sections && current.sections.length > 0) {
      current.sections = fillMissingEndPages(current.sections, current.endPage);
    }
  }

  return sorted;
}

// ==================== 辅助函数 ====================

/**
 * 解析 LLM 返回的章节数据
 */
function parseChaptersFromLLM(chaptersData: any[]): ChapterBoundary[] {
  if (!Array.isArray(chaptersData)) return [];

  const parsed = chaptersData.map(ch => ({
    title: ch.title || '未知章节',
    level: ch.level || 1,
    startPage: ch.startPage || 1,
    endPage: ch.endPage || 0,
    sections: ch.sections ? parseChaptersFromLLM(ch.sections) : undefined,
  }));

  // 检查是否已经有嵌套结构
  const hasNestedSections = parsed.some(ch => ch.sections && ch.sections.length > 0);
  
  // 如果 LLM 返回的是扁平列表（带 level 但无 sections），需要转换成嵌套结构
  if (!hasNestedSections && parsed.some(ch => ch.level > 1)) {
    console.log('[BoundaryDetector] LLM returned flat list with levels, converting to nested structure...');
    return buildNestedStructure(parsed);
  }

  return parsed;
}

/**
 * 将扁平的带 level 列表转换为嵌套结构
 * 
 * 输入: [{title: "A", level: 1}, {title: "B", level: 2}, {title: "C", level: 3}, {title: "D", level: 2}, {title: "E", level: 1}]
 * 输出: [
 *   {title: "A", level: 1, sections: [
 *     {title: "B", level: 2, sections: [{title: "C", level: 3}]},
 *     {title: "D", level: 2}
 *   ]},
 *   {title: "E", level: 1}
 * ]
 */
function buildNestedStructure(flatChapters: ChapterBoundary[]): ChapterBoundary[] {
  if (flatChapters.length === 0) return [];

  const result: ChapterBoundary[] = [];
  // 栈：存储各层级的当前父节点
  const stack: ChapterBoundary[] = [];

  for (const chapter of flatChapters) {
    const newChapter: ChapterBoundary = {
      ...chapter,
      sections: [],
    };

    // 弹出栈中 level >= 当前 level 的所有节点
    while (stack.length > 0 && stack[stack.length - 1].level >= chapter.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      // 没有父节点，是顶级章节
      result.push(newChapter);
    } else {
      // 添加到栈顶节点的 sections 中
      const parent = stack[stack.length - 1];
      if (!parent.sections) parent.sections = [];
      parent.sections.push(newChapter);
    }

    // 将当前节点压入栈
    stack.push(newChapter);
  }

  // 清理空的 sections 数组
  const cleanSections = (chapters: ChapterBoundary[]) => {
    for (const ch of chapters) {
      if (ch.sections && ch.sections.length === 0) {
        delete ch.sections;
      } else if (ch.sections) {
        cleanSections(ch.sections);
      }
    }
  };
  cleanSections(result);

  console.log(`[BoundaryDetector] Converted to nested: ${result.length} top-level chapters`);
  return result;
}

/**
 * 扁平化章节结构（用于遍历）
 */
export function flattenChapters(chapters: ChapterBoundary[]): ChapterBoundary[] {
  const result: ChapterBoundary[] = [];

  for (const chapter of chapters) {
    result.push(chapter);
    if (chapter.sections && chapter.sections.length > 0) {
      result.push(...flattenChapters(chapter.sections));
    }
  }

  return result;
}

/**
 * 获取章节的内容
 */
export function getChapterContent(
  document: PageParsedDocument,
  chapter: ChapterBoundary
): string {
  return getPageRangeContent(document, chapter.startPage, chapter.endPage);
}

/**
 * 统计章节字数
 */
export function getChapterWordCount(
  document: PageParsedDocument,
  chapter: ChapterBoundary
): number {
  return document.pages
    .filter(p => p.pageNumber >= chapter.startPage && p.pageNumber <= chapter.endPage)
    .reduce((sum, p) => sum + p.wordCount, 0);
}

// ==================== 后处理：页码推断层级 ====================

/**
 * 根据页码差距推断层级关系
 * 
 * 原理：
 * - 如果两个连续条目的页码差距小（≤ 3 页），后者可能是前者的子章节
 * - 如果页码差距大，说明是新的大章节
 * 
 * @param chapters 扁平的章节列表（所有 level=1）
 * @param pageGapThreshold 页码差距阈值（默认 4，超过这个差距认为是新大章节）
 */
export function inferHierarchyFromPageGaps(
  chapters: ChapterBoundary[],
  pageGapThreshold: number = 4
): ChapterBoundary[] {
  if (chapters.length <= 1) return chapters;

  // 按起始页排序
  const sorted = [...chapters].sort((a, b) => a.startPage - b.startPage);

  // 结果数组（只包含顶级章节）
  const result: ChapterBoundary[] = [];
  
  // 当前父级章节栈
  const parentStack: ChapterBoundary[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];

    // 计算到下一个章节的页码差距
    const pageGap = next ? next.startPage - current.startPage : Infinity;

    // 决定当前章节的层级
    if (parentStack.length === 0) {
      // 第一个章节，设为 level 1
      current.level = 1;
      current.sections = [];
      result.push(current);
      
      // 如果下一个页码差距小，当前章节可能有子章节
      if (pageGap < pageGapThreshold) {
        parentStack.push(current);
      }
    } else {
      // 检查是否应该退出当前父级
      const currentParent = parentStack[parentStack.length - 1];
      
      // 如果当前章节的起始页超出了父级的"预期范围"，退栈
      // 预期范围 = 父级起始页 + 一些阈值，或者用 endPage
      while (parentStack.length > 0) {
        const parent = parentStack[parentStack.length - 1];
        // 如果当前章节距离父级太远，或者页码大于父级的 endPage
        const distanceFromParent = current.startPage - parent.startPage;
        if (distanceFromParent >= pageGapThreshold * (parentStack.length + 1) || 
            (parent.endPage > 0 && current.startPage > parent.endPage)) {
          parentStack.pop();
        } else {
          break;
        }
      }

      if (parentStack.length > 0) {
        // 添加为子章节
        const parent = parentStack[parentStack.length - 1];
        current.level = parent.level + 1;
        current.sections = [];
        
        if (!parent.sections) parent.sections = [];
        parent.sections.push(current);

        // 如果下一个页码差距小，当前章节可能也有子章节
        if (pageGap < pageGapThreshold && pageGap > 0) {
          parentStack.push(current);
        }
      } else {
        // 新的顶级章节
        current.level = 1;
        current.sections = [];
        result.push(current);

        if (pageGap < pageGapThreshold) {
          parentStack.push(current);
        }
      }
    }
  }

  // 重新计算每个章节的 endPage
  recalculateEndPages(result, sorted[sorted.length - 1]?.endPage || 100);

  console.log(`[HierarchyInfer] Inferred hierarchy: ${result.length} top-level chapters`);

  return result;
}

/**
 * 重新计算结束页
 */
function recalculateEndPages(chapters: ChapterBoundary[], maxPage: number): void {
  for (let i = 0; i < chapters.length; i++) {
    const current = chapters[i];
    const next = chapters[i + 1];

    // 如果有子章节，递归处理
    if (current.sections && current.sections.length > 0) {
      // 子章节的最大页码就是父章节的结束页
      const childMaxPage = next ? next.startPage - 1 : maxPage;
      recalculateEndPages(current.sections, childMaxPage);
      
      // 父章节的结束页 = 最后一个子章节的结束页
      const lastChild = current.sections[current.sections.length - 1];
      current.endPage = lastChild.endPage;
    } else {
      // 没有子章节，结束页 = 下一章起始页 - 1
      current.endPage = next ? next.startPage - 1 : maxPage;
    }
  }
}

