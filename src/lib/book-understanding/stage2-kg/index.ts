/**
 * 阶段2：知识图谱构建
 * 
 * 目标：将粗读结果转化成可查询、可复用、可量化的结构化知识图谱
 * 
 * 核心输出：
 * - ConceptGraph: 概念图谱（节点 + 边）
 * - coreConceptIds: 核心概念排序
 * - readingPriority: 精读优先级队列
 */

export { extractConcepts, type ConceptExtractorInput, type ConceptExtractorOutput } from './concept-extractor';
export { buildRelations, type RelationBuilderInput, type RelationBuilderOutput } from './relation-builder';
export { weightConcepts, type ConceptWeighterInput, type ConceptWeighterOutput } from './concept-weighter';

