/**
 * 教学语义切分器
 * 将章节内容切分为带教学元数据的 chunk
 */

import { OpenAI } from '@llamaindex/openai';
import { configureLLM } from '../llm/config';

// 本地定义的类型（原来从 dsl-schema 导入）
export type ChunkType = 
  | 'concept_definition'
  | 'example_problem'
  | 'solution_steps'
  | 'key_formula'
  | 'summary'
  | 'exercise'
  | 'narrative'
  | 'visual_description'
  | 'definition'
  | 'concept'
  | 'example'
  | 'pitfall'
  | 'property'
  | 'method'
  | 'diagram_hint'
  | 'other';

export interface TeachingChunk {
  id: string;
  type: ChunkType;
  content: string;
  metadata?: {
    difficulty?: number;
    importance?: number;
    keywords?: string[];
    relatedConcepts?: string[];
    grade?: string;
    subject?: string;
    chapter?: string;
    [key: string]: any;
  };
}

// ==================== 类型定义 ====================

export interface ChunkingOptions {
  maxChunkSize?: number;  // 最大 chunk 大小（字符）
  minChunkSize?: number;  // 最小 chunk 大小
  includeMetadata?: boolean;  // 是否包含元数据标注
}

export interface ChunkingResult {
  success: boolean;
  chunks: TeachingChunk[];
  stats: {
    totalChunks: number;
    byType: Record<ChunkType, number>;
  };
  error?: string;
}

// ==================== Prompt ====================

const SEMANTIC_CHUNK_PROMPT = `你是一个教学内容分析专家。请将以下教材内容切分为教学语义单元。

## 任务
1. 将内容切分为独立的教学语义单元
2. 为每个单元标注类型和元数据
3. 保持内容的完整性，不要截断重要信息

## Chunk 类型说明
- definition: 定义（如"一次函数的定义"）
- concept: 概念解释
- example: 例题（包含题目和解答）
- exercise: 练习题（供学生完成）
- pitfall: 易错点/注意事项
- property: 性质/定理/公式
- method: 解题方法/技巧
- diagram_hint: 需要图示说明的内容
- summary: 小结/要点归纳
- other: 其他内容

## 输出格式 (JSON)
{
  "chunks": [
    {
      "type": "definition",
      "content": "一次函数：形如 y = kx + b（k≠0）的函数称为一次函数。",
      "metadata": {
        "concept": "一次函数",
        "difficulty": 1,
        "needsDiagram": false,
        "keywords": ["一次函数", "线性函数"]
      }
    },
    {
      "type": "example",
      "content": "【例1】已知 y = 2x + 1，求当 x = 3 时 y 的值。\n解：y = 2×3 + 1 = 7",
      "metadata": {
        "concept": "一次函数求值",
        "difficulty": 1,
        "needsDiagram": false,
        "keywords": ["求值"]
      }
    }
  ]
}

## 章节信息
年级: {grade}
学科: {subject}
章节: {chapter}

## 内容
{content}

请直接输出 JSON，不要包含其他文字。`;

// ==================== 核心函数 ====================

/**
 * 使用 LLM 进行教学语义切分
 */
export async function chunkBySemantics(
  content: string,
  metadata: {
    grade?: string;
    subject?: string;
    chapter?: string;
  },
  options: ChunkingOptions = {}
): Promise<ChunkingResult> {
  const { maxChunkSize = 2000 } = options;

  try {
    configureLLM();

    // 如果内容过长，先进行预切分
    const segments = preChunk(content, maxChunkSize * 2);
    const allChunks: TeachingChunk[] = [];


    // 如果 segments 太多，使用简单规则切分而不是 LLM（避免太慢）
    if (segments.length > 3) {
      for (let i = 0; i < segments.length; i++) {
        allChunks.push(createDefaultChunk(segments[i], metadata, i));
      }
    } else {
      const llm = new OpenAI({
        model: process.env.OPENAI_MODEL || 'qwen-turbo',
        apiKey: process.env.OPENAI_API_KEY!,
        baseURL: process.env.OPENAI_API_BASE || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      });

      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        
        const prompt = SEMANTIC_CHUNK_PROMPT
          .replace('{grade}', metadata.grade || '未知')
          .replace('{subject}', metadata.subject || '未知')
          .replace('{chapter}', metadata.chapter || '未知')
          .replace('{content}', segment);

        try {
          const response = await llm.complete({ prompt });
          const text = response.text.trim();

          // 解析 JSON
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            const chunks = normalizeChunks(parsed.chunks || [], metadata, i);
            allChunks.push(...chunks);
          } else {
            allChunks.push(createDefaultChunk(segment, metadata, allChunks.length));
          }
        } catch (e) {
          console.error('[SemanticChunker] Failed to parse segment:', i, e);
          allChunks.push(createDefaultChunk(segment, metadata, allChunks.length));
        }
      }
    }

    // 统计
    const stats = calculateStats(allChunks);

    return {
      success: true,
      chunks: allChunks,
      stats,
    };
  } catch (error: any) {
    console.error('[SemanticChunker] Error:', error);
    return {
      success: false,
      chunks: [],
      stats: { totalChunks: 0, byType: {} as Record<ChunkType, number> },
      error: error.message || '语义切分失败',
    };
  }
}

/**
 * 基于规则的快速切分（不使用 LLM）
 */
