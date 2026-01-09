/**
 * 上下文引擎
 * 统一调度 Memory + RAG + Optimizer 模块
 */

import { getMemoryService } from '../memory';
import { hybridSearch } from '../hybrid-search';
import { loadIndex } from '../llm/index-manager';
import { configureLLM } from '../llm/config';

import { getTaskState, formatTaskStateAsContext, detectTaskFromQuery, setCurrentTask } from './task-state';
import { generateHistorySummary, formatHistorySummaryAsContext } from './history-summary';
import { makeRetrievalDecision, calculateRetrievalCount } from './rag/retrieval-decision';
import { rewriteQuery } from './rag/query-rewriter';
import { processResults } from './rag/dedup-filter';
import { mergeMultipleSources, calculateStats } from './optimizer/multi-source-merger';
import { filterChunksByIntent, alignContextWithIntent } from './optimizer/intent-aligner';
import { compressSimple, compressWithLLM } from './optimizer/compressor';
import { analyzeIntent, getContextWeights, type IntentResult, type IntentType } from './intent';

import type { 
  ContextBuildOptions, 
  BuiltContext, 
  ScoredMemory,
  SearchResult,
  TaskState,
  RetrievalDecision,
} from './types';

/**
 * 扩展的构建选项（支持传入意图）
 */
interface ExtendedBuildOptions extends ContextBuildOptions {
  intent?: IntentResult;
}

/**
 * 上下文引擎配置
 */
interface EngineConfig {
  maxTokens: number;
  enableMemory: boolean;
  enableRag: boolean;
  enableHistory: boolean;
  enableTaskState: boolean;
  enableQueryRewrite: boolean;
  enableCompression: boolean;
  useLLMCompression: boolean;  // 使用 LLM 语义压缩
  compressionThreshold: number; // 触发压缩的使用率阈值
  debug: boolean;
}

const DEFAULT_CONFIG: EngineConfig = {
  maxTokens: 3000,
  enableMemory: true,
  enableRag: true,
  enableHistory: true,
  enableTaskState: true,
  enableQueryRewrite: false,  // 默认关闭，因为会增加延迟
  enableCompression: true,    // 开启压缩
  useLLMCompression: true,    // 使用 LLM 语义压缩
  compressionThreshold: 0.85, // 使用率超过 85% 时压缩
  debug: false,
};

/**
 * 上下文引擎
 */
export class ContextEngine {
  private config: EngineConfig;
  
