/**
 * 阶段2：概念加权
 * 
 * 职责：
 * - 计算概念的重要性权重
 * - 基于出度/入度/跨章节引用
 * - 生成精读优先级队列
 * 
 * 原则：纯计算，不调用 LLM
 */

import type { 
  ConceptNode, 
  ConceptEdge, 
  ChapterMeta, 
  ConceptGraph, 
  KGBuildResult 
} from '../types';

// ==================== 类型定义 ====================

export interface ConceptWeighterInput {
  /** 概念节点列表 */
  concepts: ConceptNode[];
  /** 关系边列表 */
  relations: ConceptEdge[];
  /** 章节列表 */
  chapters: ChapterMeta[];
  /** 书籍 ID */
  bookId: string;
}

export interface ConceptWeighterOutput {
  success: boolean;
  result: KGBuildResult | null;
  error?: string;
}

// ==================== 权重参数 ====================

/** 权重计算参数 */
const WEIGHT_CONFIG = {
  /** 入度权重（被依赖越多越重要） */
  inDegreeWeight: 0.3,
  /** 出度权重（依赖越多说明是枢纽） */
  outDegreeWeight: 0.15,
  /** 章节角色权重 */
  chapterRoleWeight: 0.25,
  /** 概念类型权重 */
  conceptTypeWeight: 0.15,
  /** 跨章节引用权重 */
  crossChapterWeight: 0.15,
};

/** 章节角色对应的基础权重 */
const CHAPTER_ROLE_SCORES: Record<string, number> = {
  core: 1.0,
  foundation: 0.7,
  extension: 0.4,
  reference: 0.2,
};

/** 概念类型对应的基础权重 */
const CONCEPT_TYPE_SCORES: Record<string, number> = {
  definition: 1.0,
  principle: 0.95,
  formula: 0.9,
  method: 0.8,
  example: 0.5,
  term: 0.6,
};

// ==================== 核心函数 ====================

/**
 * 计算概念权重并生成最终知识图谱
 */
export function weightConcepts(input: ConceptWeighterInput): ConceptWeighterOutput {
  try {
    const { concepts, relations, chapters, bookId } = input;

    if (concepts.length === 0) {
      return {
        success: false,
        result: null,
        error: '没有概念可加权',
      };
    }

    // 1. 计算图结构指标
    const graphMetrics = calculateGraphMetrics(concepts, relations);

    // 2. 创建章节映射
    const chapterMap = new Map<string, ChapterMeta>();
    for (const ch of chapters) {
      chapterMap.set(ch.id, ch);
    }

    // 3. 计算每个概念的权重
    const weightedConcepts = concepts.map(concept => {
      const weight = calculateConceptWeight(concept, graphMetrics, chapterMap);
      return { ...concept, weight };
    });

    // 4. 按权重排序，获取核心概念
    const sortedByWeight = [...weightedConcepts].sort((a, b) => b.weight - a.weight);
    const coreConceptIds = sortedByWeight
      .filter(c => c.weight >= 0.5)
      .map(c => c.id);

    // 5. 生成精读优先级队列
    const readingPriority = generateReadingPriority(sortedByWeight, graphMetrics);

    // 6. 构建完整的知识图谱
    const graph: ConceptGraph = {
      concepts: weightedConcepts,
      relations,
      metadata: {
        bookId,
        createdAt: new Date(),
        updatedAt: new Date(),
        conceptCount: weightedConcepts.length,
        relationCount: relations.length,
      },
    };

    console.log('[ConceptWeighter] Weighted', concepts.length, 'concepts');
    console.log('[ConceptWeighter] Core concepts:', coreConceptIds.length);

    return {
      success: true,
      result: {
        graph,
        coreConceptIds,
        readingPriority,
      },
    };
  } catch (error: any) {
    console.error('[ConceptWeighter] Error:', error);
    return {
      success: false,
      result: null,
      error: error.message || '概念加权失败',
    };
  }
}

// ==================== 辅助函数 ====================

/**
 * 图结构指标
 */
interface GraphMetrics {
  inDegree: Map<string, number>;
  outDegree: Map<string, number>;
  crossChapterEdges: Map<string, number>;
  maxInDegree: number;
  maxOutDegree: number;
}

