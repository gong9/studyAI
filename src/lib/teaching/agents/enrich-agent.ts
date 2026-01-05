/**
 * 阶段5：润色 Agent
 * 
 * 职责：
 * - 语言润色，使表达更自然
 * - 不改变核心教学内容
 */

import { OpenAI } from '@llamaindex/openai';
import { configureLLM, getSmartModelConfig } from '../../llm/config';

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

### ⚠️ 内容筛选原则（最重要！）
- **重点内容必须保留**：核心概念、关键定义、重要结论、例题解答等必须放入 PPT
- **可以适当精简**：口语化的过渡语、重复的解释可以省略
- **保留知识结构**：每个知识点的标题和核心要点都要有
- 页数根据内容多少自动决定，不做硬性限制

### ⚠️ 每页内容限制
- 每页 **1 个主标题 + 若干要点**，内容适量即可
- 如果一个知识点内容较多，可以分成多页
- **禁止生成空页**：每页必须有实际内容，不要只有标题
- **禁止连续使用 \`---\`**：两个分页符之间必须有内容

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

其中 k 是斜率，b 是截距。

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

### 2. 不要改动的内容
- 核心教学概念
- 例题和解答

### 3. 不要引用图片
- **不要说"这张图"、"请看图"、"如图所示"等**，PPT 中没有图片
- **不要添加 \`> visual:\` 或 \`> diagram:\` 等图片标记**
- **但要保持内容丰富**：用详细的文字描述来讲解概念，内容量不能减少

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

    // 使用更智能的模型（aihubmix GPT）进行润色分页
    const smartConfig = getSmartModelConfig();
    const llm = new OpenAI({
      model: smartConfig.model,
      apiKey: smartConfig.apiKey,
      baseURL: smartConfig.baseURL,
    });
    console.log('[EnrichAgent] Using smart model:', smartConfig.model);

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

