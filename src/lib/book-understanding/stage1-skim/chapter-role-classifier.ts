/**
 * 阶段1：章节角色分类
 * 
 * 职责：
 * - 分析章节内容（支持完整内容或首段）
 * - 判断章节角色：核心/基础/拓展/参考
 * - 识别章节目标和初步关键概念
 * 
 * 优化：
 * - 支持带完整内容的章节分析（来自按页解析）
 * - 智能截断超长内容，控制上下文大小
 * - 批量处理支持
 */

import { OpenAI } from '@llamaindex/openai';
import { configureLLM } from '../../llm/config';
import type { ChapterMeta, ChapterRole, BookThesis } from '../types';

// ==================== 类型定义 ====================

/** 原始章节信息（从文档提取） */
export interface RawChapter {
  /** 章节标题 */
  title: string;
  /** 层级：1=章, 2=节, 3=小节 */
  level: number;
  /** 排序索引 */
  orderIndex: number;
  /** 章节首段内容（用于快速预览） */
  firstParagraph?: string;
  /** 完整内容（来自按页解析，可能已截断） */
  contentFull?: string;
  /** 起始页（可选，来自按页解析） */
  startPage?: number;
  /** 结束页（可选，来自按页解析） */
  endPage?: number;
}

export interface RoleClassifierInput {
  /** 全书主题（来自 BookAnalyzer） */
  thesis: BookThesis;
  /** 原始章节列表 */
  chapters: RawChapter[];
  /** 每章内容的最大长度（默认 3000 字符） */
  maxContentLength?: number;
}

export interface RoleClassifierOutput {
  success: boolean;
  chapters: ChapterMeta[];
  error?: string;
}

// ==================== 配置 ====================

/** 每章内容的默认最大长度 */
const DEFAULT_MAX_CONTENT_LENGTH = 3000;
/** 章节列表的最大总长度 */
const MAX_CHAPTER_LIST_LENGTH = 30000;

// ==================== Prompt ====================

const ROLE_CLASSIFICATION_PROMPT = `你是一位资深教研专家。请根据以下信息，为每个章节分配角色并识别其目标。

## 全书主题
标题：{bookTitle}
核心命题：{bookTopic}
目标读者：{bookAudience}
知识类型：{knowledgeType}

## 章节列表
{chapterList}

## 任务
为每个章节判断：
1. **角色 (role)**：
   - core: 核心章节 - 承载主要知识点，必须精讲
   - foundation: 基础章节 - 提供前置知识，为核心做铺垫
   - extension: 拓展章节 - 补充延伸内容，可选讲
   - reference: 参考章节 - 附录、索引等参考性内容

2. **目标 (goal)**：该章节要达成什么教学目标（20字以内）

3. **关键概念 (keyConcepts)**：该章节的 3-5 个核心概念/术语

4. **依赖 (dependencies)**：该章节依赖哪些前置章节（用标题表示）

## 输出格式 (JSON)
{
  "chapters": [
    {
      "title": "章节标题",
      "role": "core|foundation|extension|reference",
      "goal": "章节目标",
      "keyConcepts": ["概念1", "概念2"],
      "dependencies": ["前置章节标题"]
    }
  ]
}

## 判断原则
1. 核心章节通常占全书 40-60%
2. 基础章节通常在前面，为后续做铺垫
3. 拓展章节通常是案例、进阶内容
4. 参考章节通常是附录、术语表、索引
5. 根据章节内容判断，不要仅依赖标题

请直接输出 JSON，不要包含其他文字。`;

// ==================== 核心函数 ====================

/**
 * 分类章节角色
 * 
 * @param input 输入参数
 * @returns 分类结果
 */
export async function classifyChapterRoles(input: RoleClassifierInput): Promise<RoleClassifierOutput> {
  try {
    configureLLM();

    const { thesis, chapters, maxContentLength = DEFAULT_MAX_CONTENT_LENGTH } = input;

    if (chapters.length === 0) {
      return {
        success: false,
        chapters: [],
        error: '没有章节可分类',
      };
    }

    const llm = new OpenAI({
      model: process.env.OPENAI_MODEL || 'qwen-plus',
      apiKey: process.env.OPENAI_API_KEY!,
      baseURL: process.env.OPENAI_API_BASE || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });

    // 格式化章节列表（使用完整内容或首段）
    const chapterListStr = formatChapterListWithContent(chapters, maxContentLength);

    // 检查是否超过最大长度，如果超过则截断内容
    const finalChapterList = chapterListStr.length > MAX_CHAPTER_LIST_LENGTH
      ? truncateChapterList(chapters, MAX_CHAPTER_LIST_LENGTH)
      : chapterListStr;

    const prompt = ROLE_CLASSIFICATION_PROMPT
      .replace('{bookTitle}', thesis.title)
      .replace('{bookTopic}', thesis.topic)
      .replace('{bookAudience}', thesis.audience)
      .replace('{knowledgeType}', thesis.knowledgeType)
      .replace('{chapterList}', finalChapterList);

    console.log(`[RoleClassifier] Classifying ${chapters.length} chapters, prompt length: ${prompt.length}`);

    const response = await llm.complete({ prompt });
    const text = response.text.trim();

    // 解析结果
    const classifiedChapters = parseClassificationResult(text, chapters);

    if (!classifiedChapters || classifiedChapters.length === 0) {
      return {
        success: false,
        chapters: [],
        error: '无法解析分类结果',
      };
    }

    // 统计角色分布
    const roleStats = countRoles(classifiedChapters);
    console.log('[RoleClassifier] Role distribution:', roleStats);

    return {
      success: true,
      chapters: classifiedChapters,
    };
  } catch (error: any) {
    console.error('[RoleClassifier] Error:', error);
    return {
      success: false,
      chapters: [],
      error: error.message || '章节角色分类失败',
    };
  }
}

