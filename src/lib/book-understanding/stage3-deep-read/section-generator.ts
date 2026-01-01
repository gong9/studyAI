/**
 * 阶段3：章节讲解内容生成
 * 
 * 职责：
 * - 按 KG 结构生成讲稿/课件段落
 * - 确保概念讲解顺序符合依赖关系
 * - 逻辑检查
 * 
 * 原则：基于 KG 导航生成，保证逻辑可追踪
 */

import { OpenAI } from '@llamaindex/openai';
import { configureLLM } from '../../llm/config';
import type { 
  ChapterMeta, 
  ConceptGraph, 
  EnrichedConcept, 
  SectionContent,
  DeepReadResult
} from '../types';

// ==================== 类型定义 ====================

export interface SectionGeneratorInput {
  /** 章节列表 */
  chapters: ChapterMeta[];
  /** 概念图谱 */
  graph: ConceptGraph;
  /** 已填充的概念 */
  enrichedConcepts: EnrichedConcept[];
}

export interface SectionGeneratorOutput {
  success: boolean;
  result: DeepReadResult | null;
  error?: string;
}

// ==================== Prompt ====================

const SECTION_GENERATE_PROMPT = `你是一位资深教师。请根据以下信息，生成该章节的讲解内容。

## 章节信息
标题：{chapterTitle}
角色：{chapterRole}
目标：{chapterGoal}

## 本章概念及内容
{conceptContents}

## 任务
生成一段完整的讲解文本，要求：
1. 按概念依赖顺序组织内容
2. 语言通俗易懂，适合讲课
3. 包含适当的过渡和总结
4. 时长控制在 {durationMinutes} 分钟左右

## 输出格式
直接输出讲解文本，不需要 JSON 格式。使用自然的口语化表达。

开头可以用"这节课我们来学习..."等引导语。`;

// ==================== 核心函数 ====================

/**
 * 生成章节讲解内容
 */
