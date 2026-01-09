/**
 * 阶段2：关系边构建
 * 
 * 职责：
 * - 构建概念间的依赖关系
 * - 识别因果/对比/包含关系
 * - 建立章节到概念的映射关系
 * 
 * 原则：Structure First - 只用 LLM 分析，不用 RAG
 */

import { OpenAI } from '@llamaindex/openai';
import { configureLLM } from '../../llm/config';
import type { ConceptNode, ConceptEdge, RelationType, ChapterMeta, BookThesis } from '../types';

// ==================== 类型定义 ====================

export interface RelationBuilderInput {
  /** 全书主题 */
  thesis: BookThesis;
  /** 章节列表 */
  chapters: ChapterMeta[];
  /** 概念节点列表 */
  concepts: ConceptNode[];
}

export interface RelationBuilderOutput {
  success: boolean;
  relations: ConceptEdge[];
  error?: string;
}

// ==================== Prompt ====================

const RELATION_BUILD_PROMPT = `你是一位知识图谱专家。请分析以下概念之间的关系。

## 全书主题
标题：{bookTitle}

## 章节结构
{chapterStructure}

## 概念列表
{conceptList}

## 任务
分析概念之间的关系，输出关系边。

## 关系类型说明
- prerequisite: 前置依赖 - 必须先理解 A 才能理解 B
- causes: 因果关系 - A 导致/推导出 B
- contrasts: 对比关系 - A 和 B 是对比/比较关系
- includes: 包含关系 - A 包含 B（父子关系）
- relates_to: 相关关系 - A 和 B 有一般性关联

## 输出格式 (JSON)
{
  "relations": [
    {
      "from": "源概念名称",
      "to": "目标概念名称",
      "type": "prerequisite|causes|contrasts|includes|relates_to",
      "description": "关系描述（可选）"
    }
  ]
}

## 注意
1. 只建立有意义的关系，不要过度连接
2. 优先建立 prerequisite（前置依赖）关系
3. 同一章节内的概念更可能有关系
4. 跨章节的关系通常是 prerequisite 或 relates_to

请直接输出 JSON，不要包含其他文字。`;

// ==================== 核心函数 ====================

/**
 * 构建概念关系边
 */
export async function buildRelations(input: RelationBuilderInput): Promise<RelationBuilderOutput> {
  try {
    configureLLM();

    const { thesis, chapters, concepts } = input;

    if (concepts.length === 0) {
      return {
        success: false,
        relations: [],
        error: '没有概念可分析',
      };
    }

    // 如果概念很少，使用简单的顺序关系
    if (concepts.length <= 5) {
      return {
        success: true,
        relations: buildSimpleRelations(concepts, chapters),
      };
    }

    const llm = new OpenAI({
      model: process.env.OPENAI_MODEL || 'qwen-plus',
      apiKey: process.env.OPENAI_API_KEY!,
      baseURL: process.env.OPENAI_API_BASE || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });

    const chapterStructure = formatChapterStructure(chapters);
    const conceptList = formatConceptList(concepts);

    const prompt = RELATION_BUILD_PROMPT
      .replace('{bookTitle}', thesis.title)
      .replace('{chapterStructure}', chapterStructure)
      .replace('{conceptList}', conceptList);


    const response = await llm.complete({ prompt });
    const text = response.text.trim();

    // 解析结果
    const relations = parseRelationResult(text, concepts);

    if (!relations || relations.length === 0) {
      // 降级到简单关系
      return {
        success: true,
        relations: buildSimpleRelations(concepts, chapters),
      };
    }


    return {
      success: true,
      relations,
    };
  } catch (error: any) {
    console.error('[RelationBuilder] Error:', error);
    return {
      success: false,
      relations: [],
      error: error.message || '关系构建失败',
    };
  }
}

// ==================== 辅助函数 ====================

/**
 * 格式化章节结构
 */
function formatChapterStructure(chapters: ChapterMeta[]): string {
  return chapters.map(ch => `- ${ch.title} (${ch.role})`).join('\n');
}