// ==================== 辅助函数 ====================

/**
 * 格式化章节列表（包含内容摘要）
 * 
 * 优先使用完整内容（contentFull），否则使用首段（firstParagraph）
 */
function formatChapterListWithContent(chapters: RawChapter[], maxContentLength: number): string {
  return chapters.map((ch, i) => {
    const indent = '  '.repeat(Math.max(0, ch.level - 1));
    
    // 构建标题行（包含页码信息，如果有）
    let titleLine = `${indent}${i + 1}. ${ch.title}`;
    if (ch.startPage && ch.endPage) {
      titleLine += ` (第${ch.startPage}-${ch.endPage}页)`;
    }

    // 获取内容：优先完整内容，否则首段
    const content = ch.contentFull || ch.firstParagraph || '';
    
    if (!content) {
      return titleLine;
    }

    // 截断内容
    const truncatedContent = content.length > maxContentLength
      ? content.substring(0, maxContentLength) + '...[内容截断]'
      : content;

    // 清理内容格式
    const cleanContent = truncatedContent
      .replace(/\n{3,}/g, '\n\n')  // 多个换行合并
      .replace(/\s+/g, ' ')         // 多个空格合并
      .trim();

    return `${titleLine}\n${indent}   内容摘要: ${cleanContent}`;
  }).join('\n\n');
}

/**
 * 截断章节列表（当总长度超限时）
 */
function truncateChapterList(chapters: RawChapter[], maxLength: number): string {
  // 减少每章的内容长度
  const reducedContentLength = Math.floor(maxLength / chapters.length / 3);
  const minContentLength = 200;

  return chapters.map((ch, i) => {
    const indent = '  '.repeat(Math.max(0, ch.level - 1));
    let titleLine = `${indent}${i + 1}. ${ch.title}`;
    
    if (ch.startPage && ch.endPage) {
      titleLine += ` (第${ch.startPage}-${ch.endPage}页)`;
    }

    // 获取内容
    const content = ch.contentFull || ch.firstParagraph || '';
    
    if (!content) {
      return titleLine;
    }

    // 使用更短的截断长度
    const contentLength = Math.max(minContentLength, reducedContentLength);
    const truncatedContent = content.substring(0, contentLength).replace(/\s+/g, ' ').trim();

    return `${titleLine}\n${indent}   摘要: ${truncatedContent}...`;
  }).join('\n\n');
}

/**
 * 解析 LLM 返回的分类结果
 */
function parseClassificationResult(text: string, rawChapters: RawChapter[]): ChapterMeta[] | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[RoleClassifier] No JSON found');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const classifiedList = parsed.chapters || [];

    // 创建标题到分类结果的映射
    const classificationMap = new Map<string, any>();
    for (const item of classifiedList) {
      if (item.title) {
        classificationMap.set(normalizeTitle(item.title), item);
      }
    }

    // 合并原始章节和分类结果
    const result: ChapterMeta[] = rawChapters.map((raw, index) => {
      const classification = classificationMap.get(normalizeTitle(raw.title));
      
      return {
        id: generateChapterId(index, raw.title),
        title: raw.title,
        level: raw.level,
        role: validateRole(classification?.role),
        goal: classification?.goal || '待分析',
        keyConcepts: Array.isArray(classification?.keyConcepts) 
          ? classification.keyConcepts 
          : [],
        dependencies: Array.isArray(classification?.dependencies)
          ? classification.dependencies
          : [],
        orderIndex: raw.orderIndex || index + 1,
        contentPreview: raw.firstParagraph,
        contentFull: raw.contentFull,
        // 保留页码信息
        startPage: raw.startPage,
        endPage: raw.endPage,
      };
    });

    return result;
  } catch (e) {
    console.error('[RoleClassifier] Parse error:', e);
    return null;
  }
}

/**
 * 生成章节ID
 */
function generateChapterId(index: number, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .substring(0, 20);
  return `ch_${index + 1}_${slug}`;
}

/**
 * 标准化标题用于匹配
 */
function normalizeTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * 验证并返回有效的角色
 */
function validateRole(role: string | undefined): ChapterRole {
  const validRoles: ChapterRole[] = ['core', 'foundation', 'extension', 'reference'];
  if (role && validRoles.includes(role as ChapterRole)) {
    return role as ChapterRole;
  }
  return 'core'; // 默认为核心
}

/**
 * 统计角色分布
 */
function countRoles(chapters: ChapterMeta[]): Record<ChapterRole, number> {
  const counts: Record<ChapterRole, number> = {
    core: 0,
    foundation: 0,
    extension: 0,
    reference: 0,
  };
  
  for (const ch of chapters) {
    counts[ch.role]++;
  }
  
  return counts;
}
