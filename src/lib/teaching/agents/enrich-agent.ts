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

const ENRICH_PROMPT = `你是一位专业的 PPT 课件编辑。请对以下教学手稿进行**轻微润色**，使其适合 PPT 展示。

## 核心原则（必须遵守！）

### ⚠️ 保持原文不变
1. **保留原有的分页结构**：如果原文已有 \`---\` 分页符，保持不变
2. **保留原有的标题和内容**：不要删除、重写或大幅改动
3. **保留原有的表达方式**：用户的写作风格就是正确的
4. **只做小修补**：错别字、语法、标点等

### ❌ 禁止的操作
- 禁止删除用户写的内容
- 禁止重写或改述原文
- 禁止合并或拆分页面
- 禁止添加大段新内容
- 禁止改变整体结构

## 原始教学手稿（保持结构不变！）
{content}

## 审核意见参考（仅供参考）
{comments}

## 分页处理规则

### 如果原文已有分页 \`---\`
- **直接保持原有分页**，不要调整

### 如果原文没有分页
- 添加 \`---\` 分页符，控制在 15-20 页
- 每页 1 个主标题 + 3-5 个要点

## 允许的修改

### 1. 错别字和语法
- 修正明显的拼写错误
- 修复不通顺的语句

### 2. 格式优化
- 如果原文没有分页，添加分页符
- 确保 Markdown 格式正确

### 3. 不要引用图片
- 不要说"这张图"、"请看图"、"如图所示"等

## 输出要求
1. 直接输出 Markdown，保持原文结构
2. 不要添加任何解释
3. **禁止使用 HTML 标签**
4. **禁止使用 Markdown 表格**

处理后的手稿：`;

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

    const commentsStr = input.reviewComments && input.reviewComments.length > 0
      ? input.reviewComments.map((c, i) => `${i + 1}. ${c}`).join('\n')
      : '无';

    const prompt = ENRICH_PROMPT
      .replace('{content}', input.confirmedContent)
      .replace('{comments}', commentsStr);


    const response = await llm.complete({ prompt });
    let enrichedContent = response.text.trim();

    // 清理可能的 markdown 代码块包装
    enrichedContent = cleanMarkdown(enrichedContent);


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

