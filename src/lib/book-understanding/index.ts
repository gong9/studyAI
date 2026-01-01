/**
 * 全书理解模块
 * 
 * 四阶段处理流程：
 * 1. 粗读建结构 - 全局理解
 * 2. 知识图谱构建 - 结构化核心
 * 3. 精读填充 - RAG 检索辅助
 * 4. 输出呈现 - 讲稿/课程地图
 */

// 类型导出
export * from './types';

// 阶段1：粗读建结构
export { analyzeBook } from './stage1-skim/book-analyzer';
export { classifyChapterRoles } from './stage1-skim/chapter-role-classifier';
export { buildChapterDAG } from './stage1-skim/chapter-dependency';

// 阶段2：知识图谱
export { extractConcepts } from './stage2-kg/concept-extractor';
export { buildRelations } from './stage2-kg/relation-builder';
export { weightConcepts } from './stage2-kg/concept-weighter';

// 阶段3：精读填充
export { enrichConcepts } from './stage3-deep-read/concept-enricher';
export { generateSectionContent } from './stage3-deep-read/section-generator';

// 阶段4：输出
export { generateManuscript } from './stage4-output/manuscript-generator';
export { generateCourseMap } from './stage4-output/course-map';

