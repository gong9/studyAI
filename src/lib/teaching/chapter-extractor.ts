/**
 * 教材章节结构提取器
 * 使用 LLM 从教材文本中识别目录结构和章节内容
 */

import { OpenAI } from '@llamaindex/openai';
import { configureLLM } from '../llm/config';

// ==================== 类型定义 ====================

/** 章节节点 */
export interface ChapterNode {
  title: string;
  level: number;  // 1=章, 2=节, 3=小节
  orderIndex: number;
  contentPreview?: string;
  contentFull?: string;
  metadata?: {
    grade?: string;
    subject?: string;
    difficulty?: number;
    keywords?: string[];
  };
  children?: ChapterNode[];
}

/** 提取结果 */
export interface ExtractionResult {
  success: boolean;
  chapters: ChapterNode[];
  metadata?: {
    grade?: string;
    subject?: string;
    totalChapters: number;
  };
  error?: string;
}

// ==================== 提取 Prompt ====================

const EXTRACT_TOC_PROMPT = `你是一个教材分析专家。请分析以下教材内容，提取其章节结构。

## 任务
1. 识别教材的目录/章节结构
2. 提取每个章节的标题和层级
3. 判断年级和学科

## 输出格式 (JSON)
{
  "metadata": {
    "grade": "七年级",
    "subject": "数学"
  },
  "chapters": [
    {
      "title": "第一章 有理数",
      "level": 1,
      "children": [
        {
          "title": "1.1 正数与负数",
          "level": 2,
          "children": []
        }
      ]
    }
  ]
}

## 层级说明
- level 1: 章 (如 "第一章"、"Chapter 1")
- level 2: 节 (如 "1.1"、"第一节")
- level 3: 小节 (如 "1.1.1"、具体知识点)

## 教材内容
{content}

请直接输出 JSON，不要包含其他文字。`;

const EXTRACT_CHAPTER_CONTENT_PROMPT = `你是一个教材分析专家。请从以下教材内容中提取指定章节的完整内容。

## 目标章节
{chapterTitle}

## 完整教材内容
{content}

## 任务
1. 找到该章节的开始位置
2. 找到该章节的结束位置（下一章节开始前）
3. 提取该章节的完整内容

## 输出格式 (JSON)
{
  "title": "章节标题",
  "content": "章节完整内容...",
  "keywords": ["关键词1", "关键词2"]
}

请直接输出 JSON，不要包含其他文字。`;

// ==================== 核心函数 ====================

/**
 * 从教材内容中提取章节结构
 */
export async function extractChapters(
  content: string,
  onProgress?: (message: string) => void
): Promise<ExtractionResult> {
  try {
    configureLLM();
    onProgress?.('正在分析教材结构...');

    // 如果内容过长，先截取前部分用于目录分析
    const tocContent = content.length > 50000 
      ? content.substring(0, 50000) 
      : content;

    const llm = new OpenAI({
      model: process.env.OPENAI_MODEL || 'qwen-turbo',
      apiKey: process.env.OPENAI_API_KEY!,
      baseURL: process.env.OPENAI_API_BASE || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });

    const prompt = EXTRACT_TOC_PROMPT.replace('{content}', tocContent);
    
    const response = await llm.complete({ prompt });
    const text = response.text.trim();

    // 解析 JSON
    let parsed: any;
    try {
      // 尝试提取 JSON 块
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (e) {
      console.error('[ChapterExtractor] Failed to parse JSON:', text);
      return {
        success: false,
        chapters: [],
        error: '无法解析章节结构',
      };
    }

    onProgress?.('章节结构提取完成');

    // 转换为 ChapterNode 格式并添加 orderIndex
    const chapters = normalizeChapters(parsed.chapters || []);

    return {
      success: true,
      chapters,
      metadata: {
        grade: parsed.metadata?.grade,
        subject: parsed.metadata?.subject,
        totalChapters: countChapters(chapters),
      },
    };
  } catch (error: any) {
    console.error('[ChapterExtractor] Error:', error);
    return {
      success: false,
      chapters: [],
      error: error.message || '提取章节结构失败',
    };
  }
}

/**
 * 提取指定章节的完整内容
 */
export async function extractChapterContent(
  fullContent: string,
  chapterTitle: string
): Promise<{ content: string; keywords: string[] } | null> {
  try {
    configureLLM();

    const llm = new OpenAI({
      model: process.env.OPENAI_MODEL || 'qwen-turbo',
      apiKey: process.env.OPENAI_API_KEY!,
      baseURL: process.env.OPENAI_API_BASE || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });

    // 如果内容过长，尝试定位章节位置
    let searchContent = fullContent;
    if (fullContent.length > 100000) {
      // 尝试找到章节在文档中的大致位置
      const titleIndex = fullContent.indexOf(chapterTitle);
      if (titleIndex !== -1) {
        const start = Math.max(0, titleIndex - 1000);
        const end = Math.min(fullContent.length, titleIndex + 50000);
        searchContent = fullContent.substring(start, end);
      } else {
        searchContent = fullContent.substring(0, 100000);
      }
    }

    const prompt = EXTRACT_CHAPTER_CONTENT_PROMPT
      .replace('{chapterTitle}', chapterTitle)
      .replace('{content}', searchContent);

    const response = await llm.complete({ prompt });
    const text = response.text.trim();

    // 解析 JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        content: parsed.content || '',
        keywords: parsed.keywords || [],
      };
    }

    return null;
  } catch (error) {
    console.error('[ChapterExtractor] Failed to extract chapter content:', error);
    return null;
  }
}

