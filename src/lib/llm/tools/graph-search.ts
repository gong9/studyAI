/**
 * 知识图谱检索工具
 * 基于 LightRAG 的实体关系检索
 */
import { FunctionTool } from 'llamaindex';
import { lightragClient, type LightRAGMode } from '../../lightrag-client';
import { hybridSearch, formatSearchResults } from '../../hybrid-search';
import type { ToolContext } from './types';

/**
 * 创建知识图谱检索工具
 */
export function createGraphSearchTool(ctx: ToolContext) {
  return FunctionTool.from(
    async ({ query, mode }: { query: string; mode?: string }): Promise<string> => {
      
      try {
        // 检查 LightRAG 是否可用
        const available = await lightragClient.isAvailable();
        if (!available) {
          // 降级到混合搜索
          const results = await hybridSearch(ctx.index, ctx.knowledgeBaseId, query, {
            vectorTopK: 8,
            keywordLimit: 8,
          });
          const formatted = formatSearchResults(results, 5);
          ctx.toolCalls.push({ tool: 'graph_search', input: query, output: `[fallback] ${formatted.substring(0, 200)}` });
          return `[注意：知识图谱服务不可用，已降级为混合检索]\n\n${formatted}`;
        }
        
        // 调用 LightRAG 查询
        const result = await lightragClient.query({
          kb_id: ctx.knowledgeBaseId,
          question: query,
          mode: (mode as LightRAGMode) || 'hybrid',
        });
        
        // 清理 LightRAG 返回中可能包含的格式化字符
        let cleanedAnswer = result.answer
          .replace(/^["'`]{3,}/gm, '')
          .replace(/["'`]{3,}$/gm, '')
          .replace(/\n["'`]{2,}\s*$/g, '')
          .trim();
        
        ctx.toolCalls.push({ tool: 'graph_search', input: query, output: cleanedAnswer.substring(0, 200) });
        return cleanedAnswer;
      } catch (error: any) {
        console.error(`[LLM] 🕸️ Graph search error: ${error.message}`);
        // 出错时降级到混合搜索
        const results = await hybridSearch(ctx.index, ctx.knowledgeBaseId, query, {
          vectorTopK: 8,
          keywordLimit: 8,
        });
        const formatted = formatSearchResults(results, 5);
        ctx.toolCalls.push({ tool: 'graph_search', input: query, output: `[error fallback] ${formatted.substring(0, 200)}` });
        return `[知识图谱查询出错，已降级为混合检索]\n\n${formatted}`;
      }
    },
    {
      name: 'graph_search',
      description: '知识图谱检索（LightRAG）：基于实体和关系的智能检索。适合查询实体之间的关系（如"谁是xxx的上级"、"A和B有什么关系"）、复杂推理问题。mode 参数: local（局部-适合具体问题）、global（全局-适合总结）、hybrid（混合-推荐）。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '查询问题' },
          mode: { 
            type: 'string', 
            enum: ['local', 'global', 'hybrid'],
            description: '检索模式：local（局部检索，适合具体问题）、global（全局检索，适合总结）、hybrid（混合，推荐）',
          },
        },
        required: ['query'],
      },
    }
  );
}

