/**
 * 碎片资料主题聚类
 * 用于 fragments 模式：将多个零散文档智能归类到主题中
 */

import { OpenAI } from '@llamaindex/openai';
import { configureLLM } from '../llm/config';

// ==================== 类型定义 ====================

/** 文档摘要 */
export interface DocumentSummary {
  id: string;
  name: string;
  content: string;
  summary?: string;
  keywords?: string[];
}

/** 主题节点 */
export interface TopicNode {
  id: string;
  title: string;
  description: string;
  documentIds: string[];
  order: number;
}

/** 聚类结果 */
export interface ClusteringResult {
  success: boolean;
  topics: TopicNode[];
  metadata?: {
    totalDocuments: number;
    totalTopics: number;
    processedAt: string;
  };
  error?: string;
}

// ==================== 核心函数 ====================

/**
 * 将文档聚类成主题
 * @param documents 文档列表（需包含 id、name、content）
 * @returns 聚类后的主题列表
 */
export async function clusterDocumentsToTopics(
  documents: DocumentSummary[]
): Promise<ClusteringResult> {
  try {
    configureLLM();

    const llm = new OpenAI({
      model: process.env.OPENAI_MODEL || 'qwen-plus',
      apiKey: process.env.OPENAI_API_KEY!,
      baseURL: process.env.OPENAI_API_BASE || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });

    if (documents.length === 0) {
      return {
        success: false,
        topics: [],
        error: '没有可处理的文档',
      };
    }

    // 1. 为每个文档生成摘要和关键词
    console.log(`[TopicClustering] Processing ${documents.length} documents...`);
    
    const docSummaries: string[] = [];
    for (const doc of documents) {
      // 截取前2000字用于分析
      const contentPreview = (doc.content || '').substring(0, 2000);
      docSummaries.push(`【${doc.name}】\n${contentPreview}\n`);
    }

    // 2. 使用 LLM 进行主题聚类
    const clusterPrompt = `你是一个文档分析专家。请分析以下 ${documents.length} 份文档，将它们归类到 3-7 个核心主题中。

## 文档内容摘要

${docSummaries.join('\n---\n')}

## 任务要求

1. 分析所有文档的内容，找出共同的主题
2. 每个主题应该有明确的标题和简短描述
3. 将每个文档分配到最相关的主题（每个文档只属于一个主题）
4. 主题数量控制在 3-7 个之间

## 输出格式

请严格按照以下 JSON 格式输出：

\`\`\`json
{
  "topics": [
    {
      "title": "主题名称",
      "description": "主题的简短描述（1-2句话）",
      "documents": ["文档1名称", "文档2名称"]
    }
  ]
}
\`\`\`

请直接输出 JSON，不要有其他内容。`;

    console.log(`[TopicClustering] Calling LLM for clustering...`);
    const response = await llm.complete({ prompt: clusterPrompt });
    const responseText = response.text.trim();

    // 3. 解析 LLM 返回的 JSON
    let clusteredData: { topics: Array<{ title: string; description: string; documents: string[] }> };
    
    try {
      // 尝试提取 JSON
      const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : responseText;
      clusteredData = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('[TopicClustering] Failed to parse LLM response:', parseError);
      console.log('[TopicClustering] Raw response:', responseText);
      
      // 如果解析失败，创建一个默认分组
      return {
        success: true,
        topics: [{
          id: 'topic-1',
          title: '全部资料',
          description: '所有上传的文档资料',
          documentIds: documents.map(d => d.id),
          order: 1,
        }],
        metadata: {
          totalDocuments: documents.length,
          totalTopics: 1,
          processedAt: new Date().toISOString(),
        },
      };
    }

    // 4. 将文档名称映射回文档 ID
    const docNameToId = new Map(documents.map(d => [d.name, d.id]));
    
    const topics: TopicNode[] = clusteredData.topics.map((topic, index) => ({
      id: `topic-${index + 1}`,
      title: topic.title,
      description: topic.description,
      documentIds: topic.documents
        .map(docName => docNameToId.get(docName))
        .filter((id): id is string => !!id),
      order: index + 1,
    }));

    // 检查是否有未分配的文档
    const assignedDocIds = new Set(topics.flatMap(t => t.documentIds));
    const unassignedDocs = documents.filter(d => !assignedDocIds.has(d.id));
    
    if (unassignedDocs.length > 0) {
      // 将未分配的文档放入"其他"主题
      topics.push({
        id: `topic-other`,
        title: '其他资料',
        description: '未归类的文档资料',
        documentIds: unassignedDocs.map(d => d.id),
        order: topics.length + 1,
      });
    }

    console.log(`[TopicClustering] Clustered into ${topics.length} topics`);

    return {
      success: true,
      topics,
      metadata: {
        totalDocuments: documents.length,
        totalTopics: topics.length,
        processedAt: new Date().toISOString(),
      },
    };
  } catch (error: any) {
    console.error('[TopicClustering] Error:', error);
    return {
      success: false,
      topics: [],
      error: error.message || '主题聚类失败',
    };
  }
}

/**
 * 将主题转换为章节结构
 * @param topics 主题列表
 * @param documents 原始文档列表
 * @returns 可以保存到数据库的章节数组
 */
export function topicsToChapterNodes(
  topics: TopicNode[],
  documents: DocumentSummary[]
): Array<{
  title: string;
  level: number;
  orderIndex: number;
  contentPreview: string;
  contentFull: string;
  children: any[];
}> {
  const docMap = new Map(documents.map(d => [d.id, d]));

  return topics.map((topic, index) => {
    // 合并该主题下所有文档的内容
    const docsInTopic = topic.documentIds
      .map(id => docMap.get(id))
      .filter((d): d is DocumentSummary => !!d);

    const combinedContent = docsInTopic
      .map(d => `### ${d.name}\n\n${d.content}`)
      .join('\n\n---\n\n');

    return {
      title: topic.title,
      level: 1,
      orderIndex: index + 1,
      contentPreview: topic.description + '\n\n' + combinedContent.substring(0, 500),
      contentFull: combinedContent,
      children: [],
    };
  });
}

