/**
 * 阶段5：润色 Agent
 * 
 * 职责：
 * - 语言润色，使表达更自然
 * - 补充绘图/动效意图标记（> diagram:, > animation:）
 * - 不改变核心教学内容
 */

import { OpenAI } from '@llamaindex/openai';
import { configureLLM } from '../../llm/config';

// ==================== 类型定义 ====================

/** 润色输入 */
export interface EnrichInput {
  confirmedContent: string;
  reviewComments?: string[];
}

/** 润色结果 */
export interface EnrichResult {
  success: boolean;
  enrichedContent: string | null;
  error?: string;
}

// ==================== Prompt ====================

const ENRICH_PROMPT = `你是一位专业的 PPT 课件编辑。请对以下教学手稿进行润色和分页排版，使其适合 PPT 展示。

## 原始教学手稿
{content}

## 审核意见参考
{comments}

## 重要：PPT 分页排版规则

### ⚠️ 总页数限制
- **整个 PPT 控制在 8-12 页**，不要超过 12 页
- 相关内容可以合并，提高每页信息密度
- 优先保证核心内容完整

### ⚠️ 每页内容限制（必须严格遵守）
- 每页最多 **1 个主标题 + 3-5 个要点**
- 如果有图片，每页最多 **1 张图片 + 2-3 行说明文字**
- 如果有练习题，每页最多 **1-2 道题目**
- 内容过多时适当合并或精简，而非无限分页

### 分页语法
使用 \`---\` 作为分页符，每个 \`---\` 代表新的一页。

### 分页示例
\`\`\`
# 一次函数

## 学习目标
- 理解一次函数的定义
- 掌握斜率的意义

---

## 什么是一次函数？

一次函数的形式：y = kx + b

> visual: 一次函数图像示例

---

## 例题1

已知函数 y = 2x + 1，求当 x = 3 时 y 的值。

**解：** y = 2 × 3 + 1 = 7

---
\`\`\`

## 润色要求

### 1. 语言润色
- 使教学语言更自然、简洁
- 保持教师授课的口吻

### 2. 补充视觉意图标记
在需要配图的地方添加标记：
\`\`\`
> visual: 出租车计价示意图
> diagram: 坐标系中 y = 2x + 1 的图像
\`\`\`

### 3. 不要改动的内容
- 核心教学概念
- 例题和解答

## 输出要求
1. 直接输出润色、分页后的 Markdown
2. 确保每页内容适合 PPT 一屏展示
3. 不要添加任何解释
4. **禁止使用任何 HTML 标签**（如 <br/>, <p>, <div> 等），只使用纯 Markdown 语法
5. **禁止使用 Markdown 表格**（|---|---| 这种格式），如需对比内容，请使用以下格式：

### 对比展示示例（不要用表格！）
\`\`\`
**传统控制系统**
- 依赖预设规则
- 无法处理未知情况
- 反应机械

**认知系统**  
- 具备学习能力
- 可以推理和决策
- 反应智能
\`\`\`

润色后的教学手稿：`;

// ==================== 核心函数 ====================

/**
 * 润色教学手稿
 */
export async function enrichManuscript(input: EnrichInput): Promise<EnrichResult> {
  try {
    configureLLM();

    const llm = new OpenAI({
      model: process.env.OPENAI_MODEL || 'qwen-plus',
      apiKey: process.env.OPENAI_API_KEY!,
      baseURL: process.env.OPENAI_API_BASE || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });

    const commentsStr = input.reviewComments && input.reviewComments.length > 0
      ? input.reviewComments.map((c, i) => `${i + 1}. ${c}`).join('\n')
      : '无';

    const prompt = ENRICH_PROMPT
      .replace('{content}', input.confirmedContent)
      .replace('{comments}', commentsStr);

    console.log('[EnrichAgent] Enriching manuscript...');

    const response = await llm.complete({ prompt });
    let enrichedContent = response.text.trim();

    // 清理可能的 markdown 代码块包装
    enrichedContent = cleanMarkdown(enrichedContent);

    console.log('[EnrichAgent] Enrichment completed, length:', enrichedContent.length);

    return {
      success: true,
      enrichedContent,
    };
  } catch (error: any) {
    console.error('[EnrichAgent] Error:', error);
    return {
      success: false,
      enrichedContent: null,
      error: error.message || '润色失败',
    };
  }
}

// ==================== 辅助函数 ====================

/**
 * 清理 Markdown 输出
 */
function cleanMarkdown(text: string): string {
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
  
  // 移除 LLM 可能生成的所有 HTML 标签（包括带属性的）
  // 例如: <p class="text-gray-700">...</p>, <br/>, <div>, etc.
  cleaned = cleaned.replace(/<br\s*\/?>/gi, '\n');
  // 移除所有开始和结束标签（包括带属性的）
  cleaned = cleaned.replace(/<\/?[a-z][a-z0-9]*(?:\s+[^>]*)?\s*\/?>/gi, '');
  
  return cleaned.trim();
}

