/**
 * 阶段2：概念节点抽取
 * 
 * 职责：
 * - 从章节关键概念、核心术语抽取节点
 * - 识别概念类型（定义/公式/方法/示例/原理）
 * - 生成概念初步描述
 * 
 * 原则：Structure First - 只用 LLM 分析，不用 RAG
 */

import { OpenAI } from '@llamaindex/openai';
import { configureLLM } from '../../llm/config';
import type { ChapterMeta, ConceptNode, ConceptType, BookThesis } from '../types';

// ==================== 类型定义 ====================

export interface ConceptExtractorInput {
  /** 全书主题 */
  thesis: BookThesis;
  /** 章节列表（含初步关键概念） */
  chapters: ChapterMeta[];
}

export interface ConceptExtractorOutput {
  success: boolean;
  concepts: ConceptNode[];
  error?: string;
}

// ==================== Prompt ====================

const CONCEPT_EXTRACTION_PROMPT = `你是一位知识图谱构建专家。请从以下章节信息中提取核心概念节点。

## 全书主题
标题：{bookTitle}
核心命题：{bookTopic}
知识类型：{knowledgeType}

## 章节信息
{chapterInfo}

## 任务
为每个章节提取 3-8 个核心概念，每个概念需要：
1. **名称 (name)**：概念的标准名称
2. **类型 (type)**：
   - definition: 定义类 - 概念、术语的定义
   - formula: 公式类 - 数学公式、计算方法
   - method: 方法类 - 操作步骤、解题方法
   - example: 示例类 - 典型案例、应用场景
   - principle: 原理类 - 基本原理、规律定理
   - term: 术语类 - 专业术语、缩写名词
3. **描述 (description)**：一句话描述（30字以内）

## 输出格式 (JSON)
{
  "chapters": [
    {
      "chapterTitle": "章节标题",
      "concepts": [
        {
          "name": "概念名称",
          "type": "definition|formula|method|example|principle|term",
          "description": "简要描述"
        }
      ]
    }
  ]
}

## 注意
1. 概念名称要精确、标准化
2. 同一概念在不同章节出现时，只在首次出现的章节提取
3. 参考章节（附录等）可以少提取或不提取

请直接输出 JSON，不要包含其他文字。`;

// ==================== 核心函数 ====================

/**
 * 抽取概念节点
 */
export async function extractConcepts(input: ConceptExtractorInput): Promise<ConceptExtractorOutput> {
  try {
    configureLLM();

    const { thesis, chapters } = input;

    if (chapters.length === 0) {
      return {
        success: false,
        concepts: [],
        error: '没有章节可分析',
      };
    }

    const llm = new OpenAI({
      model: process.env.OPENAI_MODEL || 'qwen-plus',
      apiKey: process.env.OPENAI_API_KEY!,
      baseURL: process.env.OPENAI_API_BASE || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });

    const chapterInfo = formatChapterInfo(chapters);

    const prompt = CONCEPT_EXTRACTION_PROMPT
      .replace('{bookTitle}', thesis.title)
      .replace('{bookTopic}', thesis.topic)
      .replace('{knowledgeType}', thesis.knowledgeType)
      .replace('{chapterInfo}', chapterInfo);


    const response = await llm.complete({ prompt });
    const text = response.text.trim();

    // 解析结果
    const concepts = parseConceptResult(text, chapters);

    if (!concepts || concepts.length === 0) {
      // 降级：从章节的 keyConcepts 生成基础概念
      return {
        success: true,
        concepts: extractFromKeyConcepts(chapters),
      };
    }


    return {
      success: true,
      concepts,
    };
  } catch (error: any) {
    console.error('[ConceptExtractor] Error:', error);
    return {
      success: false,
      concepts: [],
      error: error.message || '概念抽取失败',
    };
  }
}

// ==================== 辅助函数 ====================

/**
 * 格式化章节信息
 */
function formatChapterInfo(chapters: ChapterMeta[]): string {
  return chapters
    .filter(ch => ch.role !== 'reference') // 跳过参考章节
    .map((ch, i) => {
      return `${i + 1}. ${ch.title}
   角色: ${ch.role}
   目标: ${ch.goal}
   初步关键概念: ${ch.keyConcepts.join(', ')}`;
    }).join('\n\n');
}

/**
 * 解析 LLM 返回的概念结果
 */
function parseConceptResult(text: string, chapters: ChapterMeta[]): ConceptNode[] | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const conceptList: ConceptNode[] = [];
    const seenConcepts = new Set<string>(); // 用于去重

    // 创建标题到章节的映射
    const titleToChapter = new Map<string, ChapterMeta>();
    for (const ch of chapters) {
      titleToChapter.set(normalizeTitle(ch.title), ch);
    }

    if (Array.isArray(parsed.chapters)) {
      for (const chapterData of parsed.chapters) {
        const chapter = titleToChapter.get(normalizeTitle(chapterData.chapterTitle || ''));
        if (!chapter) continue;

        const concepts = chapterData.concepts || [];
        for (const c of concepts) {
          const conceptKey = normalizeTitle(c.name);
          if (seenConcepts.has(conceptKey)) continue;
          seenConcepts.add(conceptKey);

          conceptList.push({
            id: generateConceptId(conceptList.length, c.name),
            name: c.name,
            chapterId: chapter.id,
            type: validateConceptType(c.type),
            weight: 0, // 将在 weightConcepts 中计算
            description: c.description || '',
          });
        }
      }
    }

    return conceptList;
  } catch (e) {
    console.error('[ConceptExtractor] Parse error:', e);
    return null;
  }
}

/**
 * 从章节的 keyConcepts 生成基础概念（降级方案）
 */
function extractFromKeyConcepts(chapters: ChapterMeta[]): ConceptNode[] {
  const concepts: ConceptNode[] = [];
  const seenConcepts = new Set<string>();
  let index = 0;

  for (const chapter of chapters) {
    if (chapter.role === 'reference') continue;

    for (const concept of chapter.keyConcepts) {
      const conceptKey = normalizeTitle(concept);
      if (seenConcepts.has(conceptKey)) continue;
      seenConcepts.add(conceptKey);

      concepts.push({
        id: generateConceptId(index++, concept),
        name: concept,
        chapterId: chapter.id,
        type: 'term',
        weight: 0,
        description: '',
      });
    }
  }

  return concepts;
}

/**
 * 生成概念 ID
 */
function generateConceptId(index: number, name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .substring(0, 15);
  return `concept_${index + 1}_${slug}`;
}

/**
 * 标准化名称
 */
function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * 验证概念类型
 */
function validateConceptType(type: string | undefined): ConceptType {
  const validTypes: ConceptType[] = ['definition', 'formula', 'method', 'example', 'principle', 'term'];
  if (type && validTypes.includes(type as ConceptType)) {
    return type as ConceptType;
  }
  return 'term';
}

