/**
 * 智能润色 Agent
 * 
 * 基于审阅建议 + RAG 检索原文，对手稿进行智能润色
 * 1. 先根据审阅建议识别需要补充的内容
 * 2. 通过 RAG 检索原文档获取相关内容
 * 3. 综合审阅建议和补充内容进行润色
 */

import { OpenAI } from '@llamaindex/openai';
import { configureLLM } from '../../llm/config';
import { hybridSearch } from '../../hybrid-search';
import { loadIndex } from '../../llm/index-manager';
import type { ReviewSuggestion } from './manuscript-reviewer';

// ==================== 类型定义 ====================

/** 智能润色输入 */
export interface SmartEnrichInput {
  /** 原始手稿内容 */
  manuscriptContent: string;
  /** 审阅建议 */
  reviewSuggestions: ReviewSuggestion[];
  /** 需要补充的关键词 */
  supplementKeywords: string[];
  /** 知识库 ID（用于 RAG） */
  knowledgeBaseId: string;
  /** 章节标题 */
  chapterTitle: string;
}

/** 智能润色结果 */
export interface SmartEnrichResult {
  success: boolean;
  /** 润色后的内容 */
  enrichedContent: string | null;
  /** RAG 补充的内容摘要 */
  supplementedContent?: string;
  /** 实际应用的建议数量 */
  appliedSuggestions: number;
  error?: string;
}

// ==================== 配置 ====================

/**
 * 获取 GPT-5.1 模型配置（AIHubMix）
 */
function getGPT51Config() {
  return {
    apiKey: process.env.AIHUBMIX_API_KEY || process.env.OPENAI_API_KEY || '',
    baseURL: process.env.AIHUBMIX_BASE_URL || 'https://aihubmix.com/v1',
    model: 'gpt-5.1',  // 使用 GPT-5.1
  };
}

// ==================== Prompt ====================

const SMART_ENRICH_PROMPT = `你是一位专业的文字编辑。请对以下手稿进行**轻微润色**，只做小修小补。

## 核心原则（必须遵守！）

### ⚠️ 保持原文不变的原则
1. **保留原有的结构、分页、标题**：不要调整章节顺序或重新分页
2. **保留原有的内容和表达方式**：只纠正明显错误，不要改写句子
3. **保留原有的风格和语气**：用户的写作风格就是正确的风格
4. **只做必要的小修改**：错别字、语法错误、明显的表达不通顺

### ❌ 禁止的操作
- 禁止重写或大幅改动原文
- 禁止调整页面结构或合并页面
- 禁止删除用户的内容
- 禁止添加大段新内容
- 禁止改变分页符 \`---\` 的位置

## 章节标题
{chapterTitle}

## 原始手稿（保持其结构不变！）
{manuscript}

## 审阅意见（仅供参考）
{reviewSuggestions}

## 补充材料（仅在明确缺失时使用）
{supplementContent}

## 允许的修改

1. **错别字纠正**：修正明显的拼写或输入错误
2. **语法修正**：修复不通顺的语句
3. **标点符号**：修正错误的标点
4. **极少量补充**：如果有明显缺失的关键信息（1-2句话），可以简短补充

## 输出要求
- 直接输出润色后的 Markdown
- **保持原文的所有分页符 \`---\` 位置不变**
- **保持原文的页数不变**
- 禁止使用 HTML 标签和表格
- 不要添加任何解释说明

润色后的手稿：`;

// ==================== 核心函数 ====================

/**
 * 智能润色手稿
 */
