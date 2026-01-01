/**
 * 教研库模块入口
 * 导出所有教学相关的功能
 */

// 章节提取
export * from './chapter-extractor';

// 语义切分
export * from './semantic-chunker';

// Agents
export { generateTeachingPlan } from './agents/teaching-planner';
export { generateManuscript } from './agents/manuscript-generator';
export { reviewManuscript } from './agents/review-agent';
export { enrichManuscript } from './agents/enrich-agent';

// 类型重导出
export type { 
  TeachingPlan,
  SectionPlan,
  PlanningInput,
  PlanningResult 
} from './agents/teaching-planner';

export type { 
  ManuscriptInput,
  ManuscriptResult 
} from './agents/manuscript-generator';

export type { 
  ReviewInput,
  ReviewResult 
} from './agents/review-agent';

export type { 
  EnrichInput,
  EnrichResult 
} from './agents/enrich-agent';
