/**
 * 阶段1：全书主题分析
 * 
 * 职责：
 * - 通过 RAG 检索前言、目录、结语等关键内容
 * - 提取核心命题、目标读者、知识类型
 * - 生成全书摘要和关键词
 * 
 * 优化：使用语义搜索替代正则匹配，更智能地提取关键内容
 */

import { OpenAI } from '@llamaindex/openai';
import { configureLLM } from '../../llm/config';
import { hybridSearch, formatSearchResults } from '../../hybrid-search';
import { loadIndex } from '../../llm/index-manager';
import type { BookThesis, KnowledgeType } from '../types';

// ==================== 类型定义 ====================

export interface BookAnalyzerInput {
  /** 知识库 ID（用于 RAG 检索） */
  knowledgeBaseId?: string;
  /** 文档内容（备选，当无法使用 RAG 时） */
  content: string;
  /** 书名（如果已知） */
  title?: string;
  /** 文档类型提示 */
  documentType?: 'textbook' | 'technical' | 'policy' | 'general';
}

export interface BookAnalyzerOutput {
  success: boolean;
  thesis: BookThesis | null;
  error?: string;
}

// ==================== Prompt ====================

const BOOK_ANALYSIS_PROMPT = `你是一位资深的阅读分析专家。请快速"粗读"以下文档，提取其核心主题和结构信息。

## 文档内容
{content}

## 任务
1. 识别文档的核心命题/主旨
2. 判断目标读者群体
3. 分析知识类型（概念型/技能型/参考型/叙事型）
4. 生成简洁的全书摘要
5. 提取 5-10 个核心关键词

## 知识类型说明
- concept: 概念型 - 以传授知识概念为主（教材、科普）
- skill: 技能型 - 以培养实操能力为主（教程、手册）
- reference: 参考型 - 以提供查阅信息为主（规范、字典）
- narrative: 叙事型 - 以讲述故事为主（案例、传记）

## 输出格式 (JSON)
{
  "title": "文档/书籍标题",
  "topic": "核心命题（50字以内）",
  "audience": "目标读者描述（30字以内）",
  "knowledgeType": "concept|skill|reference|narrative",
  "summary": "全书摘要（100-200字）",
  "keywords": ["关键词1", "关键词2", "..."]
}

## 注意
1. 重点关注前言、目录、引言、结语等结构性内容
2. 从整体把握，不要陷入细节
3. 请直接输出 JSON，不要包含其他文字`;

// ==================== 核心函数 ====================

/**
 * 分析全书主题
 * 
 * @param input 输入参数
 * @returns 全书主题分析结果
 */
export async function analyzeBook(input: BookAnalyzerInput): Promise<BookAnalyzerOutput> {
  try {
    configureLLM();

    const llm = new OpenAI({
      model: process.env.OPENAI_MODEL || 'qwen-plus',
      apiKey: process.env.OPENAI_API_KEY!,
      baseURL: process.env.OPENAI_API_BASE || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });

    // 获取分析内容：优先用 RAG 检索，备选用正则提取
    let analysisContent: string;
    
    if (input.knowledgeBaseId) {
      analysisContent = await fetchKeyContentByRAG(input.knowledgeBaseId);
    }
    
    // 如果 RAG 内容不足，使用备选方案
    if (!analysisContent || analysisContent.length < 500) {
      analysisContent = extractKeyParts(input.content);
    }
    
    const prompt = BOOK_ANALYSIS_PROMPT.replace('{content}', analysisContent);


    const response = await llm.complete({ prompt });
    const text = response.text.trim();

    // 解析 JSON
    const thesis = parseThesisResult(text, input.title);

    if (!thesis) {
      return {
        success: false,
        thesis: null,
        error: '无法解析分析结果',
      };
    }


    return {
      success: true,
      thesis,
    };
  } catch (error: any) {
    console.error('[BookAnalyzer] Error:', error);
    return {
      success: false,
      thesis: null,
      error: error.message || '全书分析失败',
    };
  }
}

// ==================== RAG 检索函数 ====================

/**
 * 使用 RAG 检索关键内容（前言、目录、结语等）
 */
