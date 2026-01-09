/**
 * 论文处理模块
 * 用于 paper 模式：三阶段渐进式处理论文
 * - Phase 1: 段落级摘要（控制上下文长度）
 * - Phase 2: 结构识别 + 动态章节划分
 * - Phase 3: 复用现有 Agent + RAG 进行细化
 */

import { OpenAI } from '@llamaindex/openai';
import { configureLLM } from '../llm/config';

// ==================== 类型定义 ====================

/** 段落摘要 */
export interface ParagraphSummary {
  index: number;
  originalText: string;
  summary: string;
  keywords: string[];
  section: string; // abstract | intro | related | method | experiment | result | discussion | conclusion | other
}

/** 论文概述 */
export interface PaperOverview {
  title: string;
  paperType: string; // 综述 | 方法 | 系统 | 应用 | 理论 | 其他
  coreThesis: string;
  problem: string;
  method: string;
  contribution: string[];
  conclusion: string;
}

/** 动态章节 */
export interface DynamicChapter {
  id: string;
  title: string;
  goal: string;
  keyPoints: string[];
  paragraphRefs: number[];
  estimatedMinutes: number;
  importance: 'high' | 'medium' | 'low';
}

/** 论文处理结果 */
export interface PaperProcessingResult {
  success: boolean;
  paragraphSummaries: ParagraphSummary[];
  paperOverview: PaperOverview | null;
  chapters: DynamicChapter[];
  metadata?: {
    totalParagraphs: number;
    totalChapters: number;
    processedAt: string;
  };
  error?: string;
}

// ==================== 常量 ====================

const MAX_PARAGRAPH_CHARS = 1500; // 每段最大字数
const CONCURRENCY_LIMIT = 3; // 并发限制
const API_DELAY_MS = 500; // API 调用间隔

// ==================== Prompts ====================

const PARAGRAPH_SUMMARY_PROMPT = `你是论文分析专家。请分析以下论文段落，生成简洁摘要。

## 段落内容
{content}

## 任务
1. 用 2-3 句话概括这段的核心内容
2. 提取 3-5 个关键词
3. 推断这段属于论文的哪个部分

## 输出格式（JSON）
{
  "summary": "段落摘要（50-100字）",
  "keywords": ["关键词1", "关键词2", "关键词3"],
  "section": "method"
}

section 可选值：abstract, intro, related, method, experiment, result, discussion, conclusion, other

请直接输出 JSON，不要有其他内容。`;

const PAPER_OVERVIEW_PROMPT = `你是论文分析专家。基于以下论文段落摘要，生成全面的论文概述。

## 段落摘要
{summaries}

## 任务
请从技术分享者的角度，分析这篇论文并提取：

1. **论文类型**：综述/方法/系统/应用/理论/其他
2. **核心论点**：这篇论文最想证明/说明的是什么？
3. **要解决的问题**：论文针对什么具体问题？现有方案有什么不足？
4. **方法概述**：论文提出了什么方法？有什么创新点？
5. **主要贡献**：论文的 3-5 个核心贡献是什么？
6. **核心结论**：最终验证了什么？有什么启示？

## 输出格式（JSON）
{
  "title": "论文标题（从内容推断）",
  "paperType": "方法",
  "coreThesis": "核心论点...",
  "problem": "要解决的问题...",
  "method": "方法概述...",
  "contribution": ["贡献1", "贡献2", "贡献3"],
  "conclusion": "核心结论..."
}

请直接输出 JSON，不要有其他内容。`;

