/**
 * 手稿审阅 Agent
 * 
 * 使用 AIHubMix GPT-5.1 模型审阅手稿内容
 * 提供改进建议和需要补充的内容
 */

import { OpenAI } from '@llamaindex/openai';
import { configureLLM } from '../../llm/config';

// ==================== 类型定义 ====================

/** 审阅输入 */
export interface ReviewInput {
  /** 手稿内容 */
  manuscriptContent: string;
  /** 章节标题 */
  chapterTitle: string;
  /** 论文/文档类型 */
  contentType?: 'paper' | 'tech' | 'policy' | 'legal';
}

/** 审阅建议 */
export interface ReviewSuggestion {
  /** 建议类型 */
  type: 'structure' | 'content' | 'expression' | 'supplement';
  /** 严重程度 */
  severity: 'high' | 'medium' | 'low';
  /** 问题描述 */
  issue: string;
  /** 改进建议 */
  suggestion: string;
  /** 需要补充的关键词（用于 RAG 检索） */
  searchKeywords?: string[];
}

/** 审阅结果 */
export interface ReviewResult {
  success: boolean;
  /** 总体评价 */
  overallAssessment: string;
  /** 评分 (1-10) */
  score: number;
  /** 改进建议列表 */
  suggestions: ReviewSuggestion[];
  /** 需要 RAG 补充的内容关键词 */
  supplementKeywords: string[];
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

const REVIEW_PROMPT = `你是一位资深的技术培训内容审阅专家。请仔细审阅以下培训手稿，并提供专业的改进建议。

## 章节标题
{chapterTitle}

## 内容类型
{contentType}

## 手稿内容
{content}

## 审阅任务

请从以下几个维度进行审阅：

### 1. 结构完整性 (structure)
- 是否有清晰的开头、主体、结尾
- 知识点是否有逻辑递进关系
- 过渡是否自然

### 2. 内容准确性 (content)
- 技术概念是否准确
- 是否有遗漏的关键知识点
- 例子是否恰当

### 3. 表达清晰度 (expression)
- 语言是否通俗易懂
- 是否适合目标受众
- 是否有冗余或啰嗦的地方

### 4. 需要补充的内容 (supplement)
- 哪些概念需要更详细的解释
- 哪些地方需要添加示例
- 是否需要补充背景知识

## 输出格式（JSON）

{
  "overallAssessment": "总体评价（2-3句话）",
  "score": 8,
  "suggestions": [
    {
      "type": "content",
      "severity": "high",
      "issue": "问题描述",
      "suggestion": "改进建议",
      "searchKeywords": ["关键词1", "关键词2"]
    }
  ],
  "supplementKeywords": ["需要通过RAG补充的关键词1", "关键词2"]
}

## 注意事项
1. suggestions 数组最多 8 条，优先列出最重要的
2. severity 为 high 的问题必须解决
3. searchKeywords 是可选的，仅当需要从原文档补充内容时提供
4. supplementKeywords 是全局需要补充的关键词，用于 RAG 检索

请直接输出 JSON，不要有其他内容。`;

// ==================== 核心函数 ====================

/**
 * 审阅手稿内容
 */
export async function reviewManuscript(input: ReviewInput): Promise<ReviewResult> {
  try {
    configureLLM();

    // 使用 GPT-5.1 进行审阅
    const config = getGPT51Config();
    const llm = new OpenAI({
      model: config.model,
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });
    

    const contentTypeLabels: Record<string, string> = {
      paper: '学术论文培训',
      tech: '技术培训',
      policy: '制度培训',
      legal: '普法讲座',
    };

    const prompt = REVIEW_PROMPT
      .replace('{chapterTitle}', input.chapterTitle)
      .replace('{contentType}', contentTypeLabels[input.contentType || 'tech'] || '技术培训')
      .replace('{content}', input.manuscriptContent);

    const response = await llm.complete({ prompt });
    const text = response.text.trim();

    // 解析 JSON 结果
    const result = parseReviewResult(text);
    

    return {
      success: true,
      ...result,
    };
  } catch (error: any) {
    console.error('[ManuscriptReviewer] Error:', error);
    return {
      success: false,
      overallAssessment: '',
      score: 0,
      suggestions: [],
      supplementKeywords: [],
      error: error.message || '审阅失败',
    };
  }
}

// ==================== 辅助函数 ====================

/**
 * 解析审阅结果
 */
function parseReviewResult(text: string): Omit<ReviewResult, 'success' | 'error'> {
  try {
    // 尝试提取 JSON
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : text;
    
    const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!objectMatch) {
      throw new Error('No JSON object found');
    }
    
    const parsed = JSON.parse(objectMatch[0]);
    
    return {
      overallAssessment: parsed.overallAssessment || '审阅完成',
      score: Math.min(10, Math.max(1, parsed.score || 7)),
      suggestions: (parsed.suggestions || []).map((s: any) => ({
        type: validateType(s.type),
        severity: validateSeverity(s.severity),
        issue: s.issue || '',
        suggestion: s.suggestion || '',
        searchKeywords: s.searchKeywords || [],
      })),
      supplementKeywords: parsed.supplementKeywords || [],
    };
  } catch (error) {
    console.error('[ManuscriptReviewer] Failed to parse result:', error);
    return {
      overallAssessment: '审阅完成，但结果解析失败',
      score: 7,
      suggestions: [],
      supplementKeywords: [],
    };
  }
}

function validateType(type: string): ReviewSuggestion['type'] {
  const validTypes = ['structure', 'content', 'expression', 'supplement'];
  return validTypes.includes(type) ? type as ReviewSuggestion['type'] : 'content';
}

function validateSeverity(severity: string): ReviewSuggestion['severity'] {
  const validSeverities = ['high', 'medium', 'low'];
  return validSeverities.includes(severity) ? severity as ReviewSuggestion['severity'] : 'medium';
}

