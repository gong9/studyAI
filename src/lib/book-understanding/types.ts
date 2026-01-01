/**
 * 全书理解模块 - 类型定义
 * 
 * 核心数据结构，贯穿四个阶段：
 * 1. 粗读建结构
 * 2. 知识图谱构建
 * 3. 精读填充
 * 4. 输出呈现
 */

// ==================== 阶段1：粗读建结构 ====================

/** 知识类型 */
export type KnowledgeType = 'concept' | 'skill' | 'reference' | 'narrative';

/** 全书主题（阶段1核心输出） */
export interface BookThesis {
  /** 书名 */
  title: string;
  /** 核心命题/主旨 */
  topic: string;
  /** 目标读者 */
  audience: string;
  /** 知识类型 */
  knowledgeType: KnowledgeType;
  /** 全书摘要 */
  summary: string;
  /** 核心关键词 */
  keywords: string[];
}

/** 章节角色 */
export type ChapterRole = 'core' | 'foundation' | 'extension' | 'reference';

/** 章节元信息 */
export interface ChapterMeta {
  /** 章节ID */
  id: string;
  /** 章节标题 */
  title: string;
  /** 层级 (1=章, 2=节, 3=小节) */
  level: number;
  /** 章节角色 */
  role: ChapterRole;
  /** 章节目标/意图 */
  goal: string;
  /** 初步关键概念 */
  keyConcepts: string[];
  /** 依赖的前置章节ID */
  dependencies: string[];
  /** 排序索引 */
  orderIndex: number;
  /** 内容预览 */
  contentPreview?: string;
  /** 完整内容 */
  contentFull?: string;
  /** 起始页（来自按页解析） */
  startPage?: number;
  /** 结束页（来自按页解析） */
  endPage?: number;
}

/** 章节依赖边类型 */
export type DependencyType = 'prerequisite' | 'parallel' | 'supplement';

/** 章节依赖边 */
export interface ChapterEdge {
  /** 源章节ID */
  from: string;
  /** 目标章节ID */
  to: string;
  /** 依赖类型 */
  type: DependencyType;
}

/** 章节依赖DAG */
export interface ChapterDAG {
  /** 节点列表 */
  nodes: Array<{
    id: string;
    title: string;
    role: ChapterRole;
    weight: number;
  }>;
  /** 边列表 */
  edges: ChapterEdge[];
}

/** 阶段1完整输出 */
export interface SkimResult {
  /** 全书主题 */
  thesis: BookThesis;
  /** 章节元信息列表 */
  chapters: ChapterMeta[];
  /** 章节依赖图 */
  chapterGraph: ChapterDAG;
}

// ==================== 阶段2：知识图谱构建 ====================

/** 概念类型 */
export type ConceptType = 'definition' | 'formula' | 'method' | 'example' | 'principle' | 'term';

/** 概念节点 */
export interface ConceptNode {
  /** 概念ID */
  id: string;
  /** 概念名称 */
  name: string;
  /** 所属章节ID */
  chapterId: string;
  /** 概念类型 */
  type: ConceptType;
  /** 重要性权重 (0-1) */
  weight: number;
  /** 简要描述 */
  description?: string;
  /** 详细内容（阶段3填充） */
  content?: string;
  /** 示例（阶段3填充） */
  examples?: string[];
  /** 来源引用 */
  sourceRef?: string;
}

/** 概念关系类型 */
export type RelationType = 
  | 'prerequisite'  // 前置依赖
  | 'causes'        // 因果关系
  | 'contrasts'     // 对比关系
  | 'includes'      // 包含关系
  | 'relates_to';   // 相关关系

/** 概念关系边 */
export interface ConceptEdge {
  /** 源概念ID */
  from: string;
  /** 目标概念ID */
  to: string;
  /** 关系类型 */
  type: RelationType;
  /** 关系描述 */
  description?: string;
  /** 关系权重 */
  weight?: number;
}

/** 完整知识图谱 */
export interface ConceptGraph {
  /** 概念节点列表 */
  concepts: ConceptNode[];
  /** 关系边列表 */
  relations: ConceptEdge[];
  /** 图谱元数据 */
  metadata: {
    /** 书籍ID */
    bookId: string;
    /** 创建时间 */
    createdAt: Date;
    /** 更新时间 */
    updatedAt: Date;
    /** 概念总数 */
    conceptCount: number;
    /** 关系总数 */
    relationCount: number;
  };
}

