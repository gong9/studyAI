/**
 * 章节内容合并工具
 * 
 * 用于递归获取章节及其所有子章节的内容
 * 支持边界限制和超限提醒
 */

import { prisma } from '@/lib/prisma';

// ==================== 配置常量 ====================

/** 最大合并内容长度（字符）*/
export const MAX_MERGED_CONTENT_LENGTH = 50000;

/** 最大子章节数量 */
export const MAX_CHILD_CHAPTERS = 20;

/** 建议分章节生成的阈值（字符数）*/
export const SUGGEST_SPLIT_THRESHOLD = 30000;

// ==================== 类型定义 ====================

/** 合并结果 */
export interface MergedChapterContent {
  /** 是否成功 */
  success: boolean;
  /** 合并后的内容 */
  content: string;
  /** 包含的章节数量 */
  chapterCount: number;
  /** 总字符数 */
  totalLength: number;
  /** 是否被截断 */
  truncated: boolean;
  /** 警告信息（当内容过大时） */
  warning?: string;
  /** 建议（当内容过大时） */
  suggestion?: string;
  /** 子章节标题列表 */
  childTitles: string[];
}

/** 章节树节点 */
interface ChapterNode {
  id: string;
  title: string;
  level: number;
  orderIndex: number;
  contentFull: string | null;
  contentPreview: string | null;
  children?: ChapterNode[];
}

// ==================== 核心函数 ====================

/**
 * 递归获取章节及其所有子章节的合并内容
 * 
 * @param chapterId 章节ID
 * @param options 可选配置
 * @returns 合并后的章节内容及统计信息
 */
export async function getMergedChapterContent(
  chapterId: string,
  options: {
    /** 最大内容长度 */
    maxLength?: number;
    /** 最大子章节数量 */
    maxChildren?: number;
  } = {}
): Promise<MergedChapterContent> {
  const maxLength = options.maxLength ?? MAX_MERGED_CONTENT_LENGTH;
  const maxChildren = options.maxChildren ?? MAX_CHILD_CHAPTERS;

  try {
    // 1. 获取当前章节
    const rootChapter = await prisma.teachingChapter.findUnique({
      where: { id: chapterId },
      select: {
        id: true,
        title: true,
        level: true,
        orderIndex: true,
        contentFull: true,
        contentPreview: true,
      },
    });

    if (!rootChapter) {
      return {
        success: false,
        content: '',
        chapterCount: 0,
        totalLength: 0,
        truncated: false,
        warning: '章节不存在',
        childTitles: [],
      };
    }

    // 2. 递归获取所有子章节（无深度限制，获取到底）
    const allChapters = await fetchChapterTree(chapterId);
    const childTitles = allChapters.slice(1).map(ch => ch.title);

    // 3. 检查子章节数量
    if (allChapters.length > maxChildren + 1) {
      const suggestion = generateSplitSuggestion(allChapters);
      return {
        success: true,
        content: buildMergedContent(allChapters.slice(0, maxChildren + 1)),
        chapterCount: maxChildren + 1,
        totalLength: 0, // 将在下面计算
        truncated: true,
        warning: `章节包含 ${allChapters.length - 1} 个子章节，超过限制（最多 ${maxChildren} 个）。已截断部分子章节。`,
        suggestion,
        childTitles: childTitles.slice(0, maxChildren),
      };
    }

    // 4. 合并内容
    const mergedContent = buildMergedContent(allChapters);
    const totalLength = mergedContent.length;

    // 5. 检查内容长度
    if (totalLength > maxLength) {
      const truncatedContent = truncateContent(mergedContent, maxLength);
      const suggestion = generateSplitSuggestion(allChapters);
      
      return {
        success: true,
        content: truncatedContent,
        chapterCount: allChapters.length,
        totalLength,
        truncated: true,
        warning: `合并后内容共 ${totalLength} 字符，超过限制（最多 ${maxLength} 字符）。部分内容已截断。`,
        suggestion,
        childTitles,
      };
    }

    // 6. 检查是否建议分章节
    let warning: string | undefined;
    let suggestion: string | undefined;
    
    if (totalLength > SUGGEST_SPLIT_THRESHOLD && allChapters.length > 3) {
      warning = `该章节内容较多（${totalLength} 字符，${allChapters.length - 1} 个子章节）`;
      suggestion = generateSplitSuggestion(allChapters);
    }

    return {
      success: true,
      content: mergedContent,
      chapterCount: allChapters.length,
      totalLength,
      truncated: false,
      warning,
      suggestion,
      childTitles,
    };

  } catch (error: any) {
    console.error('[ChapterMerger] Error:', error);
    return {
      success: false,
      content: '',
      chapterCount: 0,
      totalLength: 0,
      truncated: false,
      warning: error.message || '获取章节内容失败',
      childTitles: [],
    };
  }
}

