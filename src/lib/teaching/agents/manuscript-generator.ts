/**
 * 阶段2：教学手稿生成 Agent
 * 
 * 职责：
 * - 根据教学规划生成 Markdown 格式的教学手稿
 * - 手稿是老师真正会写的讲课草稿
 * - 关注"怎么讲、先讲什么、怎么过渡"
 * - 包含 > visual: 标记表示绘图意图
 */

import { OpenAI } from '@llamaindex/openai';
import { configureLLM } from '../../llm/config';
import type { TeachingPlan, SectionPlan } from './teaching-planner';

// ==================== 类型定义 ====================

/** 手稿生成输入 */
export interface ManuscriptInput {
  plan: TeachingPlan;
  chapterContent: string;
}

/** 手稿生成结果 */
export interface ManuscriptResult {
  success: boolean;
  markdown: string | null;
  error?: string;
}

// ==================== Prompt ====================

const MANUSCRIPT_PROMPT = `你是一位经验丰富的教师。请根据以下教学规划，撰写一份完整的教学手稿。

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

## 教材原文（供参考）
{content}

## 输出要求

1. **格式**：使用 Markdown 格式
2. **结构**：按照节次安排组织内容
3. **语言**：面向教师，使用"我们来看..."、"请同学们注意..."等教学语言
4. **图表标记**：需要配图的地方用 \`> visual: 描述\` 标记

## 示例输出

\`\`\`markdown
# 一次函数

## 本节目标
- 理解一次函数的定义和表达式
- 掌握斜率和截距的含义

---

## 一、引入：生活中的线性关系

同学们，我们先来看一个生活中的例子。

出租车计价：起步价 10 元，每公里 2 元。如果行驶 x 公里，费用 y 是多少？

> visual: 出租车计价示意图，横轴为公里数，纵轴为费用

我们可以得到：y = 2x + 10

---

## 二、概念讲解：一次函数的定义

形如 y = kx + b（其中 k ≠ 0）的函数，叫做**一次函数**。

> visual: 坐标系中的一次函数图像，标注斜率和截距

其中：
- k 叫做**斜率**，决定直线的倾斜程度
- b 叫做**截距**，决定直线与 y 轴的交点

---

## 三、例题讲解

【例1】判断下列函数是否为一次函数：
1. y = 3x - 2
2. y = x²
3. y = 5

...

---

## 四、课堂小结

本节课我们学习了：
1. 一次函数的定义：y = kx + b（k ≠ 0）
2. 斜率 k 和截距 b 的含义

> visual: 一次函数知识框架图
\`\`\`

## 重要提示
1. 每个节次用 \`---\` 分隔（这是幻灯片分页标记）
2. \`> visual:\` 标记要具体描述需要的图表内容
3. 公式用 LaTeX 语法：\`$y = kx + b$\`
4. 内容要连贯、可朗读，像真正的讲课稿

请直接输出 Markdown 内容，不要有额外解释。`;

// ==================== 核心函数 ====================

/**
 * 生成教学手稿
 */
export async function generateManuscript(input: ManuscriptInput): Promise<ManuscriptResult> {
  try {
    configureLLM();

    const llm = new OpenAI({
      model: process.env.OPENAI_MODEL || 'qwen-plus',
      apiKey: process.env.OPENAI_API_KEY!,
      baseURL: process.env.OPENAI_API_BASE || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });

    const { plan, chapterContent } = input;

    const prompt = MANUSCRIPT_PROMPT
      .replace('{chapter}', plan.chapter)
      .replace('{grade}', plan.constraints.grade)
      .replace('{subject}', plan.constraints.subject)
      .replace('{duration}', plan.constraints.duration)
      .replace('{goals}', plan.teaching_goals.map((g, i) => `${i + 1}. ${g}`).join('\n'))
      .replace('{concepts}', plan.key_concepts.join('、'))
      .replace('{sections}', formatSections(plan.sections))
      .replace('{content}', truncateContent(chapterContent, 4000));

    console.log('[ManuscriptGenerator] Generating manuscript for:', plan.chapter);

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

// ==================== 辅助函数 ====================

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