async function fetchKeyContentByRAG(knowledgeBaseId: string): Promise<string> {
  try {
    const index = await loadIndex(knowledgeBaseId);
    
    // 语义搜索查询：找前言、目录、结语相关内容
    const queries = [
      '这本书的前言、序言或引言内容',
      '这本书的目录和章节结构',
      '这本书的核心主题和写作目的',
      '这本书的总结、结语或后记',
      '这本书面向的读者群体',
    ];

    const allContent: string[] = [];
    const seenContent = new Set<string>();

    for (const query of queries) {
      const results = await hybridSearch(index, knowledgeBaseId, query, {
        vectorTopK: 5,
        keywordLimit: 3,
        minVectorScore: 0.3,
      });

      for (const result of results) {
        // 去重（用前 80 字符作为 key）
        const contentKey = result.content.substring(0, 80);
        if (!seenContent.has(contentKey)) {
          seenContent.add(contentKey);
          allContent.push(`[来源: ${result.documentName || '文档'}]\n${result.content}`);
        }
      }
    }

    const combined = allContent.join('\n\n---\n\n');
    
    // 限制总长度
    const maxLength = 15000;
    return combined.length > maxLength 
      ? combined.substring(0, maxLength) + '\n\n[内容已截断...]'
      : combined;

  } catch (error: any) {
    console.error('[BookAnalyzer] RAG fetch failed:', error);
    return '';
  }
}

// ==================== 辅助函数 ====================

/**
 * 提取文档关键部分用于分析
 * 优先提取：书名、前言、目录、引言、结语
 */
function extractKeyParts(content: string): string {
  const maxLength = 15000; // 限制分析内容长度
  
  if (content.length <= maxLength) {
    return content;
  }

  // 尝试识别关键部分
  const parts: string[] = [];
  
  // 前言/引言模式
  const prefacePatterns = [
    /前言[\s\S]{0,3000}/i,
    /引言[\s\S]{0,3000}/i,
    /序言[\s\S]{0,3000}/i,
    /Preface[\s\S]{0,3000}/i,
    /Introduction[\s\S]{0,3000}/i,
  ];
  
  for (const pattern of prefacePatterns) {
    const match = content.match(pattern);
    if (match) {
      parts.push(match[0]);
      break;
    }
  }
  
  // 目录模式
  const tocPatterns = [
    /目录[\s\S]{0,5000}(?=第一章|Chapter 1|1\.|一、)/i,
    /Table of Contents[\s\S]{0,5000}/i,
  ];
  
  for (const pattern of tocPatterns) {
    const match = content.match(pattern);
    if (match) {
      parts.push(match[0]);
      break;
    }
  }
  
  // 结语/附录模式
  const epiloguePatterns = [
    /结语[\s\S]{0,2000}$/i,
    /后记[\s\S]{0,2000}$/i,
    /Conclusion[\s\S]{0,2000}$/i,
  ];
  
  for (const pattern of epiloguePatterns) {
    const match = content.match(pattern);
    if (match) {
      parts.push(match[0]);
      break;
    }
  }
  
  // 如果找到了关键部分，拼接返回
  if (parts.length > 0) {
    const keyContent = parts.join('\n\n---\n\n');
    // 如果关键部分太短，补充开头内容
    if (keyContent.length < 3000) {
      return content.substring(0, maxLength);
    }
    return keyContent.substring(0, maxLength);
  }
  
  // 没找到关键部分，返回开头和结尾
  const headLength = Math.floor(maxLength * 0.7);
  const tailLength = maxLength - headLength;
  
  return content.substring(0, headLength) + 
    '\n\n...[内容省略]...\n\n' + 
    content.substring(content.length - tailLength);
}

/**
 * 解析 LLM 返回的分析结果
 */
function parseThesisResult(text: string, fallbackTitle?: string): BookThesis | null {
  try {
    // 尝试提取 JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[BookAnalyzer] No JSON found in response');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // 验证必要字段
    if (!parsed.topic) {
      console.error('[BookAnalyzer] Missing required field: topic');
      return null;
    }

    // 验证知识类型
    const validTypes: KnowledgeType[] = ['concept', 'skill', 'reference', 'narrative'];
    const knowledgeType = validTypes.includes(parsed.knowledgeType) 
      ? parsed.knowledgeType 
      : 'concept';

    return {
      title: parsed.title || fallbackTitle || '未知文档',
      topic: parsed.topic,
      audience: parsed.audience || '通用读者',
      knowledgeType,
      summary: parsed.summary || '',
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
    };
  } catch (e) {
    console.error('[BookAnalyzer] Failed to parse JSON:', e);
    return null;
  }
}

