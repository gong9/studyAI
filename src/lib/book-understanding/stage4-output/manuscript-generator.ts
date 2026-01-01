/**
 * 阶段4：讲稿生成
 * 
 * 职责：
 * - 基于 KG + 精读内容生成完整讲稿
 * - 按章节/概念依赖顺序组织
 * - 生成 Markdown 格式输出
 * 
 * 原则：基于已有结构化内容组装，最小化额外 LLM 调用
 */

import type { 
  BookThesis,
  ChapterMeta,
  ConceptGraph,
  DeepReadResult,
  Manuscript,
  ManuscriptSection,
  OutputResult
} from '../types';

// ==================== 类型定义 ====================

export interface ManuscriptGeneratorInput {
  /** 全书主题 */
  thesis: BookThesis;
  /** 章节列表 */
  chapters: ChapterMeta[];
  /** 概念图谱 */
  graph: ConceptGraph;
  /** 精读结果 */
  deepReadResult: DeepReadResult;
}

export interface ManuscriptGeneratorOutput {
  success: boolean;
  manuscript: Manuscript | null;
  error?: string;
}

// ==================== 核心函数 ====================

/**
 * 生成完整讲稿
 */
export function generateManuscript(input: ManuscriptGeneratorInput): ManuscriptGeneratorOutput {
  try {
    const { thesis, chapters, graph, deepReadResult } = input;

    // 创建章节内容映射
    const sectionMap = new Map<string, typeof deepReadResult.sectionContents[0]>();
    for (const section of deepReadResult.sectionContents) {
      sectionMap.set(section.chapterId, section);
    }

    // 创建概念填充映射
    const enrichedMap = new Map<string, typeof deepReadResult.enrichedConcepts[0]>();
    for (const enriched of deepReadResult.enrichedConcepts) {
      enrichedMap.set(enriched.conceptId, enriched);
    }

    // 生成讲稿段落
    const sections: ManuscriptSection[] = [];
    let totalDuration = 0;

    // 1. 开场介绍
    sections.push({
      type: 'intro',
      title: '课程介绍',
      content: generateIntro(thesis),
      conceptIds: [],
      durationMinutes: 3,
    });
    totalDuration += 3;

    // 2. 按章节生成内容
    for (const chapter of chapters) {
      if (chapter.role === 'reference') continue;

      const sectionContent = sectionMap.get(chapter.id);
      
      // 章节标题过渡
      sections.push({
        type: 'transition',
        title: chapter.title,
        content: generateTransition(chapter),
        conceptIds: [],
        durationMinutes: 1,
      });
      totalDuration += 1;

      // 章节主体内容
      if (sectionContent) {
        const conceptIds = sectionContent.conceptIds;
        
        // 概念讲解
        for (const conceptId of conceptIds) {
          const concept = graph.concepts.find(c => c.id === conceptId);
          const enriched = enrichedMap.get(conceptId);
          
          if (concept) {
            const conceptSection = generateConceptSection(concept, enriched);
            sections.push({
              type: 'concept',
              title: concept.name,
              content: conceptSection.content,
              conceptIds: [conceptId],
              durationMinutes: conceptSection.duration,
              visualHints: conceptSection.visualHints,
            });
            totalDuration += conceptSection.duration;
          }
        }
      }

      // 章节小结
      sections.push({
        type: 'summary',
        title: `${chapter.title}小结`,
        content: generateChapterSummary(chapter, graph),
        conceptIds: [],
        durationMinutes: 2,
      });
      totalDuration += 2;
    }

    // 3. 课程总结
    sections.push({
      type: 'summary',
      title: '课程总结',
      content: generateFinalSummary(thesis, chapters, graph),
      conceptIds: [],
      durationMinutes: 3,
    });
    totalDuration += 3;

    // 生成 Markdown
    const markdown = generateMarkdown(thesis, sections);

    console.log('[ManuscriptGenerator] Generated', sections.length, 'sections, total', totalDuration, 'minutes');

    return {
      success: true,
      manuscript: {
        title: thesis.title,
        sections,
        totalDuration,
        markdown,
      },
    };
  } catch (error: any) {
    console.error('[ManuscriptGenerator] Error:', error);
    return {
      success: false,
      manuscript: null,
      error: error.message || '讲稿生成失败',
    };
  }
}

// ==================== 辅助函数 ====================

/**
 * 生成开场介绍
 */
function generateIntro(thesis: BookThesis): string {
  return `大家好，欢迎来到今天的课程。

今天我们要学习的主题是：**${thesis.title}**。

${thesis.summary}

这门课程主要面向${thesis.audience}，通过学习，你将掌握以下核心内容：
${thesis.keywords.slice(0, 5).map(k => `- ${k}`).join('\n')}

让我们开始今天的学习吧！`;
}

/**
 * 生成过渡语
 */
function generateTransition(chapter: ChapterMeta): string {
  const roleText = {
    core: '这是本课程的核心内容',
    foundation: '这是后续内容的基础',
    extension: '这是对前面内容的延伸',
    reference: '这是参考内容',
  }[chapter.role];

  return `接下来，我们进入**${chapter.title}**的学习。

${chapter.goal}

${roleText}，请大家认真听讲。`;
}