/**
 * 格式化概念列表
 */
function formatConceptList(concepts: ConceptNode[]): string {
  // 按章节分组
  const byChapter = new Map<string, ConceptNode[]>();
  for (const c of concepts) {
    if (!byChapter.has(c.chapterId)) {
      byChapter.set(c.chapterId, []);
    }
    byChapter.get(c.chapterId)!.push(c);
  }

  let result = '';
  for (const [chapterId, chapterConcepts] of byChapter) {
    result += `\n[${chapterId}]\n`;
    result += chapterConcepts
      .map(c => `  - ${c.name} (${c.type}): ${c.description || '无描述'}`)
      .join('\n');
  }
  return result;
}

/**
 * 构建简单的顺序关系
 */
function buildSimpleRelations(concepts: ConceptNode[], chapters: ChapterMeta[]): ConceptEdge[] {
  const relations: ConceptEdge[] = [];
  
  // 按章节顺序排列的概念
  const chapterOrder = new Map<string, number>();
  chapters.forEach((ch, i) => chapterOrder.set(ch.id, i));
  
  const sortedConcepts = [...concepts].sort((a, b) => {
    const orderA = chapterOrder.get(a.chapterId) ?? 999;
    const orderB = chapterOrder.get(b.chapterId) ?? 999;
    return orderA - orderB;
  });

  // 同一章节内相邻概念建立 relates_to 关系
  for (let i = 0; i < sortedConcepts.length - 1; i++) {
    const current = sortedConcepts[i];
    const next = sortedConcepts[i + 1];
    
    if (current.chapterId === next.chapterId) {
      relations.push({
        from: current.id,
        to: next.id,
        type: 'relates_to',
      });
    }
  }

  // 跨章节的第一个概念之间建立 prerequisite 关系
  const firstByChapter = new Map<string, ConceptNode>();
  for (const c of concepts) {
    if (!firstByChapter.has(c.chapterId)) {
      firstByChapter.set(c.chapterId, c);
    }
  }

  const chapterIds = [...firstByChapter.keys()].sort((a, b) => {
    return (chapterOrder.get(a) ?? 999) - (chapterOrder.get(b) ?? 999);
  });

  for (let i = 0; i < chapterIds.length - 1; i++) {
    const current = firstByChapter.get(chapterIds[i])!;
    const next = firstByChapter.get(chapterIds[i + 1])!;
    relations.push({
      from: current.id,
      to: next.id,
      type: 'prerequisite',
    });
  }

  return relations;
}

/**
 * 解析 LLM 返回的关系结果
 */
function parseRelationResult(text: string, concepts: ConceptNode[]): ConceptEdge[] | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    
    // 创建名称到 ID 的映射
    const nameToId = new Map<string, string>();
    for (const c of concepts) {
      nameToId.set(normalizeTitle(c.name), c.id);
    }

    const relations: ConceptEdge[] = [];
    const edgeSet = new Set<string>(); // 去重

    if (Array.isArray(parsed.relations)) {
      for (const rel of parsed.relations) {
        const fromId = nameToId.get(normalizeTitle(rel.from));
        const toId = nameToId.get(normalizeTitle(rel.to));
        
        if (fromId && toId && fromId !== toId) {
          const edgeKey = `${fromId}->${toId}`;
          if (!edgeSet.has(edgeKey)) {
            edgeSet.add(edgeKey);
            relations.push({
              from: fromId,
              to: toId,
              type: validateRelationType(rel.type),
              description: rel.description,
            });
          }
        }
      }
    }

    return relations;
  } catch (e) {
    console.error('[RelationBuilder] Parse error:', e);
    return null;
  }
}

/**
 * 标准化名称
 */
function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * 验证关系类型
 */
function validateRelationType(type: string | undefined): RelationType {
  const validTypes: RelationType[] = ['prerequisite', 'causes', 'contrasts', 'includes', 'relates_to'];
  if (type && validTypes.includes(type as RelationType)) {
    return type as RelationType;
  }
  return 'relates_to';
}

