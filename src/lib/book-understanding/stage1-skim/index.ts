/**
 * 阶段1：粗读建结构
 * 
 * 目标：快速"读懂"整本书，建立章节/概念结构地图
 * 
 * 核心输出：
 * - BookThesis: 全书主题
 * - ChapterMeta[]: 章节元信息
 * - ChapterDAG: 章节依赖图
 * - ChapterBoundary[]: 章节边界（带页码）
 */

export { analyzeBook, type BookAnalyzerInput, type BookAnalyzerOutput } from './book-analyzer';
export { classifyChapterRoles, type RoleClassifierInput, type RoleClassifierOutput } from './chapter-role-classifier';
export { buildChapterDAG, type DAGBuilderInput, type DAGBuilderOutput } from './chapter-dependency';
export {
  detectChapterBoundaries,
  flattenChapters,
  getChapterContent,
  getChapterWordCount,
  type ChapterBoundary,
  type BoundaryDetectorInput,
  type BoundaryDetectorOutput,
} from './chapter-boundary-detector';

