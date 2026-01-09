/**
 * 记忆存储模块
 * 实现 Prisma（元数据）+ LlamaIndex（向量）的双写存储
 */

import { Document, VectorStoreIndex, Settings } from 'llamaindex';
import { prisma } from '../prisma';
import { loadIndex } from '../llm/index-manager';
import type { ExtractedMemory, Memory, ScoredMemory } from './types';
import { calculateFreshnessScore } from './freshness';

/**
 * 记忆存储管理器
 */
export class MemoryStore {
  private knowledgeBaseId: string;
  private index: VectorStoreIndex | null = null;
  
  constructor(knowledgeBaseId: string) {
    this.knowledgeBaseId = knowledgeBaseId;
  }
  
  /**
   * 获取或加载向量索引
   */
  private async getIndex(): Promise<VectorStoreIndex> {
    if (!this.index) {
      this.index = await loadIndex(this.knowledgeBaseId);
    }
    return this.index;
  }
  
  /**
   * 保存记忆（同时写入 Prisma 和向量索引）
   */
  async save(memory: ExtractedMemory): Promise<Memory> {
    
    // 1. 写入 Prisma
    const dbMemory = await prisma.memory.create({
      data: {
        knowledgeBaseId: this.knowledgeBaseId,
        content: memory.content,
        type: memory.type,
        confidence: memory.confidence,
        accessCount: 0,
        lastAccessedAt: new Date(),
      },
    });
    
    // 2. 写入向量索引
    try {
      const index = await this.getIndex();
      
      // 创建文档节点
      const doc = new Document({
        text: memory.content,
        metadata: {
          type: 'memory',  // 用于区分记忆和文档
          memoryId: dbMemory.id,
          memoryType: memory.type,
          knowledgeBaseId: this.knowledgeBaseId,
        },
      });
      
      // 插入到索引
      await index.insert(doc);
      
      // 更新 vectorNodeId（使用 memoryId 作为 nodeId）
      await prisma.memory.update({
        where: { id: dbMemory.id },
        data: { vectorNodeId: dbMemory.id },
      });
      
    } catch (error) {
      console.error('[MemoryStore] Failed to save to vector index:', error);
      // 向量写入失败不影响 Prisma 记录
    }
    
    return dbMemory as Memory;
  }
  
  /**
   * 批量保存记忆
   */
  async saveMany(memories: ExtractedMemory[]): Promise<Memory[]> {
    const saved: Memory[] = [];
    for (const memory of memories) {
      const result = await this.save(memory);
      saved.push(result);
    }
    return saved;
  }
  
  /**
   * 检索相关记忆（基于向量相似度）
   * @param query 查询文本
   * @param limit 返回数量限制
   * @param minRelevance 最小相关性阈值（0-1），低于此阈值的不返回
   */
  async retrieve(
    query: string, 
    limit: number = 10,
    minRelevance: number = 0.5  // 关键！相关性阈值
  ): Promise<ScoredMemory[]> {
    
    try {
      const index = await this.getIndex();
      const retriever = index.asRetriever({ 
        similarityTopK: limit * 2,  // 多取一些，后面会过滤
      });
      
      // 执行向量检索
      const nodes = await retriever.retrieve(query);
      
      // 过滤出记忆节点（type === 'memory'）
      const memoryNodes = nodes.filter(
        node => node.node.metadata?.type === 'memory' &&
                node.node.metadata?.knowledgeBaseId === this.knowledgeBaseId
      );
      
      if (memoryNodes.length === 0) {
        return [];  // 不再 fallback，没有相关记忆就返回空
      }
      
      // 获取对应的数据库记录
      const memoryIds = memoryNodes
        .map(n => n.node.metadata?.memoryId)
        .filter(Boolean) as string[];
      
      const dbMemories = await prisma.memory.findMany({
        where: {
          id: { in: memoryIds },
          knowledgeBaseId: this.knowledgeBaseId,
        },
      });
      
      // 构建 ScoredMemory
      const now = new Date();
      const scored: ScoredMemory[] = [];
      
      for (const node of memoryNodes) {
        const memoryId = node.node.metadata?.memoryId;
        const dbMemory = dbMemories.find(m => m.id === memoryId);
        const relevanceScore = node.score || 0;
        
        // 🔥 关键：只保留相关性超过阈值的记忆
        if (relevanceScore < minRelevance) {
          continue;
        }
        
        if (dbMemory) {
          const freshnessScore = calculateFreshnessScore(dbMemory as Memory, now);
          
          // 综合评分：70% 相关性 + 30% 新鲜度
          const score = relevanceScore * 0.7 + freshnessScore * 0.3;
          
          scored.push({
            ...(dbMemory as Memory),
            score,
            relevanceScore,
            freshnessScore,
          });
        }
      }
      
      // 按综合评分排序
      scored.sort((a, b) => b.score - a.score);
      
      return scored.slice(0, limit);
    } catch (error) {
      console.error('[MemoryStore] Vector retrieval failed:', error);
      return [];  // 失败时返回空，不要返回无关内容
    }
  }
  
