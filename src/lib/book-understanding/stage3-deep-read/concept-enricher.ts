/**
 * 阶段3：概念精读填充
 * 
 * 职责：
 * - 使用 RAG 检索原文填充概念详细内容
 * - 附加示例、公式、案例
 * - 识别易错点
 * 
 * 原则：RAG 只做细节补充，不参与结构判断
 */

import { OpenAI } from '@llamaindex/openai';
import { configureLLM } from '../../llm/config';
import { hybridSearch, formatSearchResults } from '../../hybrid-search';
import { loadIndex } from '../../llm/index-manager';
import type { ConceptNode, EnrichedConcept, ConceptGraph } from '../types';

// ==================== 类型定义 ====================

export interface ConceptEnricherInput {
  /** 知识库 ID */
  knowledgeBaseId: string;
  /** 概念图谱 */
  graph: ConceptGraph;
  /** 精读优先级队列（按优先级高到低） */
  priorityQueue: Array<{ conceptId: string; priority: number }>;
  /** 最大精读概念数 */
  maxConcepts?: number;
}

export interface ConceptEnricherOutput {
  success: boolean;
  enrichedConcepts: EnrichedConcept[];
  error?: string;
}

// ==================== Prompt ====================

const CONCEPT_ENRICH_PROMPT = `你是一位教学内容专家。请根据以下教材内容，详细解释这个概念。

## 概念信息
名称：{conceptName}
类型：{conceptType}
初步描述：{conceptDescription}
所属章节：{chapterContext}

## 相关教材内容
{ragContent}

## 任务
1. 生成详细的概念解释（100-300字）
2. 提供 2-3 个具体示例
3. 如果是公式/方法类，提供计算步骤
4. 识别 1-2 个易错点（如有）

## 输出格式 (JSON)
{
  "content": "详细解释内容...",
  "examples": ["示例1", "示例2"],
  "formulas": ["公式1（如有）"],
  "pitfalls": ["易错点1（如有）"]
}

## 注意
1. 内容要基于教材原文，不要编造
2. 如果 RAG 内容不足，可以基于概念本身做合理推断
3. 语言要通俗易懂，适合教学

请直接输出 JSON，不要包含其他文字。`;

// ==================== 核心函数 ====================

/**
 * 精读填充概念内容
 */
export async function enrichConcepts(input: ConceptEnricherInput): Promise<ConceptEnricherOutput> {
  try {
    configureLLM();

    const { knowledgeBaseId, graph, priorityQueue, maxConcepts = 15 } = input;

    if (graph.concepts.length === 0) {
      return {
        success: false,
        enrichedConcepts: [],
        error: '没有概念可填充',
      };
    }

    // 加载向量索引
    let index;
    try {
      index = await loadIndex(knowledgeBaseId);
    } catch (e) {
      // 没有索引时使用基础填充
      return {
        success: true,
        enrichedConcepts: basicEnrichment(graph.concepts.slice(0, maxConcepts)),
      };
    }

    const llm = new OpenAI({
      model: process.env.OPENAI_MODEL || 'qwen-plus',
      apiKey: process.env.OPENAI_API_KEY!,
      baseURL: process.env.OPENAI_API_BASE || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });

    // 创建概念 ID 到概念的映射
    const conceptMap = new Map<string, ConceptNode>();
    for (const c of graph.concepts) {
      conceptMap.set(c.id, c);
    }

    // 按优先级处理概念
    const toEnrich = priorityQueue.slice(0, maxConcepts);
    const enrichedConcepts: EnrichedConcept[] = [];


    for (const item of toEnrich) {
      const concept = conceptMap.get(item.conceptId);
      if (!concept) continue;

      try {
        // RAG 检索相关内容
        const ragContent = await fetchConceptContent(index, knowledgeBaseId, concept);

        // 生成丰富内容
        const enriched = await enrichSingleConcept(llm, concept, ragContent);
        enrichedConcepts.push(enriched);

        // 避免 API 限流
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (e) {
        console.error(`[ConceptEnricher] Failed to enrich ${concept.name}:`, e);
        // 添加基础填充
        enrichedConcepts.push({
          conceptId: concept.id,
          content: concept.description || concept.name,
          examples: [],
          sources: [],
        });
      }
    }


    return {
      success: true,
      enrichedConcepts,
    };
  } catch (error: any) {
    console.error('[ConceptEnricher] Error:', error);
    return {
      success: false,
      enrichedConcepts: [],
      error: error.message || '概念精读失败',
    };
  }
}

// ==================== 辅助函数 ====================

/**
 * RAG 检索概念相关内容
 */
async function fetchConceptContent(
  index: any,
  knowledgeBaseId: string,
  concept: ConceptNode
): Promise<string> {
  try {
    // 构建查询
    const queries = [
      concept.name,
      `${concept.name} 定义`,
      `${concept.name} 示例`,
    ];

    const allContent: string[] = [];
    const seenContent = new Set<string>();

    for (const query of queries) {
      const results = await hybridSearch(index, knowledgeBaseId, query, {
        vectorTopK: 3,
        keywordLimit: 2,
        minVectorScore: 0.3,
      });

      for (const result of results) {
        const contentKey = result.content.substring(0, 50);
        if (!seenContent.has(contentKey)) {
          seenContent.add(contentKey);
          allContent.push(result.content);
        }
      }
    }

    const combined = allContent.join('\n\n---\n\n');
    // 限制长度
    return combined.length > 4000 ? combined.substring(0, 4000) + '...' : combined;
  } catch (e) {
    console.error('[ConceptEnricher] RAG failed:', e);
    return '';
  }
}

/**
 * 填充单个概念
 */
async function enrichSingleConcept(
  llm: OpenAI,
  concept: ConceptNode,
  ragContent: string
): Promise<EnrichedConcept> {
  if (!ragContent || ragContent.length < 50) {
    // RAG 内容不足，返回基础填充
    return {
      conceptId: concept.id,
      content: concept.description || `${concept.name}是一个${concept.type}类概念。`,
      examples: [],
      sources: [],
    };
  }

  const prompt = CONCEPT_ENRICH_PROMPT
    .replace('{conceptName}', concept.name)
    .replace('{conceptType}', concept.type)
    .replace('{conceptDescription}', concept.description || '无')
    .replace('{chapterContext}', concept.chapterId)
    .replace('{ragContent}', ragContent);

  const response = await llm.complete({ prompt });
  const text = response.text.trim();

  // 解析结果
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        conceptId: concept.id,
        content: parsed.content || concept.description || '',
        examples: Array.isArray(parsed.examples) ? parsed.examples : [],
        formulas: Array.isArray(parsed.formulas) ? parsed.formulas : undefined,
        pitfalls: Array.isArray(parsed.pitfalls) ? parsed.pitfalls : undefined,
        sources: [{
          documentName: 'RAG检索',
          excerpt: ragContent.substring(0, 100),
          relevance: 0.8,
        }],
      };
    }
  } catch (e) {
    console.error('[ConceptEnricher] Parse error:', e);
  }

  // 解析失败，返回 RAG 内容
  return {
    conceptId: concept.id,
    content: ragContent.substring(0, 500),
    examples: [],
    sources: [{
      documentName: 'RAG检索',
      excerpt: ragContent.substring(0, 100),
      relevance: 0.5,
    }],
  };
}

/**
 * 基础填充（无 RAG）
 */
function basicEnrichment(concepts: ConceptNode[]): EnrichedConcept[] {
  return concepts.map(c => ({
    conceptId: c.id,
    content: c.description || `${c.name}是一个重要的${c.type}类概念。`,
    examples: [],
    sources: [],
  }));
}