/** 阶段2完整输出 */
export interface KGBuildResult {
  /** 概念图谱 */
  graph: ConceptGraph;
  /** 核心概念排序（按权重） */
  coreConceptIds: string[];
  /** 精读优先级队列 */
  readingPriority: Array<{
    conceptId: string;
    priority: number;
    reason: string;
  }>;
}

// ==================== 阶段3：精读填充 ====================

/** 精读填充结果 */
export interface EnrichedConcept {
  /** 概念ID */
  conceptId: string;
  /** 详细内容 */
  content: string;
  /** 示例列表 */
  examples: string[];
  /** 公式（如有） */
  formulas?: string[];
  /** 易错点 */
  pitfalls?: string[];
  /** 来源文档 */
  sources: Array<{
    documentName: string;
    excerpt: string;
    relevance: number;
  }>;
}

/** 章节讲解内容 */
export interface SectionContent {
  /** 章节ID */
  chapterId: string;
  /** 讲解文本 */
  lectureText: string;
  /** 涉及的概念ID列表 */
  conceptIds: string[];
  /** 建议时长（分钟） */
  durationMinutes: number;
  /** 讲解顺序 */
  order: number;
}

/** 阶段3完整输出 */
export interface DeepReadResult {
  /** 已填充的概念 */
  enrichedConcepts: EnrichedConcept[];
  /** 章节讲解内容 */
  sectionContents: SectionContent[];
  /** 逻辑校验结果 */
  validationResult: {
    isValid: boolean;
    issues: Array<{
      type: 'missing_prerequisite' | 'circular_dependency' | 'orphan_concept';
      message: string;
      affectedIds: string[];
    }>;
  };
}

// ==================== 阶段4：输出呈现 ====================

/** 讲稿段落 */
export interface ManuscriptSection {
  /** 段落类型 */
  type: 'intro' | 'concept' | 'example' | 'exercise' | 'summary' | 'transition';
  /** 标题 */
  title: string;
  /** 内容 */
  content: string;
  /** 关联的概念ID */
  conceptIds: string[];
  /** 建议时长（分钟） */
  durationMinutes: number;
  /** 视觉提示 */
  visualHints?: string[];
}

/** 完整讲稿 */
export interface Manuscript {
  /** 书籍/章节标题 */
  title: string;
  /** 讲稿段落 */
  sections: ManuscriptSection[];
  /** 总时长（分钟） */
  totalDuration: number;
  /** Markdown 格式内容 */
  markdown: string;
}

/** 课程地图节点 */
export interface CourseMapNode {
  /** 节点ID */
  id: string;
  /** 节点类型 */
  type: 'chapter' | 'concept';
  /** 标签 */
  label: string;
  /** 权重（影响节点大小） */
  weight: number;
  /** 角色/类型（影响颜色） */
  category: string;
  /** 位置 */
  position?: { x: number; y: number };
}

/** 课程地图边 */
export interface CourseMapEdge {
  /** 边ID */
  id: string;
  /** 源节点ID */
  source: string;
  /** 目标节点ID */
  target: string;
  /** 边类型 */
  type: string;
}

/** 课程地图 */
export interface CourseMap {
  /** 节点列表 */
  nodes: CourseMapNode[];
  /** 边列表 */
  edges: CourseMapEdge[];
  /** 布局类型 */
  layout: 'dagre' | 'force' | 'radial';
}

/** 阶段4完整输出 */
export interface OutputResult {
  /** 讲稿 */
  manuscript: Manuscript;
  /** 课程地图 */
  courseMap: CourseMap;
}

// ==================== 全流程 ====================

/** 处理状态 */
export type ProcessingStatus = 
  | 'pending'
  | 'stage1_skim'
  | 'stage2_kg'
  | 'stage3_deepread'
  | 'stage4_output'
  | 'completed'
  | 'failed';

/** 全书理解会话 */
export interface BookUnderstandingSession {
  /** 会话ID */
  id: string;
  /** 知识库ID */
  knowledgeBaseId: string;
  /** 处理状态 */
  status: ProcessingStatus;
  /** 错误信息 */
  error?: string;
  /** 阶段1结果 */
  skimResult?: SkimResult;
  /** 阶段2结果 */
  kgResult?: KGBuildResult;
  /** 阶段3结果 */
  deepReadResult?: DeepReadResult;
  /** 阶段4结果 */
  outputResult?: OutputResult;
  /** 创建时间 */
  createdAt: Date;
  /** 更新时间 */
  updatedAt: Date;
}

/** 处理进度回调 */
export type ProgressCallback = (
  stage: ProcessingStatus,
  message: string,
  percent: number
) => void;