export async function smartEnrichManuscript(input: SmartEnrichInput): Promise<SmartEnrichResult> {
  try {
    configureLLM();

    const config = getGPT51Config();
    const llm = new OpenAI({
      model: config.model,
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });


    // 1. 通过 RAG 检索补充内容
    let supplementContent = '';
    if (input.supplementKeywords.length > 0 && input.knowledgeBaseId) {
      supplementContent = await fetchSupplementContent(
        input.knowledgeBaseId,
        input.supplementKeywords,
        input.reviewSuggestions
      );
    }

    // 2. 格式化审阅建议
    const suggestionsStr = formatSuggestions(input.reviewSuggestions);

    // 3. 构建 prompt
    const prompt = SMART_ENRICH_PROMPT
      .replace('{chapterTitle}', input.chapterTitle)
      .replace('{manuscript}', input.manuscriptContent)
      .replace('{reviewSuggestions}', suggestionsStr)
      .replace('{supplementContent}', supplementContent || '（无额外补充材料）');

    // 4. 调用 LLM 进行润色
    const response = await llm.complete({ prompt });
    let enrichedContent = response.text.trim();

    // 5. 清理输出
    enrichedContent = cleanMarkdown(enrichedContent);


    return {
      success: true,
      enrichedContent,
      supplementedContent: supplementContent || undefined,
      appliedSuggestions: input.reviewSuggestions.length,
    };
  } catch (error: any) {
    console.error('[SmartEnrichAgent] Error:', error);
    return {
      success: false,
      enrichedContent: null,
      appliedSuggestions: 0,
      error: error.message || '智能润色失败',
    };
  }
}

// ==================== RAG 检索函数 ====================

/**
 * 通过 RAG 检索补充内容
 */
async function fetchSupplementContent(
  knowledgeBaseId: string,
  keywords: string[],
  suggestions: ReviewSuggestion[]
): Promise<string> {
  try {
    const index = await loadIndex(knowledgeBaseId);
    
    // 收集所有需要搜索的关键词
    const allKeywords = [...keywords];
    
    // 从建议中提取搜索关键词
    for (const suggestion of suggestions) {
      if (suggestion.searchKeywords && suggestion.searchKeywords.length > 0) {
        allKeywords.push(...suggestion.searchKeywords);
      }
    }

    // 去重
    const uniqueKeywords = [...new Set(allKeywords)];

    if (uniqueKeywords.length === 0) {
      return '';
    }

    // 组合查询
    const query = uniqueKeywords.join(' ');
    
    // 执行混合搜索
    const results = await hybridSearch(
      index,
      knowledgeBaseId,
      query,
      { preset: 'document' }
    );

    if (results.length === 0) {
      return '';
    }

    // 组合搜索结果
    const contents: string[] = [];
    for (const result of results.slice(0, 5)) { // 最多取前 5 个结果
      if (result.content && result.content.length > 100) {
        contents.push(`【来源: ${result.documentName || '原文档'}】\n${result.content}`);
      }
    }

    return contents.join('\n\n---\n\n');
  } catch (error: any) {
    console.error('[SmartEnrichAgent] RAG search error:', error);
    return '';
  }
}

// ==================== 辅助函数 ====================

/**
 * 格式化审阅建议
 */
function formatSuggestions(suggestions: ReviewSuggestion[]): string {
  if (suggestions.length === 0) {
    return '（无审阅意见）';
  }

  const severityLabels: Record<string, string> = {
    high: '🔴 重要',
    medium: '🟡 建议',
    low: '🟢 可选',
  };

  const typeLabels: Record<string, string> = {
    structure: '结构',
    content: '内容',
    expression: '表达',
    supplement: '补充',
  };

  return suggestions.map((s, i) => {
    const severity = severityLabels[s.severity] || '建议';
    const type = typeLabels[s.type] || s.type;
    return `${i + 1}. [${severity}][${type}] ${s.issue}\n   → 建议: ${s.suggestion}`;
  }).join('\n\n');
}

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
  
  // 移除 HTML 标签
  cleaned = cleaned.replace(/<br\s*\/?>/gi, '\n');
  cleaned = cleaned.replace(/<\/?[a-z][a-z0-9]*(?:\s+[^>]*)?\s*\/?>/gi, '');
  
  return cleaned.trim();
}