/**
 * 简单的基于规则的章节提取（作为 LLM 的备选）
 */
export function extractChaptersByRules(content: string): ChapterNode[] {
  const chapters: ChapterNode[] = [];
  const lines = content.split('\n');
  
  // 常见章节标题模式
  const chapterPatterns = [
    /^第[一二三四五六七八九十\d]+章\s+(.+)/,
    /^Chapter\s+\d+[.:：]\s*(.+)/i,
    /^(\d+)\s+(.+)/,
  ];
  
  const sectionPatterns = [
    /^第[一二三四五六七八九十\d]+节\s+(.+)/,
    /^(\d+\.\d+)\s+(.+)/,
    /^[一二三四五六七八九十]+[、.]\s*(.+)/,
  ];

  let currentChapter: ChapterNode | null = null;
  let chapterIndex = 0;
  let sectionIndex = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 检查是否是章标题
    for (const pattern of chapterPatterns) {
      const match = trimmed.match(pattern);
      if (match) {
        chapterIndex++;
        sectionIndex = 0;
        currentChapter = {
          title: trimmed,
          level: 1,
          orderIndex: chapterIndex,
          children: [],
        };
        chapters.push(currentChapter);
        break;
      }
    }

    // 检查是否是节标题
    if (currentChapter) {
      for (const pattern of sectionPatterns) {
        const match = trimmed.match(pattern);
        if (match) {
          sectionIndex++;
          currentChapter.children = currentChapter.children || [];
          currentChapter.children.push({
            title: trimmed,
            level: 2,
            orderIndex: sectionIndex,
          });
          break;
        }
      }
    }
  }

  return chapters;
}

// ==================== 辅助函数 ====================

/**
 * 标准化章节结构，添加 orderIndex
 */
function normalizeChapters(chapters: any[], parentIndex: number = 0): ChapterNode[] {
  return chapters.map((ch, i) => ({
    title: ch.title || '未命名章节',
    level: ch.level || 1,
    orderIndex: i + 1,
    contentPreview: ch.contentPreview,
    contentFull: ch.contentFull,
    metadata: ch.metadata,
    children: ch.children ? normalizeChapters(ch.children, i + 1) : undefined,
  }));
}

/**
 * 统计章节总数
 */
function countChapters(chapters: ChapterNode[]): number {
  let count = chapters.length;
  for (const ch of chapters) {
    if (ch.children) {
      count += countChapters(ch.children);
    }
  }
  return count;
}

/**
 * 将章节树展平为数组
 */
export function flattenChapters(chapters: ChapterNode[]): ChapterNode[] {
  const result: ChapterNode[] = [];
  
  function traverse(nodes: ChapterNode[]) {
    for (const node of nodes) {
      result.push(node);
      if (node.children) {
        traverse(node.children);
      }
    }
  }
  
  traverse(chapters);
  return result;
}

/**
 * 根据标题查找章节
 */
export function findChapterByTitle(
  chapters: ChapterNode[],
  title: string
): ChapterNode | null {
  for (const ch of chapters) {
    if (ch.title === title) return ch;
    if (ch.children) {
      const found = findChapterByTitle(ch.children, title);
      if (found) return found;
    }
  }
  return null;
}