const DYNAMIC_CHAPTER_PROMPT = `你是技术培训专家。请基于以下论文分析，设计一个**适合这篇论文内容**的培训章节结构。

## 论文概述
{overview}

## 段落摘要（带编号）
{summaries}

## 任务

请从"技术分享者"的角度，将这篇论文重新组织为适合培训/讲解的章节结构。

### 重要原则
1. **不要套用固定模板**：根据论文的实际内容和类型，灵活设计章节
2. **章节数量 3-7 个**：太少信息不完整，太多听众难以消化
3. **每个章节有明确的教学目标**：听众听完这个章节能学到什么
4. **突出重点**：论文的核心创新点应该占较大篇幅
5. **连贯性**：章节之间有逻辑递进关系

### 参考建议（但不必严格遵循）
- 综述类：可以按"演进脉络"、"方案对比"、"最佳实践"组织
- 方法类：可以按"问题定义"、"核心算法"、"优化技巧"组织
- 系统类：可以按"架构设计"、"关键模块"、"性能优化"组织
- 应用类：可以按"场景分析"、"解决方案"、"落地效果"组织

## 输出格式（JSON）
{
  "designRationale": "为什么这样划分章节（一句话）",
  "chapters": [
    {
      "title": "章节标题（简洁有吸引力）",
      "goal": "教学目标：听众听完能学到什么",
      "keyPoints": ["知识点1", "知识点2"],
      "paragraphRefs": [1, 2, 3],
      "estimatedMinutes": 5,
      "importance": "high"
    }
  ]
}

importance 可选值：high, medium, low

请根据论文的实际内容自由设计，不要生搬硬套。直接输出 JSON，不要有其他内容。`;

// ==================== 工具函数 ====================

/**
 * 按自然段落切分文本
 */
export function splitIntoParagraphs(content: string, maxChars: number = MAX_PARAGRAPH_CHARS): string[] {
  // 按双换行符切分（通常是段落边界）
  const rawParagraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  
  const paragraphs: string[] = [];
  let currentParagraph = '';
  
  for (const raw of rawParagraphs) {
    const trimmed = raw.trim();
    
    // 如果当前段落加上新内容不超过限制，合并
    if (currentParagraph.length + trimmed.length + 2 <= maxChars) {
      currentParagraph = currentParagraph 
        ? currentParagraph + '\n\n' + trimmed 
        : trimmed;
    } else {
      // 保存当前段落，开始新段落
      if (currentParagraph) {
        paragraphs.push(currentParagraph);
      }
      
      // 如果单个段落就超过限制，强制切分
      if (trimmed.length > maxChars) {
        const chunks = splitLongText(trimmed, maxChars);
        paragraphs.push(...chunks);
        currentParagraph = '';
      } else {
        currentParagraph = trimmed;
      }
    }
  }
  
  // 保存最后一个段落
  if (currentParagraph) {
    paragraphs.push(currentParagraph);
  }
  
  return paragraphs;
}

/**
 * 强制切分超长文本
 */
function splitLongText(text: string, maxChars: number): string[] {
  const chunks: string[] = [];
  let remaining = text;
  
  while (remaining.length > maxChars) {
    // 尝试在句号处切分
    let splitIndex = remaining.lastIndexOf('。', maxChars);
    if (splitIndex === -1 || splitIndex < maxChars * 0.5) {
      splitIndex = remaining.lastIndexOf('.', maxChars);
    }
    if (splitIndex === -1 || splitIndex < maxChars * 0.5) {
      splitIndex = maxChars;
    } else {
      splitIndex += 1; // 包含句号
    }
    
    chunks.push(remaining.substring(0, splitIndex).trim());
    remaining = remaining.substring(splitIndex).trim();
  }
  
  if (remaining) {
    chunks.push(remaining);
  }
  
  return chunks;
}

/**
 * 延迟函数
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 创建 LLM 实例
 */
function createLLM(): OpenAI {
  configureLLM();
  return new OpenAI({
    model: process.env.OPENAI_MODEL || 'qwen-plus',
    apiKey: process.env.OPENAI_API_KEY!,
    baseURL: process.env.OPENAI_API_BASE || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  });
}

/**
 * 安全解析 JSON
 */
function safeParseJSON<T>(text: string, defaultValue: T): T {
  try {
    // 尝试提取 JSON 块
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : text;
    
    // 尝试匹配 JSON 对象
    const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      return JSON.parse(objectMatch[0]);
    }
    
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error('[PaperProcessor] Failed to parse JSON:', error);
    return defaultValue;
  }
}

