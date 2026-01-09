/**
 * 章节理解 Agent
 * 
 * 职责：
 * - 通过 RAG 获取章节相关的教材内容
 * - 提取知识点：核心概念、重要公式、典型例题、易错点
 * - 生成章节摘要
 * 
 * 类似于代码库的"模块摘要"功能
 */

import { OpenAI } from '@llamaindex/openai';
import { configureLLM } from '../../llm/config';
import { loadIndex } from '../../llm/index-manager';
import { hybridSearch } from '../../hybrid-search';

// ==================== 类型定义 ====================

/** 知识点类型 */
export interface KeyPoint {
  type: 'concept' | 'formula' | 'example' | 'pitfall' | 'method';
  title: string;
  content: string;
  importance: 'high' | 'medium' | 'low';
}

/** 章节分析输入 */
export interface ChapterAnalysisInput {
  knowledgeBaseId: string;
  chapterTitle: string;
  chapterLevel: number;
}

/** 章节分析结果 */
export interface ChapterAnalysisResult {
  success: boolean;
  keyPoints: KeyPoint[];
  summary: string;
  error?: string;
}

// ==================== Prompt ====================

const ANALYSIS_PROMPT = `你是一位资深教师，正在备课前阅读教材。请根据以下教材内容，提取该章节的核心知识点和摘要。

## 章节标题
{chapterTitle}

## 教材相关内容
{content}

## 任务

### 1. 提取知识点
请识别并提取以下类型的知识点：
- **concept（概念）**：核心定义、基本概念
- **formula（公式）**：重要公式、计算方法
- **example（例题）**：典型例题、应用案例
- **pitfall（易错点）**：学生容易犯的错误、需要注意的地方
- **method（方法）**：解题方法、思路技巧

### 2. 生成摘要
用 200-400 字概括这个章节的核心内容，包括：
- 本节主要讲什么
- 核心知识点有哪些
- 学完应该掌握什么

## 输出格式 (JSON)
{
  "keyPoints": [
    {
      "type": "concept",
      "title": "知识点标题",
      "content": "具体内容描述（50-100字）",
      "importance": "high"
    }
  ],
  "summary": "章节摘要内容..."
}

## 注意事项
1. 只提取教材中明确提到的内容，不要编造
2. 每种类型的知识点不超过 5 个
3. 标记最重要的 2-3 个知识点为 "high" 重要性
4. 如果教材内容不足，可以少提取一些，但不要编造

请直接输出 JSON，不要有其他文字。`;

// ==================== 核心函数 ====================

/**
 * 分析章节内容，提取知识点和摘要
 */
export async function analyzeChapter(input: ChapterAnalysisInput): Promise<ChapterAnalysisResult> {
  try {
    configureLLM();

    const { knowledgeBaseId, chapterTitle } = input;


    // 1. 通过 RAG 获取与章节相关的教材内容
    const materialContent = await fetchChapterMaterial(knowledgeBaseId, chapterTitle);
    
    if (!materialContent || materialContent.length < 100) {
      return {
        success: false,
        keyPoints: [],
        summary: '',
        error: '教材内容不足，无法分析',
      };
    }


    // 2. 调用 LLM 分析
    const llm = new OpenAI({
      model: process.env.OPENAI_MODEL || 'qwen-plus',
      apiKey: process.env.OPENAI_API_KEY!,
      baseURL: process.env.OPENAI_API_BASE || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });

    const prompt = ANALYSIS_PROMPT
      .replace('{chapterTitle}', chapterTitle)
      .replace('{content}', materialContent);

    const response = await llm.complete({ prompt });
    const text = response.text.trim();

    // 3. 解析结果
    const result = parseAnalysisResult(text);


    return {
      success: true,
      keyPoints: result.keyPoints,
      summary: result.summary,
    };

  } catch (error: any) {
    console.error('[ChapterAnalyzer] Error:', error);
    return {
      success: false,
      keyPoints: [],
      summary: '',
      error: error.message || '章节分析失败',
    };
  }
}

/**
 * 通过 RAG 获取章节相关的教材内容
 * 注意：调用前需确保索引已就绪（由 ensureIndexReady 保证）
 */
async function fetchChapterMaterial(
  knowledgeBaseId: string, 
  chapterTitle: string
): Promise<string> {
  try {
    // 加载索引（此时索引应该已经就绪）
    const index = await loadIndex(knowledgeBaseId);
    
    // 构造多个查询以获取更全面的内容
    const queries = [
      chapterTitle,  // 章节标题本身
      `${chapterTitle} 定义 概念`,  // 概念定义
      `${chapterTitle} 例题 练习`,  // 例题
      `${chapterTitle} 公式 计算`,  // 公式
    ];

    const allContent: string[] = [];
    const seenContent = new Set<string>();

    for (const query of queries) {
      const results = await hybridSearch(index, knowledgeBaseId, query, {
        vectorTopK: 5,
        keywordLimit: 3,
        minVectorScore: 0.3,
      });

      for (const result of results) {
        // 去重
        const contentKey = result.content.substring(0, 100);
        if (!seenContent.has(contentKey)) {
          seenContent.add(contentKey);
          allContent.push(result.content);
        }
      }
    }

    // 拼接内容，限制总长度
    const combined = allContent.join('\n\n---\n\n');
    const maxLength = 8000;  // 保留更多内容给 LLM
    
    if (combined.length > maxLength) {
      return combined.substring(0, maxLength) + '\n\n[内容已截断...]';
    }

    return combined;

  } catch (error: any) {
    console.error('[ChapterAnalyzer] Failed to fetch material:', error);
    return '';
  }
}

/**
 * 解析 LLM 返回的分析结果
 */
function parseAnalysisResult(text: string): { keyPoints: KeyPoint[]; summary: string } {
  try {
    // 尝试提取 JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // 验证和清理 keyPoints
    const keyPoints: KeyPoint[] = (parsed.keyPoints || [])
      .filter((kp: any) => kp.type && kp.title && kp.content)
      .map((kp: any) => ({
        type: validateType(kp.type),
        title: String(kp.title).substring(0, 100),
        content: String(kp.content).substring(0, 500),
        importance: validateImportance(kp.importance),
      }));

    const summary = String(parsed.summary || '').substring(0, 1000);

    return { keyPoints, summary };

  } catch (error) {
    console.error('[ChapterAnalyzer] Failed to parse result:', error);
    return { keyPoints: [], summary: '' };
  }
}

/**
 * 验证知识点类型
 */
function validateType(type: string): KeyPoint['type'] {
  const validTypes = ['concept', 'formula', 'example', 'pitfall', 'method'];
  return validTypes.includes(type) ? type as KeyPoint['type'] : 'concept';
}

/**
 * 验证重要性等级
 */
function validateImportance(importance: string): KeyPoint['importance'] {
  const validLevels = ['high', 'medium', 'low'];
  return validLevels.includes(importance) ? importance as KeyPoint['importance'] : 'medium';
}

/**
 * 批量分析多个章节
 */
export async function analyzeChapters(
  knowledgeBaseId: string,
  chapters: Array<{ id: string; title: string; level: number }>,
  onProgress?: (current: number, total: number, title: string) => void
): Promise<Map<string, ChapterAnalysisResult>> {
  const results = new Map<string, ChapterAnalysisResult>();
  
  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];
    onProgress?.(i + 1, chapters.length, chapter.title);
    
    const result = await analyzeChapter({
      knowledgeBaseId,
      chapterTitle: chapter.title,
      chapterLevel: chapter.level,
    });
    
    results.set(chapter.id, result);
    
    // 避免 API 限流
    if (i < chapters.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  return results;
}