/**
 * 生成概念讲解段落
 */
function generateConceptSection(
  concept: typeof import('../types').ConceptNode.prototype,
  enriched?: typeof import('../types').EnrichedConcept.prototype
): { content: string; duration: number; visualHints: string[] } {
  const visualHints: string[] = [];
  let content = `### ${concept.name}\n\n`;

  // 概念内容
  if (enriched?.content) {
    content += enriched.content + '\n\n';
  } else if (concept.description) {
    content += concept.description + '\n\n';
  }

  // 示例
  if (enriched?.examples && enriched.examples.length > 0) {
    content += '**举例说明：**\n';
    content += enriched.examples.map((e, i) => `${i + 1}. ${e}`).join('\n');
    content += '\n\n';
    visualHints.push('示例展示');
  }

  // 公式
  if (enriched?.formulas && enriched.formulas.length > 0) {
    content += '**关键公式：**\n';
    content += enriched.formulas.map(f => `- ${f}`).join('\n');
    content += '\n\n';
    visualHints.push('公式展示');
  }

  // 易错点
  if (enriched?.pitfalls && enriched.pitfalls.length > 0) {
    content += '**注意事项：**\n';
    content += enriched.pitfalls.map(p => `⚠️ ${p}`).join('\n');
    content += '\n\n';
    visualHints.push('重点标记');
  }

  // 估算时长
  const duration = Math.max(2, Math.ceil(content.length / 200));

  return { content, duration, visualHints };
}

/**
 * 生成章节小结
 */
function generateChapterSummary(chapter: ChapterMeta, graph: ConceptGraph): string {
  const chapterConcepts = graph.concepts
    .filter(c => c.chapterId === chapter.id)
    .map(c => c.name);

  return `这一节我们学习了 **${chapter.title}**。

主要涉及的概念包括：${chapterConcepts.slice(0, 5).join('、')}${chapterConcepts.length > 5 ? '等' : ''}。

请大家课后复习巩固。`;
}

/**
 * 生成课程总结
 */
function generateFinalSummary(
  thesis: BookThesis,
  chapters: ChapterMeta[],
  graph: ConceptGraph
): string {
  const coreChapters = chapters.filter(c => c.role === 'core');
  const coreConceptCount = graph.concepts.filter(c => c.weight >= 0.5).length;

  return `今天的课程到此结束。

我们共学习了 **${chapters.filter(c => c.role !== 'reference').length}** 个章节，涵盖 **${graph.concepts.length}** 个概念。

**核心内容回顾：**
${coreChapters.slice(0, 4).map(c => `- ${c.title}：${c.goal}`).join('\n')}

其中有 **${coreConceptCount}** 个核心概念需要重点掌握。

${thesis.topic}

希望大家通过今天的学习，能够${thesis.keywords.slice(0, 3).join('、')}。

谢谢大家！`;
}

/**
 * 生成 Markdown 格式讲稿
 */
function generateMarkdown(thesis: BookThesis, sections: ManuscriptSection[]): string {
  let md = `# ${thesis.title}\n\n`;
  md += `> ${thesis.summary}\n\n`;
  md += `**目标读者：** ${thesis.audience}\n\n`;
  md += `---\n\n`;

  for (const section of sections) {
    // 根据类型或标题智能选择标记
    const getEmoji = (type?: string, title?: string) => {
      // 先看 type
      if (type) {
        const typeMap: Record<string, string> = {
          intro: '🎬',
          concept: '📖',
          example: '💡',
          exercise: '✏️',
          summary: '📝',
          transition: '➡️',
          background: '📋',
          architecture: '🏗️',
          demo: '🎮',
          code: '💻',
          best_practices: '⭐',
          qa: '❓',
        };
        if (typeMap[type]) return typeMap[type];
      }
      // 再看标题关键词
      const lowerTitle = (title || '').toLowerCase();
      if (lowerTitle.includes('介绍') || lowerTitle.includes('引入') || lowerTitle.includes('intro')) return '🎬';
      if (lowerTitle.includes('概念') || lowerTitle.includes('定义') || lowerTitle.includes('什么是')) return '📖';
      if (lowerTitle.includes('例') || lowerTitle.includes('案例') || lowerTitle.includes('example')) return '💡';
      if (lowerTitle.includes('练习') || lowerTitle.includes('作业')) return '✏️';
      if (lowerTitle.includes('总结') || lowerTitle.includes('小结') || lowerTitle.includes('summary')) return '📝';
      if (lowerTitle.includes('代码') || lowerTitle.includes('实现') || lowerTitle.includes('code')) return '💻';
      if (lowerTitle.includes('架构') || lowerTitle.includes('设计')) return '🏗️';
      if (lowerTitle.includes('演示') || lowerTitle.includes('demo')) return '🎮';
      return '📌';
    };
    
    const emoji = getEmoji(section.type, section.title);

    md += `## ${emoji} ${section.title}\n\n`;
    md += `*预计时长：${section.durationMinutes} 分钟*\n\n`;
    md += section.content + '\n\n';

    if (section.visualHints && section.visualHints.length > 0) {
      md += `> 💡 视觉提示：${section.visualHints.join('、')}\n\n`;
    }

    md += `---\n\n`;
  }

  return md;
}