// ==================== Phase 1: 段落级摘要 ====================

/**
 * 为单个段落生成摘要
 */
async function summarizeParagraph(
  llm: OpenAI,
  paragraph: string,
  index: number
): Promise<ParagraphSummary> {
  const prompt = PARAGRAPH_SUMMARY_PROMPT.replace('{content}', paragraph);
  
  try {
    const response = await llm.complete({ prompt });
    const parsed = safeParseJSON<{ summary: string; keywords: string[]; section: string }>(
      response.text,
      { summary: paragraph.substring(0, 100), keywords: [], section: 'other' }
    );
    
    return {
      index,
      originalText: paragraph,
      summary: parsed.summary || paragraph.substring(0, 100),
      keywords: parsed.keywords || [],
      section: parsed.section || 'other',
    };
  } catch (error) {
    console.error(`[PaperProcessor] Failed to summarize paragraph ${index}:`, error);
    return {
      index,
      originalText: paragraph,
      summary: paragraph.substring(0, 100) + '...',
      keywords: [],
      section: 'other',
    };
  }
}

/**
 * Phase 1: 提取所有段落摘要
 */
export async function extractParagraphSummaries(
  content: string,
  onProgress?: (message: string) => void
): Promise<ParagraphSummary[]> {
  const llm = createLLM();
  const paragraphs = splitIntoParagraphs(content);
  
  onProgress?.(`正在分析论文，共 ${paragraphs.length} 个段落...`);
  
  const summaries: ParagraphSummary[] = [];
  
  // 逐段处理（带并发控制）
  for (let i = 0; i < paragraphs.length; i += CONCURRENCY_LIMIT) {
    const batch = paragraphs.slice(i, i + CONCURRENCY_LIMIT);
    const batchPromises = batch.map((p, j) => summarizeParagraph(llm, p, i + j));
    
    const batchResults = await Promise.all(batchPromises);
    summaries.push(...batchResults);
    
    const progress = Math.min(i + CONCURRENCY_LIMIT, paragraphs.length);
    onProgress?.(`段落摘要提取中... ${progress}/${paragraphs.length}`);
    
    // 避免 API 限流
    if (i + CONCURRENCY_LIMIT < paragraphs.length) {
      await sleep(API_DELAY_MS);
    }
  }
  
  return summaries;
}

// ==================== Phase 2: 结构识别 + 动态章节 ====================

/**
 * 格式化摘要列表（用于 LLM 输入）
 */
function formatSummariesForLLM(summaries: ParagraphSummary[]): string {
  return summaries
    .map((s, i) => `[${i + 1}] (${s.section}) ${s.summary}`)
    .join('\n');
}

/**
 * Phase 2a: 分析论文结构，生成概述
 */
export async function analyzePaperStructure(
  summaries: ParagraphSummary[],
  onProgress?: (message: string) => void
): Promise<PaperOverview | null> {
  const llm = createLLM();
  
  onProgress?.('正在分析论文结构...');
  
  const summaryText = formatSummariesForLLM(summaries);
  const prompt = PAPER_OVERVIEW_PROMPT.replace('{summaries}', summaryText);
  
  try {
    const response = await llm.complete({ prompt });
    const parsed = safeParseJSON<PaperOverview>(response.text, null as any);
    
    if (!parsed || !parsed.title) {
      console.error('[PaperProcessor] Failed to parse paper overview');
      return null;
    }
    
    return parsed;
  } catch (error) {
    console.error('[PaperProcessor] Error analyzing paper structure:', error);
    return null;
  }
}

/**
 * Phase 2b: 动态生成章节结构
 */
