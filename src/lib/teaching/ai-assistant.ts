/**
 * AI 辅助编辑器
 * 
 * 提供润色、扩写、问答、总结等功能
 * 复用知识库 RAG 能力
 */

import { OpenAI } from '@llamaindex/openai';
import { configureLLM } from '../llm/config';
import { loadIndex } from '../llm/index-manager';
import { hybridSearch } from '../hybrid-search';

// ==================== 类型定义 ====================

export type AIAction = 'polish' | 'expand' | 'ask' | 'summary';

export interface AIRequest {
  action: AIAction;
  text: string;
  knowledgeBaseId: string;
  context?: string;  // 额外上下文（如当前编辑的章节内容）
}

export interface AIResponse {
  success: boolean;
  result: string;
  sources?: Array<{
    content: string;
    documentName?: string;
    score?: number;
  }>;
  error?: string;
}

// ==================== Prompts ====================

const PROMPTS: Record<AIAction, string> = {
  polish: `你是一位专业的教学文案编辑。请对以下文本进行润色优化，使其更适合教学场景。

## 要求
1. 保持原意不变，优化表达方式
2. 使语言更加清晰、流畅、易懂
3. 适合课堂教学使用
4. 不要添加新内容，只优化现有文字
5. 禁止使用任何 HTML 标签

## 参考资料（来自教材）
{context}

## 需要润色的文本
{text}

## 直接输出润色后的文本，不要添加任何解释：`,

  expand: `你是一位经验丰富的教师。请基于以下文本和参考资料进行扩写，补充相关的教学内容。

## 要求
1. 基于原文进行扩展，不要偏离主题
2. 可以补充例子、解释、练习等
3. 内容要准确，符合教材
4. 适合课堂教学使用
5. 禁止使用任何 HTML 标签

## 参考资料（来自教材）
{context}

## 需要扩写的文本
{text}

## 直接输出扩写后的内容，不要添加任何解释：`,

  ask: `你是一个智能教学助手。请根据知识库中的教材内容回答问题。

## 要求
1. 基于提供的参考资料回答
2. 如果资料中没有相关内容，请明确说明
3. 回答要准确、简洁、适合教学场景
4. 可以适当引用原文

## 参考资料（来自教材）
{context}

## 问题
{text}

## 回答：`,

  summary: `你是一位专业的教学文案编辑。请对以下内容生成摘要。

## 要求
1. 提取核心要点
2. 使用简洁的语言
3. 保留关键概念和数据
4. 适合作为教学提纲

## 需要总结的内容
{text}

## 摘要：`,
};

// ==================== 核心函数 ====================

/**
 * 执行 AI 辅助操作
 */
export async function executeAIAction(request: AIRequest): Promise<AIResponse> {
  try {
    configureLLM();

    const llm = new OpenAI({
      model: process.env.OPENAI_MODEL || 'qwen-plus',
      apiKey: process.env.OPENAI_API_KEY!,
      baseURL: process.env.OPENAI_API_BASE || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });

    // 获取相关上下文（除了 summary 外都需要检索）
    let contextStr = '';
    let sources: AIResponse['sources'] = [];

    if (request.action !== 'summary' && request.knowledgeBaseId) {
      const searchResults = await searchKnowledgeBase(
        request.knowledgeBaseId,
        request.text,
        request.action === 'ask' ? 8 : 5  // 问答模式多检索一些
      );
      
      if (searchResults.length > 0) {
        contextStr = searchResults
          .map((r, i) => `[${i + 1}] ${r.content}`)
          .join('\n\n');
        
        sources = searchResults.map(r => ({
          content: r.content.substring(0, 200) + '...',
          documentName: r.documentName,
          score: r.score,
        }));
      }
    }

    // 如果提供了额外上下文，附加到检索结果后面
    if (request.context) {
      contextStr = contextStr 
        ? `${contextStr}\n\n[当前编辑内容]\n${request.context}`
        : `[当前编辑内容]\n${request.context}`;
    }

    if (!contextStr) {
      contextStr = '（无相关参考资料）';
    }

    // 构建 prompt
    const prompt = PROMPTS[request.action]
      .replace('{text}', request.text)
      .replace('{context}', contextStr);


    // 调用 LLM
    const response = await llm.complete({ prompt });
    let result = response.text.trim();

    // 清理可能的格式问题
    result = cleanResult(result);


    return {
      success: true,
      result,
      sources: sources.length > 0 ? sources : undefined,
    };

  } catch (error: any) {
    console.error('[AIAssistant] Error:', error);
    return {
      success: false,
      result: '',
      error: error.message || 'AI 处理失败',
    };
  }
}

// ==================== 辅助函数 ====================

/**
 * 检索知识库
 * 如果知识库索引不存在，返回空数组（AI 将在没有参考资料的情况下工作）
 */
async function searchKnowledgeBase(
  knowledgeBaseId: string,
  query: string,
  limit: number = 5
): Promise<Array<{ content: string; documentName?: string; score?: number }>> {
  try {
    // 尝试加载索引
    let index;
    try {
      index = await loadIndex(knowledgeBaseId);
    } catch (indexError: any) {
      // 索引不存在是正常情况（教学知识库可能还没建立索引）
      return [];
    }
    
    const results = await hybridSearch(index, knowledgeBaseId, query, {
      vectorTopK: limit,
      keywordLimit: limit,
      minVectorScore: 0.3,
    });

    return results.slice(0, limit).map(r => ({
      content: r.content,
      documentName: r.documentName || r.metadata?.fileName,
      score: r.score,
    }));
  } catch (error) {
    console.error('[AIAssistant] Search error:', error);
    return [];
  }
}

/**
 * 清理 LLM 输出
 */
function cleanResult(text: string): string {
  let cleaned = text;

  // 移除 markdown 代码块包装
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\w*\n?/, '').replace(/\n?```$/, '');
  }

  // 移除 HTML 标签
  cleaned = cleaned.replace(/<br\s*\/?>/gi, '\n');
  cleaned = cleaned.replace(/<\/?(p|div|span)>/gi, '');

  return cleaned.trim();
}

// ==================== 便捷函数 ====================

export async function polishText(text: string, kbId: string, context?: string): Promise<AIResponse> {
  return executeAIAction({ action: 'polish', text, knowledgeBaseId: kbId, context });
}

export async function expandText(text: string, kbId: string, context?: string): Promise<AIResponse> {
  return executeAIAction({ action: 'expand', text, knowledgeBaseId: kbId, context });
}

export async function askQuestion(question: string, kbId: string): Promise<AIResponse> {
  return executeAIAction({ action: 'ask', text: question, knowledgeBaseId: kbId });
}

export async function summarizeText(text: string, kbId: string): Promise<AIResponse> {
  return executeAIAction({ action: 'summary', text, knowledgeBaseId: kbId });
}