export async function generateSectionContent(input: SectionGeneratorInput): Promise<SectionGeneratorOutput> {
  try {
    configureLLM();

    const { chapters, graph, enrichedConcepts } = input;

    if (chapters.length === 0) {
      return {
        success: false,
        result: null,
        error: '没有章节可生成',
      };
    }

    const llm = new OpenAI({
      model: process.env.OPENAI_MODEL || 'qwen-plus',
      apiKey: process.env.OPENAI_API_KEY!,
      baseURL: process.env.OPENAI_API_BASE || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });

    // 创建概念 ID 到丰富内容的映射
    const enrichedMap = new Map<string, EnrichedConcept>();
    for (const e of enrichedConcepts) {
      enrichedMap.set(e.conceptId, e);
    }

    // 创建概念 ID 到章节的映射
    const conceptsByChapter = new Map<string, string[]>();
    for (const c of graph.concepts) {
      if (!conceptsByChapter.has(c.chapterId)) {
        conceptsByChapter.set(c.chapterId, []);
      }
      conceptsByChapter.get(c.chapterId)!.push(c.id);
    }

    const sectionContents: SectionContent[] = [];
    const validationIssues: DeepReadResult['validationResult']['issues'] = [];

    console.log('[SectionGenerator] Generating content for', chapters.length, 'chapters');

    // 按章节顺序生成
    let order = 0;
    for (const chapter of chapters) {
      if (chapter.role === 'reference') {
        // 跳过参考章节
        continue;
      }

      try {
        const conceptIds = conceptsByChapter.get(chapter.id) || [];
        
        // 按依赖顺序排列概念
        const sortedConceptIds = sortConceptsByDependency(conceptIds, graph);
        
        // 检查是否有缺失的前置概念
        const missingPrereqs = checkPrerequisites(sortedConceptIds, enrichedMap, graph);
        if (missingPrereqs.length > 0) {
          validationIssues.push({
            type: 'missing_prerequisite',
            message: `章节 ${chapter.title} 缺少前置概念`,
            affectedIds: missingPrereqs,
          });
        }

        // 生成讲解内容
        const content = await generateChapterContent(
          llm,
          chapter,
          sortedConceptIds,
          graph,
          enrichedMap
        );

        order++;
        sectionContents.push({
          chapterId: chapter.id,
          lectureText: content,
          conceptIds: sortedConceptIds,
          durationMinutes: estimateDuration(content),
          order,
        });

        // 避免 API 限流
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (e) {
        console.error(`[SectionGenerator] Failed to generate ${chapter.title}:`, e);
      }
    }

    console.log('[SectionGenerator] Generated', sectionContents.length, 'sections');

    return {
      success: true,
      result: {
        enrichedConcepts,
        sectionContents,
        validationResult: {
          isValid: validationIssues.length === 0,
          issues: validationIssues,
        },
      },
    };
  } catch (error: any) {
    console.error('[SectionGenerator] Error:', error);
    return {
      success: false,
      result: null,
      error: error.message || '章节内容生成失败',
    };
  }
}

// ==================== 辅助函数 ====================

/**
 * 按依赖顺序排列概念
 */
function sortConceptsByDependency(conceptIds: string[], graph: ConceptGraph): string[] {
  // 构建依赖图
  const adjList = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  
  const conceptSet = new Set(conceptIds);
  
  for (const id of conceptIds) {
    adjList.set(id, []);
    inDegree.set(id, 0);
  }

  // 只考虑 prerequisite 类型的边
  for (const rel of graph.relations) {
    if (rel.type === 'prerequisite' && conceptSet.has(rel.from) && conceptSet.has(rel.to)) {
      adjList.get(rel.from)!.push(rel.to);
      inDegree.set(rel.to, (inDegree.get(rel.to) || 0) + 1);
    }
  }

  // 拓扑排序
  const sorted: string[] = [];
  const queue: string[] = [];

  for (const id of conceptIds) {
    if ((inDegree.get(id) || 0) === 0) {
      queue.push(id);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);

    for (const neighbor of adjList.get(current) || []) {
      inDegree.set(neighbor, (inDegree.get(neighbor) || 0) - 1);
      if ((inDegree.get(neighbor) || 0) === 0) {
        queue.push(neighbor);
      }
    }
  }

  // 如果有环，添加剩余的概念
  for (const id of conceptIds) {
    if (!sorted.includes(id)) {
      sorted.push(id);
    }
  }

  return sorted;
}

/**
 * 检查前置概念是否已填充
 */
function checkPrerequisites(
  conceptIds: string[],
  enrichedMap: Map<string, EnrichedConcept>,
  graph: ConceptGraph
): string[] {
  const missing: string[] = [];
  const conceptSet = new Set(conceptIds);

  for (const rel of graph.relations) {
    if (rel.type === 'prerequisite' && conceptSet.has(rel.to)) {
      // to 依赖 from，检查 from 是否已填充
      if (!enrichedMap.has(rel.from)) {
        missing.push(rel.from);
      }
    }
  }

  return [...new Set(missing)];
}

/**
 * 生成单个章节的讲解内容
 */
async function generateChapterContent(
  llm: OpenAI,
  chapter: ChapterMeta,
  conceptIds: string[],
  graph: ConceptGraph,
  enrichedMap: Map<string, EnrichedConcept>
): Promise<string> {
  // 构建概念内容
  const conceptContents = conceptIds.map(id => {
    const concept = graph.concepts.find(c => c.id === id);
    const enriched = enrichedMap.get(id);
    
    if (!concept) return '';
    
    let content = `### ${concept.name}\n`;
    if (enriched?.content) {
      content += enriched.content + '\n';
    } else if (concept.description) {
      content += concept.description + '\n';
    }
    
    if (enriched?.examples && enriched.examples.length > 0) {
      content += `\n示例：\n${enriched.examples.map(e => `- ${e}`).join('\n')}\n`;
    }
    
    if (enriched?.pitfalls && enriched.pitfalls.length > 0) {
      content += `\n注意：\n${enriched.pitfalls.map(p => `- ${p}`).join('\n')}\n`;
    }
    
    return content;
  }).filter(Boolean).join('\n\n');

  // 估算时长
  const durationMinutes = Math.max(5, Math.min(20, Math.ceil(conceptIds.length * 3)));

  const prompt = SECTION_GENERATE_PROMPT
    .replace('{chapterTitle}', chapter.title)
    .replace('{chapterRole}', chapter.role)
    .replace('{chapterGoal}', chapter.goal)
    .replace('{conceptContents}', conceptContents || '暂无详细内容')
    .replace('{durationMinutes}', String(durationMinutes));

  const response = await llm.complete({ prompt });
  return response.text.trim();
}

/**
 * 估算讲解时长（分钟）
 */
function estimateDuration(text: string): number {
  // 按每分钟 200 字估算
  const charCount = text.length;
  return Math.max(3, Math.ceil(charCount / 200));
}