/**
 * 快速检查章节是否过大（不获取完整内容）
 */
export async function checkChapterSize(chapterId: string): Promise<{
  hasChildren: boolean;
  childCount: number;
  estimatedLength: number;
  isTooLarge: boolean;
  suggestion?: string;
}> {
  // 获取直接子章节数量
  const children = await prisma.teachingChapter.findMany({
    where: { parentId: chapterId },
    select: { id: true, title: true },
  });

  // 递归统计所有子章节
  let totalChildCount = children.length;
  for (const child of children) {
    const grandChildren = await prisma.teachingChapter.count({
      where: { parentId: child.id },
    });
    totalChildCount += grandChildren;
  }

  // 估算内容长度（基于子章节数量）
  // 假设每个章节平均 2000 字符
  const estimatedLength = (totalChildCount + 1) * 2000;
  const isTooLarge = totalChildCount > MAX_CHILD_CHAPTERS || estimatedLength > MAX_MERGED_CONTENT_LENGTH;

  let suggestion: string | undefined;
  if (isTooLarge && children.length > 0) {
    suggestion = `建议分别生成以下子章节的培训内容：\n${children.map((c, i) => `${i + 1}. ${c.title}`).join('\n')}`;
  }

  return {
    hasChildren: children.length > 0,
    childCount: totalChildCount,
    estimatedLength,
    isTooLarge,
    suggestion,
  };
}

// ==================== 辅助函数 ====================

/**
 * 递归获取章节树（扁平化，无深度限制，获取所有子章节到底）
 */
async function fetchChapterTree(chapterId: string): Promise<ChapterNode[]> {
  const chapter = await prisma.teachingChapter.findUnique({
    where: { id: chapterId },
    select: {
      id: true,
      title: true,
      level: true,
      orderIndex: true,
      contentFull: true,
      contentPreview: true,
    },
  });

  if (!chapter) return [];

  const result: ChapterNode[] = [chapter];

  // 递归获取所有子章节（无深度限制）
  const children = await prisma.teachingChapter.findMany({
    where: { parentId: chapterId },
    orderBy: { orderIndex: 'asc' },
    select: {
      id: true,
      title: true,
      level: true,
      orderIndex: true,
      contentFull: true,
      contentPreview: true,
    },
  });

  for (const child of children) {
    const childTree = await fetchChapterTree(child.id);
    result.push(...childTree);
  }

  return result;
}

/**
 * 构建合并后的内容
 */
function buildMergedContent(chapters: ChapterNode[]): string {
  const parts: string[] = [];

  for (const chapter of chapters) {
    const content = chapter.contentFull || chapter.contentPreview || '';
    if (content.trim()) {
      // 使用层级缩进标题
      const headingLevel = '#'.repeat(Math.min(chapter.level + 1, 4));
      parts.push(`${headingLevel} ${chapter.title}\n\n${content.trim()}`);
    } else {
      // 即使没有内容，也保留标题结构
      const headingLevel = '#'.repeat(Math.min(chapter.level + 1, 4));
      parts.push(`${headingLevel} ${chapter.title}\n\n[本节无详细内容]`);
    }
  }

  return parts.join('\n\n---\n\n');
}

/**
 * 截断内容
 */
function truncateContent(content: string, maxLength: number): string {
  if (content.length <= maxLength) return content;
  
  // 尝试在段落边界截断
  const truncated = content.substring(0, maxLength);
  const lastParagraph = truncated.lastIndexOf('\n\n');
  
  if (lastParagraph > maxLength * 0.8) {
    return truncated.substring(0, lastParagraph) + '\n\n...[内容过长，已截断。建议分章节生成。]';
  }
  
  return truncated + '\n\n...[内容过长，已截断。建议分章节生成。]';
}

/**
 * 生成分章节建议
 */
function generateSplitSuggestion(chapters: ChapterNode[]): string {
  // 找出第一层子章节（level 比根章节大 1）
  const rootLevel = chapters[0]?.level || 1;
  const directChildren = chapters.filter(ch => ch.level === rootLevel + 1);

  if (directChildren.length === 0) {
    return '建议使用更小粒度的章节来生成培训内容。';
  }

  const childList = directChildren
    .slice(0, 8) // 最多显示 8 个
    .map((ch, i) => `${i + 1}. ${ch.title}`)
    .join('\n');

  const moreText = directChildren.length > 8 ? `\n...等共 ${directChildren.length} 个子章节` : '';

  return `建议分别为以下子章节生成培训内容：\n${childList}${moreText}`;
}