  /**
   * 回退检索（当向量检索失败时）
   * 按最近访问时间排序
   */
  private async fallbackRetrieve(limit: number): Promise<ScoredMemory[]> {
    
    const dbMemories = await prisma.memory.findMany({
      where: { knowledgeBaseId: this.knowledgeBaseId },
      orderBy: { lastAccessedAt: 'desc' },
      take: limit,
    });
    
    const now = new Date();
    return dbMemories.map(m => ({
      ...(m as Memory),
      score: calculateFreshnessScore(m as Memory, now),
      relevanceScore: 0,
      freshnessScore: calculateFreshnessScore(m as Memory, now),
    }));
  }
  
  /**
   * 更新记忆访问时间和计数
   */
  async touch(memoryId: string): Promise<void> {
    await prisma.memory.update({
      where: { id: memoryId },
      data: {
        accessCount: { increment: 1 },
        lastAccessedAt: new Date(),
      },
    });
  }
  
  /**
   * 批量更新访问时间
   */
  async touchMany(memoryIds: string[]): Promise<void> {
    await prisma.memory.updateMany({
      where: { id: { in: memoryIds } },
      data: {
        lastAccessedAt: new Date(),
      },
    });
    
    // accessCount 需要单独更新
    for (const id of memoryIds) {
      await prisma.memory.update({
        where: { id },
        data: { accessCount: { increment: 1 } },
      });
    }
  }
  
  /**
   * 删除记忆
   */
  async delete(memoryId: string): Promise<void> {
    // 从数据库删除
    await prisma.memory.delete({
      where: { id: memoryId },
    });
    
    // 注意：向量索引中的节点不容易删除
    // 可以在检索时通过 metadata 过滤掉已删除的记忆
  }
  
  /**
   * 获取知识库的所有记忆
   */
  async getAll(): Promise<Memory[]> {
    const memories = await prisma.memory.findMany({
      where: { knowledgeBaseId: this.knowledgeBaseId },
      orderBy: { createdAt: 'desc' },
    });
    return memories as Memory[];
  }
  
  /**
   * 获取记忆数量
   */
  async count(): Promise<number> {
    return prisma.memory.count({
      where: { knowledgeBaseId: this.knowledgeBaseId },
    });
  }
  
  /**
   * 检查是否存在相似记忆（避免重复）
   */
  async hasSimilar(content: string, threshold: number = 0.9): Promise<boolean> {
    try {
      const similar = await this.retrieve(content, 1);
      if (similar.length > 0 && similar[0].relevanceScore >= threshold) {
        return true;
      }
    } catch (error) {
      // 检索失败，假设不存在
    }
    return false;
  }
}

/**
 * 创建记忆存储实例
 */
export function createMemoryStore(knowledgeBaseId: string): MemoryStore {
  return new MemoryStore(knowledgeBaseId);
}

