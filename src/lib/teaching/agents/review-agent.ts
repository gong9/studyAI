/**
 * 阶段4：审核 Agent
 * 
 * 职责：
 * - 作为教研组老师/教学督导的角色
 * - 审核用户确认的教学手稿
 * - 检查教学逻辑、概念完整性、认知水平
 * - 输出非破坏性的审核意见（注释形式）
 */

import { OpenAI } from '@llamaindex/openai';
import { configureLLM } from '../../llm/config';

// ==================== 类型定义 ====================

/** 审核输入 */
export interface ReviewInput {
  confirmedContent: string;
  teachingPlan?: any;
}

/** 审核结果 */
export interface ReviewResult {
  success: boolean;
  comments: string[];
  error?: string;
}

// ==================== Prompt ====================

const REVIEW_PROMPT = `你是一位资深的教研组长/教学督导。请审核以下教学手稿，给出建设性的审核意见。

## 教学手稿
{content}

## 教学规划参考
{plan}

## 审核维度
1. **教学逻辑**：内容是否连贯，讲解顺序是否合理
2. **概念完整性**：核心概念是否完整，有无遗漏
3. **认知水平**：是否超出目标年级的认知水平
4. **过渡自然**：各部分之间的过渡是否自然
5. **例题质量**：例题是否典型，难度是否适当

## 输出要求
请以 JSON 数组形式输出审核意见，每条意见应具体、可操作：

\`\`\`json
[
  "建议在引入部分增加一个更贴近学生生活的例子",
  "斜率概念的讲解可以更直观，建议配合图像说明",
  "例2 的难度偏高，建议在此之前增加一道过渡题"
]
\`\`\`

如果手稿质量较好，可以输出空数组 \`[]\`。

请直接输出 JSON 数组，不要有其他解释文字。`;

// ==================== 核心函数 ====================

/**
 * 审核教学手稿
 */
export async function reviewManuscript(input: ReviewInput): Promise<ReviewResult> {
  try {
    configureLLM();

    const llm = new OpenAI({
      model: process.env.OPENAI_MODEL || 'qwen-plus',
      apiKey: process.env.OPENAI_API_KEY!,
      baseURL: process.env.OPENAI_API_BASE || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });

    const planStr = input.teachingPlan 
      ? JSON.stringify(input.teachingPlan, null, 2)
      : '无';

    const prompt = REVIEW_PROMPT
      .replace('{content}', input.confirmedContent)
      .replace('{plan}', planStr);


    const response = await llm.complete({ prompt });
    const text = response.text.trim();

    // 解析 JSON 数组
    const comments = parseComments(text);


    return {
      success: true,
      comments,
    };
  } catch (error: any) {
    console.error('[ReviewAgent] Error:', error);
    return {
      success: false,
      comments: [],
      error: error.message || '审核失败',
    };
  }
}

// ==================== 辅助函数 ====================

/**
 * 解析审核意见
 */
function parseComments(text: string): string[] {
  try {
    // 提取 JSON 数组
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn('[ReviewAgent] No JSON array found in response');
      return [];
    }

    let jsonStr = jsonMatch[0];
    
    // 清理可能的问题
    jsonStr = jsonStr
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '');

    const parsed = JSON.parse(jsonStr);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item: any) => typeof item === 'string');
  } catch (error: any) {
    console.error('[ReviewAgent] JSON parse error:', error.message);
    return [];
  }
}

