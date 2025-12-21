/**
 * 阶段2：教学手稿生成 Agent
 * 
 * 职责：
 * - 根据教学规划生成 Markdown 格式的教学手稿
 * - 手稿是老师真正会写的讲课草稿
 * - 关注"怎么讲、先讲什么、怎么过渡"
 * - 包含 > visual: 标记表示绘图意图
 * 
 * 优化：
 * - 使用 RAG 检索每个节次的相关教材内容
 * - 结合章节重点（keyPoints）生成更充实的手稿
 */

import { OpenAI } from '@llamaindex/openai';
import { configureLLM } from '../../llm/config';
import { loadIndex } from '../../llm/index-manager';
import { hybridSearch } from '../../hybrid-search';
import type { TeachingPlan, SectionPlan } from './teaching-planner';
import type { KeyPoint } from './chapter-analyzer';

// ==================== 类型定义 ====================

/** 手稿生成输入 */
export interface ManuscriptInput {
  plan: TeachingPlan;
  knowledgeBaseId: string;       // 新增：用于 RAG 检索
  chapterKeyPoints?: KeyPoint[]; // 新增：章节重点
  chapterSummary?: string;       // 新增：章节摘要
  chapterContent?: string;       // 保留：作为备选
}

/** 手稿生成结果 */
export interface ManuscriptResult {
  success: boolean;
  markdown: string | null;
  error?: string;
}

// ==================== Prompt ====================

const MANUSCRIPT_PROMPT = `你是一位经验丰富、备课认真的优秀教师。请根据以下教学规划和教材内容，撰写一份详尽、完整的教学手稿。

## 教学规划
章节：{chapter}
年级：{grade}
学科：{subject}
时长：{duration}

教学目标：
{goals}

核心概念：
{concepts}

节次安排：
{sections}

## 章节重点（必须覆盖）
{keyPoints}

## 章节摘要
{summary}

## 教材相关内容（RAG 检索结果）
{ragContent}

## 输出要求

### 内容深度（必须遵守）
1. **每个知识点必须详细讲解**，不能只写标题
2. **概念要解释清楚**：什么是、为什么、怎么用
3. **例题要有完整过程**：题目、分析、解答步骤
4. **结合教材内容**：引用教材中的例子、公式、说明

### 格式要求
1. **格式**：使用 Markdown 格式
2. **结构**：按照节次安排组织内容
3. **语言**：面向学生，使用"我们来看..."、"请同学们注意..."等教学语言
4. **图表标记**：需要配图的地方用 \`> visual: 描述\` 标记
5. **分页**：每个节次用 \`---\` 分隔（幻灯片分页标记）
6. **公式**：用 LaTeX 语法，如 \`$y = kx + b$\`

### 示例输出

\`\`\`markdown
# 一次函数

## 本节目标
- 理解一次函数的定义和表达式
- 掌握斜率和截距的含义

---

## 一、引入：生活中的线性关系

同学们，我们先来看一个生活中的例子。

出租车是怎么计费的呢？起步价 10 元，然后每公里加收 2 元。

如果我们用 x 表示行驶的公里数，用 y 表示总费用，能写出它们之间的关系吗？

让我们一起来推导：
- 行驶 1 公里：y = 10 + 2 × 1 = 12 元
- 行驶 2 公里：y = 10 + 2 × 2 = 14 元
- 行驶 x 公里：y = 10 + 2 × x = 2x + 10

> visual: 出租车计价示意图，横轴为公里数(0-10km)，纵轴为费用(10-30元)

同学们发现没有？当 x 变化时，y 也跟着变化，而且变化是很有规律的——这就是我们今天要学习的**一次函数**！

---

## 二、概念讲解：一次函数的定义

刚才我们得到的 y = 2x + 10，它有什么特点呢？

请同学们观察：
- 未知数 x 的次数是 **1 次**（不是 x²、x³）
- 表达式形式是 **y = 某个数 × x + 另一个数**

**定义**：形如 $y = kx + b$（其中 $k \\neq 0$，k、b 是常数）的函数，叫做**一次函数**。

> visual: 一次函数的一般形式 y = kx + b，用不同颜色标注 k 和 b

其中：
- **k** 叫做**斜率**——决定直线的倾斜程度
- **b** 叫做**截距**——决定直线与 y 轴的交点位置

---
\`\`\`

## 重要提示
1. 必须详细讲解每个节次，不能敷衍
2. 引用教材内容中的例子和说明
3. 确保覆盖所有"章节重点"中的知识点
4. 每页内容要充实（每个节次至少 150-300 字）

请直接输出 Markdown 内容，不要有额外解释。`;

// ==================== 核心函数 ====================

/**
 * 生成教学手稿（带 RAG 检索）
 */