export async function generateDynamicChapters(
  summaries: ParagraphSummary[],
  overview: PaperOverview,
  onProgress?: (message: string) => void
): Promise<DynamicChapter[]> {
  const llm = createLLM();
  
  onProgress?.('正在规划培训章节...');
  
  const summaryText = formatSummariesForLLM(summaries);
  const prompt = DYNAMIC_CHAPTER_PROMPT
    .replace('{overview}', JSON.stringify(overview, null, 2))
    .replace('{summaries}', summaryText);
  
  try {
    const response = await llm.complete({ prompt });
    const parsed = safeParseJSON<{ 
      designRationale: string; 
      chapters: Array<{
        title: string;
        goal: string;
        keyPoints: string[];
        paragraphRefs: number[];
        estimatedMinutes: number;
        importance: string;
      }>;
    }>(response.text, { designRationale: '', chapters: [] });
    
    if (!parsed.chapters || parsed.chapters.length === 0) {
      console.error('[PaperProcessor] No chapters generated');
      // 回退：创建默认章节
      return createDefaultChapters(summaries, overview);
    }
    
    
    return parsed.chapters.map((ch, index) => ({
      id: `chapter-${index + 1}`,
      title: ch.title,
      goal: ch.goal,
      keyPoints: ch.keyPoints || [],
      paragraphRefs: ch.paragraphRefs || [],
      estimatedMinutes: ch.estimatedMinutes || 5,
      importance: (ch.importance as 'high' | 'medium' | 'low') || 'medium',
    }));
  } catch (error) {
    console.error('[PaperProcessor] Error generating chapters:', error);
    return createDefaultChapters(summaries, overview);
  }
}

/**
 * 创建默认章节（回退方案）
 */
function createDefaultChapters(
  summaries: ParagraphSummary[],
  overview: PaperOverview
): DynamicChapter[] {
  // 按 section 分组
  const sectionGroups = new Map<string, number[]>();
  summaries.forEach((s, i) => {
    const group = sectionGroups.get(s.section) || [];
    group.push(i + 1);
    sectionGroups.set(s.section, group);
  });
  
  const sectionTitles: Record<string, string> = {
    abstract: '摘要与概述',
    intro: '背景与引言',
    related: '相关工作',
    method: '方法与技术',
    experiment: '实验设计',
    result: '实验结果',
    discussion: '讨论与分析',
    conclusion: '结论与展望',
    other: '其他内容',
  };
  
  const chapters: DynamicChapter[] = [];
  let index = 0;
  
  for (const [section, refs] of sectionGroups) {
    if (refs.length > 0) {
      chapters.push({
        id: `chapter-${++index}`,
        title: sectionTitles[section] || section,
        goal: `了解论文的${sectionTitles[section] || section}部分`,
        keyPoints: [],
        paragraphRefs: refs,
        estimatedMinutes: Math.max(3, refs.length * 2),
        importance: section === 'method' || section === 'result' ? 'high' : 'medium',
      });
    }
  }
  
  return chapters;
}

// ==================== 主入口 ====================

/**
 * 处理论文（Phase 1-2）
 * 返回章节结构，Phase 3 由现有的 Agent + RAG 完成
 */
export async function processPaper(
  content: string,
  onProgress?: (message: string) => void
): Promise<PaperProcessingResult> {
  try {
    
    if (!content || content.trim().length < 500) {
      return {
        success: false,
        paragraphSummaries: [],
        paperOverview: null,
        chapters: [],
        error: '论文内容太短，无法进行有效分析',
      };
    }
    
    // Phase 1: 段落级摘要
    const summaries = await extractParagraphSummaries(content, onProgress);
    
    if (summaries.length === 0) {
      return {
        success: false,
        paragraphSummaries: [],
        paperOverview: null,
        chapters: [],
        error: '无法提取论文段落',
      };
    }
    
    // Phase 2a: 分析论文结构
    const overview = await analyzePaperStructure(summaries, onProgress);
    
    if (!overview) {
      return {
        success: false,
        paragraphSummaries: summaries,
        paperOverview: null,
        chapters: [],
        error: '无法分析论文结构',
      };
    }
    
    // Phase 2b: 动态生成章节
    const chapters = await generateDynamicChapters(summaries, overview, onProgress);
    
    onProgress?.(`论文处理完成，共生成 ${chapters.length} 个章节`);
    
    return {
      success: true,
      paragraphSummaries: summaries,
      paperOverview: overview,
      chapters,
      metadata: {
        totalParagraphs: summaries.length,
        totalChapters: chapters.length,
        processedAt: new Date().toISOString(),
      },
    };
  } catch (error: any) {
    console.error('[PaperProcessor] Error:', error);
    return {
      success: false,
      paragraphSummaries: [],
      paperOverview: null,
      chapters: [],
      error: error.message || '论文处理失败',
    };
  }
}