export function chunkByRules(
  content: string,
  metadata: {
    grade?: string;
    subject?: string;
    chapter?: string;
  }
): TeachingChunk[] {
  const chunks: TeachingChunk[] = [];
  const lines = content.split('\n');
  
  let currentChunk: { type: ChunkType; lines: string[] } = { type: 'other', lines: [] };
  
  // 识别模式
  const patterns: { pattern: RegExp; type: ChunkType }[] = [
    { pattern: /^【?定义】?|^定义[：:]/, type: 'definition' },
    { pattern: /^【?例[题\d]】?|^例[：:\d]/, type: 'example' },
    { pattern: /^【?练习】?|^习题|^练一练/, type: 'exercise' },
    { pattern: /^【?注意】?|^易错|^常见错误/, type: 'pitfall' },
    { pattern: /^【?性质】?|^定理|^公式/, type: 'property' },
    { pattern: /^【?方法】?|^解法|^技巧/, type: 'method' },
    { pattern: /^【?小结】?|^总结|^归纳/, type: 'summary' },
  ];

  function saveCurrentChunk() {
    if (currentChunk.lines.length > 0) {
      const content = currentChunk.lines.join('\n').trim();
      if (content) {
        chunks.push(createDefaultChunk(content, metadata, chunks.length, currentChunk.type));
      }
      currentChunk = { type: 'other', lines: [] };
    }
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      currentChunk.lines.push('');
      continue;
    }

    // 检查是否是新的语义单元开始
    let matched = false;
    for (const { pattern, type } of patterns) {
      if (pattern.test(trimmed)) {
        saveCurrentChunk();
        currentChunk.type = type;
        matched = true;
        break;
      }
    }

    currentChunk.lines.push(trimmed);
  }

  saveCurrentChunk();

  return chunks;
}

// ==================== 辅助函数 ====================

/**
 * 预切分：将长文本按段落切分
 */
function preChunk(content: string, maxSize: number): string[] {
  if (content.length <= maxSize) {
    return [content];
  }

  const segments: string[] = [];
  const paragraphs = content.split(/\n\n+/);
  let current = '';

  for (const para of paragraphs) {
    if (current.length + para.length > maxSize && current) {
      segments.push(current.trim());
      current = para;
    } else {
      current += (current ? '\n\n' : '') + para;
    }
  }

  if (current.trim()) {
    segments.push(current.trim());
  }

  return segments;
}

/**
 * 标准化 chunks，添加 ID 和元数据
 */
function normalizeChunks(
  chunks: any[],
  metadata: { grade?: string; subject?: string; chapter?: string },
  segmentIndex: number
): TeachingChunk[] {
  return chunks.map((ch, i) => ({
    id: `chunk_${segmentIndex}_${i}_${Date.now()}`,
    type: validateChunkType(ch.type),
    content: ch.content || '',
    metadata: {
      grade: metadata.grade,
      subject: metadata.subject,
      chapter: metadata.chapter,
      ...ch.metadata,
    },
  }));
}

/**
 * 验证 chunk 类型
 */
function validateChunkType(type: string): ChunkType {
  const validTypes: ChunkType[] = [
    'definition', 'concept', 'example', 'exercise', 
    'pitfall', 'property', 'method', 'diagram_hint', 'summary', 'other'
  ];
  return validTypes.includes(type as ChunkType) ? (type as ChunkType) : 'other';
}

/**
 * 创建默认 chunk
 */
function createDefaultChunk(
  content: string,
  metadata: { grade?: string; subject?: string; chapter?: string },
  index: number,
  type: ChunkType = 'other'
): TeachingChunk {
  return {
    id: `chunk_default_${index}_${Date.now()}`,
    type,
    content,
    metadata: {
      grade: metadata.grade,
      subject: metadata.subject,
      chapter: metadata.chapter,
    },
  };
}

/**
 * 计算统计信息
 */
function calculateStats(chunks: TeachingChunk[]): {
  totalChunks: number;
  byType: Record<ChunkType, number>;
} {
  const byType: Record<string, number> = {};
  
  for (const chunk of chunks) {
    byType[chunk.type] = (byType[chunk.type] || 0) + 1;
  }

  return {
    totalChunks: chunks.length,
    byType: byType as Record<ChunkType, number>,
  };
}

/**
 * 按类型筛选 chunks
 */
export function filterChunksByType(
  chunks: TeachingChunk[],
  types: ChunkType[]
): TeachingChunk[] {
  return chunks.filter(ch => types.includes(ch.type));
}

/**
 * 按难度筛选 chunks
 */
export function filterChunksByDifficulty(
  chunks: TeachingChunk[],
  maxDifficulty: number
): TeachingChunk[] {
  return chunks.filter(ch => (ch.metadata.difficulty || 1) <= maxDifficulty);
}

/**
 * 合并相邻的同类型 chunks
 */
export function mergeAdjacentChunks(chunks: TeachingChunk[]): TeachingChunk[] {
  if (chunks.length <= 1) return chunks;

  const merged: TeachingChunk[] = [];
  let current = { ...chunks[0] };

  for (let i = 1; i < chunks.length; i++) {
    const next = chunks[i];
    
    // 如果类型相同且内容不太长，合并
    if (next.type === current.type && current.content.length + next.content.length < 3000) {
      current.content += '\n\n' + next.content;
    } else {
      merged.push(current);
      current = { ...next };
    }
  }

  merged.push(current);
  return merged;
}