  constructor(config: Partial<EngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  /**
   * 构建最优上下文
   */
  async buildContext(options: ExtendedBuildOptions): Promise<BuiltContext> {
    const {
      knowledgeBaseId,
      sessionId,
      userId,
      query,
      chatHistory = [],
      maxTokens = this.config.maxTokens,
      intent: externalIntent,
    } = options;
    
    const startTime = Date.now();
    
    // 确保 LLM 已配置
    configureLLM();
    
    // ========== 1. 意图检测（使用外部传入或自行分析）==========
    const intent: IntentResult = externalIntent || await analyzeIntent(query, chatHistory);
    
    // ========== 2. 检索决策 ==========
    const retrievalDecision = makeRetrievalDecision(query, {
      hasKnowledgeBase: true,
      chatHistoryLength: chatHistory.length,
    });
    
    // ========== 3. 统一检索（记忆 + 文档一起检索，用 RRF 融合）==========
    const [allResults, historySummaryResult, taskState] = await Promise.all([
      // 统一检索（记忆和文档在同一个索引中）
      (this.config.enableMemory || this.config.enableRag) && retrievalDecision.shouldRetrieve
        ? this.getUnifiedResults(knowledgeBaseId, query, retrievalDecision)
        : Promise.resolve({ memories: [], documents: [] }),
      
      // 历史摘要
      this.config.enableHistory && chatHistory.length > 6
        ? generateHistorySummary(sessionId, chatHistory)
        : Promise.resolve({ summary: null, recentHistory: chatHistory }),
      
      // 任务状态
      this.config.enableTaskState
        ? Promise.resolve(this.getTaskState(sessionId, query))
        : Promise.resolve(null),
    ]);
    
    // 🔥 从统一检索结果中分离记忆和文档
    const memories = allResults.memories;
    const ragResults = allResults.documents;
    
    
    // ========== 4. 构建对话历史部分 ==========
    let historyContext = '';
    if (chatHistory.length > 0) {
      if (historySummaryResult.summary) {
        // 有摘要就用摘要
        historyContext = `## 对话历史摘要\n${historySummaryResult.summary}`;
      } else {
        // 没有摘要，用最近几条
        const recentHistory = chatHistory.slice(-6);
        historyContext = `## 对话历史\n` + recentHistory.map(msg => {
          const role = msg.role === 'user' ? '用户' : 'AI助手';
          const content = msg.content.length > 150 
            ? msg.content.substring(0, 150) + '...' 
            : msg.content;
          return `${role}: ${content}`;
        }).join('\n');
      }
    }
    
    // ========== 5. 多源合并 ==========
    const weights = getContextWeights(intent.intent);
    const { context: mergedContext, chunks, stats } = mergeMultipleSources(
      {
        memories: memories as ScoredMemory[],
        ragResults,
        historySummary: historyContext || undefined,  // 🔥 使用处理后的历史
      },
      { maxTokens, weights }
    );
    
    // ========== 6. 意图对齐 ==========
    const alignedChunks = filterChunksByIntent(chunks, intent.intent);
    const finalContext = alignContextWithIntent(
      mergedContext,
      query,
      intent.intent,
      intent.keywords
    );
    
    // ========== 7. 压缩（可选）==========
    let outputContext = finalContext;
    let compressionApplied = false;
    
    if (this.config.enableCompression && stats.usageRatio > this.config.compressionThreshold) {
      const targetLength = maxTokens * 3;  // 字符数约 token 的 3 倍
      
      if (this.config.useLLMCompression) {
        // LLM 语义压缩（效果更好）
        try {
          const startTime = Date.now();
          outputContext = await compressWithLLM(finalContext, { 
            targetRatio: 0.5,  // 压缩到 50%
            minLength: 200,
            preserveKeywords: true,
          });
          const duration = Date.now() - startTime;
        } catch (error) {
          console.error('[ContextEngine] 📦 LLM compression failed, fallback to simple:', error);
          outputContext = compressSimple(finalContext, targetLength);
        }
      } else {
        // 简单规则压缩
        outputContext = compressSimple(finalContext, targetLength);
      }
      
      compressionApplied = true;
    }
    
    const totalTime = Date.now() - startTime;
    
    return {
      context: outputContext,
      memories: memories as ScoredMemory[],
      ragResults,
      historySummary: historySummaryResult.summary,
      taskState,
      stats,
      debug: this.config.debug ? {
        retrievalDecision,
        compressionApplied,
        chunksBeforeOptimization: chunks.length,
        chunksAfterOptimization: alignedChunks.length,
      } : undefined,
    };
  }
  
  /**
   * 🔥 统一检索：记忆和文档一起检索，用 RRF 融合
   * 返回分离后的记忆和文档
   */
  private async getUnifiedResults(
    knowledgeBaseId: string, 
    query: string,
    decision: RetrievalDecision
  ): Promise<{ memories: ScoredMemory[]; documents: SearchResult[] }> {
    try {
      const index = await loadIndex(knowledgeBaseId);
      const counts = calculateRetrievalCount(decision);
      
      // 查询改写（可选）
      let searchQuery = query;
      if (this.config.enableQueryRewrite) {
        const rewritten = await rewriteQuery(query);
        searchQuery = rewritten.rewrittenQuery;
      }
      
      // 🔥 执行统一混合检索（记忆和文档都在索引中）
      const results = await hybridSearch(index, knowledgeBaseId, searchQuery, {
        vectorTopK: counts.vectorTopK + 10,  // 多取一些，因为包含记忆
        keywordLimit: counts.keywordLimit,
        minVectorScore: 0.4,  // 🔥 相关性阈值（调高到 0.4，过滤更多无关内容）
      });
      
      // 🔥 分离记忆和文档
      const memories: ScoredMemory[] = [];
      const documents: SearchResult[] = [];
      
      for (const r of results) {
        if (r.contentType === 'memory') {
          // 转换为 ScoredMemory 格式
          memories.push({
            id: r.metadata?.memoryId || r.id,
            content: r.content,
            type: r.metadata?.memoryType || 'context',
            confidence: 0.8,
            accessCount: 0,
            lastAccessedAt: new Date(),
            createdAt: new Date(),
            score: r.score,
            relevanceScore: r.score,
            freshnessScore: 0.5,
          });
        } else {
          // 文档 - 映射 source 类型
          const sourceMap: Record<string, 'hybrid' | 'vector' | 'keyword' | 'graph'> = {
            'vector': 'vector',
            'keyword': 'keyword',
            'both': 'hybrid',
            'graph': 'graph',
            'hybrid': 'hybrid',
          };
          documents.push({
            id: r.id,
            content: r.content,
            documentName: r.documentName,
            score: r.score,
            source: sourceMap[r.source] || 'hybrid',
          });
        }
      }
      
      
      // 去重过滤文档
      const processedDocs = processResults(documents, query);
      
      return { 
        memories: memories.slice(0, 10),  // 最多 10 条记忆
        documents: processedDocs 
      };
    } catch (error) {
      console.error('[ContextEngine] Failed unified search:', error);
      return { memories: [], documents: [] };
    }
  }
  
  /**
   * 获取任务状态
   */
  private getTaskState(sessionId: string, query: string): TaskState | null {
    // 检测是否有新任务
    const { hasTask, taskDescription } = detectTaskFromQuery(query);
    if (hasTask && taskDescription) {
      setCurrentTask(sessionId, taskDescription);
    }
    
    return getTaskState(sessionId);
  }
  
  /**
   * 处理对话完成后的记忆提取
   */
  async processConversationEnd(
    knowledgeBaseId: string,
    question: string,
    answer: string
  ): Promise<void> {
    if (!this.config.enableMemory) return;
    
    try {
      const memoryService = getMemoryService(knowledgeBaseId);
      await memoryService.processConversation(question, answer);
    } catch (error) {
      console.error('[ContextEngine] Failed to process conversation:', error);
    }
  }
}

/**
 * 创建上下文引擎实例
 */
export function createContextEngine(config?: Partial<EngineConfig>): ContextEngine {
  return new ContextEngine(config);
}

/**
 * 默认引擎实例（单例）
 */
let defaultEngine: ContextEngine | null = null;

export function getContextEngine(config?: Partial<EngineConfig>): ContextEngine {
  if (!defaultEngine) {
    defaultEngine = createContextEngine(config);
  }
  return defaultEngine;
}

