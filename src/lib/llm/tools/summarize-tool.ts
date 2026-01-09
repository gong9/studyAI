/**
 * 文档总结工具
 * 获取文档原文供 Agent 总结
 */
import { FunctionTool } from 'llamaindex';
import { prisma } from '../../prisma';
import type { ToolContext } from './types';

/**
 * 创建总结工具
 */
export function createSummarizeTool(ctx: ToolContext) {
  return FunctionTool.from(
    async ({ topic }: { topic: string }): Promise<string> => {
      
      // 1. 尝试从数据库直接读取原文（快速）
      try {
        const doc = await prisma.document.findFirst({
          where: {
            knowledgeBaseId: ctx.knowledgeBaseId,
            OR: [
              { name: { contains: topic } },
              { content: { contains: topic } },
            ],
          },
          select: { name: true, content: true, wordCount: true },
        });
        
        if (doc?.content && doc.content.length > 100) {
          // 返回原文给 Agent，让 Agent 自己总结
          const content = doc.content.length > 8000 
            ? doc.content.substring(0, 8000) + '\n\n...(内容截断，共' + doc.wordCount + '字)'
            : doc.content;
          return `【文档: ${doc.name}】\n\n${content}`;
        }
      } catch (dbError) {
      }
      
      // 2. Fallback: 使用 retriever 检索（不调用 LLM）
      const retriever = ctx.index.asRetriever({ similarityTopK: 15 });
      const nodes = await retriever.retrieve(topic);
      
      if (nodes.length === 0) {
        return '未找到相关内容';
      }
      
      // 直接拼接检索结果，不调用 LLM
      const contents = nodes
        .map((n, i) => `[片段${i + 1}] ${(n.node as any).text || ''}`)
        .join('\n\n');
      
      return contents;
    },
    {
      name: 'summarize_topic',
      description: '获取知识库中关于某个主题/文档的完整内容。输入文档名或主题关键词，返回原始内容供你总结。',
      parameters: {
        type: 'object',
        properties: {
          topic: {
            type: 'string',
            description: '文档名或主题关键词',
          },
        },
        required: ['topic'],
      },
    }
  );
}