/**
 * 计算图结构指标
 */
function calculateGraphMetrics(concepts: ConceptNode[], relations: ConceptEdge[]): GraphMetrics {
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();
  const crossChapterEdges = new Map<string, number>();

  // 初始化
  for (const c of concepts) {
    inDegree.set(c.id, 0);
    outDegree.set(c.id, 0);
    crossChapterEdges.set(c.id, 0);
  }

  // 创建概念到章节的映射
  const conceptChapter = new Map<string, string>();
  for (const c of concepts) {
    conceptChapter.set(c.id, c.chapterId);
  }

  // 计算度数
  for (const rel of relations) {
    // 出度
    outDegree.set(rel.from, (outDegree.get(rel.from) || 0) + 1);
    // 入度
    inDegree.set(rel.to, (inDegree.get(rel.to) || 0) + 1);

    // 跨章节边
    const fromChapter = conceptChapter.get(rel.from);
    const toChapter = conceptChapter.get(rel.to);
    if (fromChapter && toChapter && fromChapter !== toChapter) {
      crossChapterEdges.set(rel.from, (crossChapterEdges.get(rel.from) || 0) + 1);
      crossChapterEdges.set(rel.to, (crossChapterEdges.get(rel.to) || 0) + 1);
    }
  }

  // 计算最大值（用于归一化）
  const maxInDegree = Math.max(1, ...inDegree.values());
  const maxOutDegree = Math.max(1, ...outDegree.values());

  return {
    inDegree,
    outDegree,
    crossChapterEdges,
    maxInDegree,
    maxOutDegree,
  };
}

/**
 * 计算单个概念的权重
 */
function calculateConceptWeight(
  concept: ConceptNode,
  metrics: GraphMetrics,
  chapterMap: Map<string, ChapterMeta>
): number {
  const config = WEIGHT_CONFIG;

  // 1. 入度分数（归一化到 0-1）
  const inDegreeScore = (metrics.inDegree.get(concept.id) || 0) / metrics.maxInDegree;

  // 2. 出度分数（归一化到 0-1）
  const outDegreeScore = (metrics.outDegree.get(concept.id) || 0) / metrics.maxOutDegree;

  // 3. 章节角色分数
  const chapter = chapterMap.get(concept.chapterId);
  const chapterRoleScore = chapter 
    ? (CHAPTER_ROLE_SCORES[chapter.role] || 0.5)
    : 0.5;

  // 4. 概念类型分数
  const conceptTypeScore = CONCEPT_TYPE_SCORES[concept.type] || 0.5;

  // 5. 跨章节引用分数
  const crossChapterCount = metrics.crossChapterEdges.get(concept.id) || 0;
  const crossChapterScore = Math.min(1, crossChapterCount / 3); // 3 个跨章节边即满分

  // 加权求和
  const weight = 
    config.inDegreeWeight * inDegreeScore +
    config.outDegreeWeight * outDegreeScore +
    config.chapterRoleWeight * chapterRoleScore +
    config.conceptTypeWeight * conceptTypeScore +
    config.crossChapterWeight * crossChapterScore;

  // 确保在 0-1 范围内
  return Math.max(0, Math.min(1, weight));
}

/**
 * 生成精读优先级队列
 */
function generateReadingPriority(
  sortedConcepts: ConceptNode[],
  metrics: GraphMetrics
): Array<{ conceptId: string; priority: number; reason: string }> {
  return sortedConcepts.slice(0, 20).map((concept, index) => {
    const inDegree = metrics.inDegree.get(concept.id) || 0;
    const crossChapter = metrics.crossChapterEdges.get(concept.id) || 0;

    // 生成优先级原因
    let reason = '';
    if (inDegree >= 3) {
      reason = '高被依赖度';
    } else if (crossChapter >= 2) {
      reason = '跨章节核心';
    } else if (concept.type === 'definition' || concept.type === 'principle') {
      reason = '基础概念';
    } else {
      reason = '权重较高';
    }

    return {
      conceptId: concept.id,
      priority: sortedConcepts.length - index, // 越靠前优先级越高
      reason,
    };
  });
}