export async function generateManuscript(input: ManuscriptInput): Promise<ManuscriptResult> {
  try {
    configureLLM();

    const llm = new OpenAI({
      model: process.env.OPENAI_MODEL || 'qwen-plus',
      apiKey: process.env.OPENAI_API_KEY!,
      baseURL: process.env.OPENAI_API_BASE || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });

    const { plan, knowledgeBaseId, chapterKeyPoints, chapterSummary, chapterContent } = input;

    // 1. 格式化章节重点
    const keyPointsStr = formatKeyPoints(chapterKeyPoints);

    // 2. 通过 RAG 检索每个节次的相关教材内容
    let ragContent = '';
    if (knowledgeBaseId) {
      ragContent = await fetchSectionMaterials(knowledgeBaseId, plan);
    }

    // 如果 RAG 内容不足，使用传入的 chapterContent 作为备选
    if (ragContent.length < 500 && chapterContent) {
      ragContent = truncateContent(chapterContent, 6000);
    }

    // 3. 构建 prompt
    const prompt = MANUSCRIPT_PROMPT
      .replace('{chapter}', plan.chapter)
      .replace('{grade}', plan.constraints.grade)
      .replace('{subject}', plan.constraints.subject)
      .replace('{duration}', plan.constraints.duration)
      .replace('{goals}', plan.teaching_goals.map((g, i) => `${i + 1}. ${g}`).join('\n'))
      .replace('{concepts}', plan.key_concepts.join('、'))
      .replace('{sections}', formatSections(plan.sections))
      .replace('{keyPoints}', keyPointsStr || '（暂无，请根据教材内容自行提取）')
      .replace('{summary}', chapterSummary || '（暂无）')
      .replace('{ragContent}', ragContent || '（暂无检索结果，请根据教学规划生成）');

    console.log('[ManuscriptGenerator] Generating manuscript for:', plan.chapter);
    console.log('[ManuscriptGenerator] RAG content length:', ragContent.length);
    console.log('[ManuscriptGenerator] Key points count:', chapterKeyPoints?.length || 0);

    const response = await llm.complete({ prompt });
    let markdown = response.text.trim();

    // 清理可能的 markdown 代码块包装
    markdown = cleanMarkdown(markdown);

    console.log('[ManuscriptGenerator] Manuscript generated, length:', markdown.length);

    return {
      success: true,
      markdown,
    };
  } catch (error: any) {
    console.error('[ManuscriptGenerator] Error:', error);
    return {
      success: false,
      markdown: null,
      error: error.message || '教学手稿生成失败',
    };
  }
}

// ==================== RAG 检索函数 ====================

/**
 * 通过 RAG 检索每个节次的相关教材内容
 */
async function fetchSectionMaterials(
  knowledgeBaseId: string,
  plan: TeachingPlan
): Promise<string> {
  try {
    const index = await loadIndex(knowledgeBaseId);
    const allContent: string[] = [];
    const seenContent = new Set<string>();

    // 对每个节次进行检索
    for (const section of plan.sections) {
      // 构造查询：节次标题 + 要点
      const queryParts = [section.title];
      if (section.key_points.length > 0) {
        queryParts.push(...section.key_points.slice(0, 3));
      }
      const query = queryParts.join(' ');

      console.log(`[ManuscriptGenerator] RAG query: ${query}`);

      const results = await hybridSearch(index, knowledgeBaseId, query, {
        vectorTopK: 4,
        keywordLimit: 2,
        minVectorScore: 0.3,
      });

      for (const result of results) {
        // 去重
        const contentKey = result.content.substring(0, 80);
        if (!seenContent.has(contentKey)) {
          seenContent.add(contentKey);
          allContent.push(`【${section.title}相关】\n${result.content}`);
        }
      }
    }

    // 再做一次整体检索（章节标题 + 核心概念）
    const overallQuery = `${plan.chapter} ${plan.key_concepts.slice(0, 3).join(' ')}`;
    const overallResults = await hybridSearch(index, knowledgeBaseId, overallQuery, {
      vectorTopK: 5,
      keywordLimit: 3,
      minVectorScore: 0.35,
    });

    for (const result of overallResults) {
      const contentKey = result.content.substring(0, 80);
      if (!seenContent.has(contentKey)) {
        seenContent.add(contentKey);
        allContent.push(`【章节概述相关】\n${result.content}`);
      }
    }

    // 拼接并限制长度
    const combined = allContent.join('\n\n---\n\n');
    return truncateContent(combined, 10000);  // 给更多内容

  } catch (error: any) {
    console.error('[ManuscriptGenerator] RAG fetch error:', error);
    return '';
  }
}

// ==================== 辅助函数 ====================

/**
 * 格式化章节重点
 */
function formatKeyPoints(keyPoints?: KeyPoint[]): string {
  if (!keyPoints || keyPoints.length === 0) {
    return '';
  }

  const typeLabels: Record<string, string> = {
    concept: '📚 概念',
    formula: '📐 公式',
    example: '📝 例题',
    pitfall: '⚠️ 易错点',
    method: '💡 方法',
  };

  return keyPoints.map(kp => {
    const typeLabel = typeLabels[kp.type] || kp.type;
    const importance = kp.importance === 'high' ? '【重要】' : '';
    return `- ${typeLabel}${importance}：${kp.title}\n  ${kp.content}`;
  }).join('\n\n');
}

/**
 * 格式化节次安排
 */
function formatSections(sections: SectionPlan[]): string {
  return sections.map((s, i) => {
    const duration = s.duration_minutes ? `（${s.duration_minutes}分钟）` : '';
    const points = s.key_points.length > 0 ? `\n   要点: ${s.key_points.join('、')}` : '';
    return `${i + 1}. [${s.type}] ${s.title}${duration}${points}`;
  }).join('\n');
}

/**
 * 清理 Markdown 输出
 */
function cleanMarkdown(text: string): string {
  // 移除可能的代码块包装
  let cleaned = text;
  
  // 移除开头的 ```markdown
  if (cleaned.startsWith('```markdown')) {
    cleaned = cleaned.slice('```markdown'.length);
  } else if (cleaned.startsWith('```md')) {
    cleaned = cleaned.slice('```md'.length);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  
  // 移除结尾的 ```
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  
  return cleaned.trim();
}

/**
 * 截断内容
 */
function truncateContent(content: string, maxLength: number): string {
  if (content.length <= maxLength) {
    return content;
  }
  return content.slice(0, maxLength) + '\n\n...[内容过长，已截断]';
}