/**
 * 将论文处理结果转换为 TeachingChapter 格式
 * 添加"全文"根节点，包含论文概述，子章节是各个动态章节
 */
export function paperResultToChapterNodes(
  result: PaperProcessingResult,
  originalContent: string
): Array<{
  title: string;
  level: number;
  orderIndex: number;
  contentPreview: string;
  contentFull: string;
  children: any[];
  metadata?: any;
}> {
  if (!result.success || result.chapters.length === 0) {
    return [];
  }
  
  // 创建段落索引映射
  const paragraphMap = new Map<number, ParagraphSummary>();
  result.paragraphSummaries.forEach(s => paragraphMap.set(s.index + 1, s));
  
  const overview = result.paperOverview;
  
  // 构建"全文"根节点的内容（基于论文概述，不是全部原文）
  const fullPaperContent = overview ? `# ${overview.title}

## 论文类型
${overview.paperType}

## 核心论点
${overview.coreThesis}

## 要解决的问题
${overview.problem}

## 方法概述
${overview.method}

## 主要贡献
${overview.contribution.map((c, i) => `${i + 1}. ${c}`).join('\n')}

## 核心结论
${overview.conclusion}

---

## 章节概要

${result.chapters.map((ch, i) => `### ${i + 1}. ${ch.title}
**目标**: ${ch.goal}
**知识点**: ${ch.keyPoints.join('、')}
**预估时长**: ${ch.estimatedMinutes} 分钟
`).join('\n')}
` : '论文概述生成失败';

  // 创建子章节
  const childChapters = result.chapters.map((chapter, index) => {
    const relatedParagraphs = chapter.paragraphRefs
      .map(ref => paragraphMap.get(ref))
      .filter((p): p is ParagraphSummary => !!p);
    
    const contentFull = relatedParagraphs
      .map(p => p.originalText)
      .join('\n\n---\n\n');
    
    const contentPreview = chapter.goal + '\n\n' + 
      (relatedParagraphs[0]?.summary || contentFull.substring(0, 300));
    
    return {
      title: chapter.title,
      level: 2, // 子章节 level=2
      orderIndex: index + 1,
      contentPreview: contentPreview.substring(0, 500),
      contentFull,
      children: [],
      metadata: {
        paperType: overview?.paperType,
        goal: chapter.goal,
        keyPoints: chapter.keyPoints,
        estimatedMinutes: chapter.estimatedMinutes,
        importance: chapter.importance,
        paragraphRefs: chapter.paragraphRefs,
        paragraphSummaries: relatedParagraphs.map(p => ({
          index: p.index,
          summary: p.summary,
          keywords: p.keywords,
          section: p.section,
        })),
      },
    };
  });

  // 返回嵌套结构：全文根节点包含子章节
  return [
    {
      title: overview?.title || '论文全文',
      level: 1,
      orderIndex: 0,
      contentPreview: overview 
        ? `${overview.coreThesis}\n\n${overview.conclusion}`.substring(0, 500)
        : '论文概述',
      contentFull: fullPaperContent,
      children: childChapters, // 子章节嵌套在 children 中
      metadata: {
        isPaperRoot: true, // 标记为论文根节点
        paperType: overview?.paperType,
        coreThesis: overview?.coreThesis,
        problem: overview?.problem,
        method: overview?.method,
        contribution: overview?.contribution,
        conclusion: overview?.conclusion,
        totalChapters: result.chapters.length,
        totalParagraphs: result.paragraphSummaries.length,
      },
    },
  ];
}

