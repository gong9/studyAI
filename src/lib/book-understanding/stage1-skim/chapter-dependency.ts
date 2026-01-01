/**
 * 阶段1：章节依赖DAG构建
 * 
 * 职责：
 * - 基于章节引用/顺序/共现关系构建依赖图
 * - 形成 DAG（有向无环图）
 * - 计算初步章节权重
 * 
 * 原则：Structure First - 只用 LLM 分析，不用 RAG
 */

import { OpenAI } from '@llamaindex/openai';
import { configureLLM } from '../../llm/config';
import type { ChapterMeta, ChapterDAG, ChapterEdge, DependencyType, BookThesis } from '../types';

// ==================== 类型定义 ====================

export interface DAGBuilderInput {
  /** 全书主题 */
  thesis: BookThesis;
  /** 已分类的章节列表 */
  chapters: ChapterMeta[];
}

export interface DAGBuilderOutput {
  success: boolean;
  dag: ChapterDAG | null;
  error?: string;
}

// ==================== Prompt ====================

const DAG_ANALYSIS_PROMPT = `你是一位课程设计专家。请分析以下章节之间的依赖关系，构建学习路径图。

## 全书主题
标题：{bookTitle}
核心命题：{bookTopic}

## 章节信息
{chapterInfo}

## 任务
分析章节之间的依赖关系，输出依赖边列表。

## 依赖类型说明
- prerequisite: 前置依赖 - 必须先学 A 才能学 B
- parallel: 并行关系 - A 和 B 可以同时学习，互相补充
- supplement: 补充关系 - B 是 A 的补充/延伸，非必须

## 输出格式 (JSON)
{
  "edges": [
    {
      "from": "源章节标题",
      "to": "目标章节标题",
      "type": "prerequisite|parallel|supplement"
    }
  ],
  "weights": {
    "章节标题": 0.8
  }
}

## 权重说明
- 权重范围 0-1
- 核心章节权重高（0.7-1.0）
- 基础章节权重中等（0.4-0.7）
- 拓展/参考章节权重低（0.1-0.4）

## 注意
1. 只输出有意义的依赖边，不要过度连接
2. 避免循环依赖（A→B→C→A）
3. 参考章节通常没有前置依赖

请直接输出 JSON，不要包含其他文字。`;

// ==================== 核心函数 ====================

/**
 * 构建章节依赖 DAG
 */
export async function buildChapterDAG(input: DAGBuilderInput): Promise<DAGBuilderOutput> {
  try {
    configureLLM();

    const { thesis, chapters } = input;

    if (chapters.length === 0) {
      return {
        success: false,
        dag: null,
        error: '没有章节可分析',
      };
    }

    // 如果章节很少，使用简单的顺序依赖
    if (chapters.length <= 3) {
      return {
        success: true,
        dag: buildSimpleDAG(chapters),
      };
    }

    const llm = new OpenAI({
      model: process.env.OPENAI_MODEL || 'qwen-plus',
      apiKey: process.env.OPENAI_API_KEY!,
      baseURL: process.env.OPENAI_API_BASE || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });

    const chapterInfo = formatChapterInfo(chapters);

    const prompt = DAG_ANALYSIS_PROMPT
      .replace('{bookTitle}', thesis.title)
      .replace('{bookTopic}', thesis.topic)
      .replace('{chapterInfo}', chapterInfo);

    console.log('[DAGBuilder] Analyzing dependencies for', chapters.length, 'chapters');

    const response = await llm.complete({ prompt });
    const text = response.text.trim();

    // 解析结果
    const dag = parseDAGResult(text, chapters);

    if (!dag) {
      // 降级到简单 DAG
      console.log('[DAGBuilder] Falling back to simple DAG');
      return {
        success: true,
        dag: buildSimpleDAG(chapters),
      };
    }

    // 验证 DAG（检测循环）
    const validated = validateAndFixDAG(dag);

    console.log('[DAGBuilder] DAG built:', validated.nodes.length, 'nodes,', validated.edges.length, 'edges');

    return {
      success: true,
      dag: validated,
    };
  } catch (error: any) {
    console.error('[DAGBuilder] Error:', error);
    return {
      success: false,
      dag: null,
      error: error.message || 'DAG 构建失败',
    };
  }
}

// ==================== 辅助函数 ====================

/**
 * 格式化章节信息用于 Prompt
 */
function formatChapterInfo(chapters: ChapterMeta[]): string {
  return chapters.map((ch, i) => {
    return `${i + 1}. ${ch.title}
   角色: ${ch.role}
   目标: ${ch.goal}
   关键概念: ${ch.keyConcepts.join(', ')}`;
  }).join('\n\n');
}

/**
 * 构建简单的顺序依赖 DAG
 */
function buildSimpleDAG(chapters: ChapterMeta[]): ChapterDAG {
  const nodes = chapters.map(ch => ({
    id: ch.id,
    title: ch.title,
    role: ch.role,
    weight: getDefaultWeight(ch.role),
  }));

  const edges: ChapterEdge[] = [];
  
  // 相邻章节建立依赖
  for (let i = 1; i < chapters.length; i++) {
    // 只有非参考章节建立依赖
    if (chapters[i].role !== 'reference' && chapters[i - 1].role !== 'reference') {
      edges.push({
        from: chapters[i - 1].id,
        to: chapters[i].id,
        type: 'prerequisite',
      });
    }
  }

  return { nodes, edges };
}

/**
 * 获取默认权重
 */
function getDefaultWeight(role: string): number {
  switch (role) {
    case 'core': return 0.85;
    case 'foundation': return 0.6;
    case 'extension': return 0.4;
    case 'reference': return 0.2;
    default: return 0.5;
  }
}

/**
 * 解析 LLM 返回的 DAG 结果
 */
function parseDAGResult(text: string, chapters: ChapterMeta[]): ChapterDAG | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    
    // 创建标题到 ID 的映射
    const titleToId = new Map<string, string>();
    const idToChapter = new Map<string, ChapterMeta>();
    for (const ch of chapters) {
      titleToId.set(normalizeTitle(ch.title), ch.id);
      idToChapter.set(ch.id, ch);
    }

    // 构建节点
    const nodes = chapters.map(ch => ({
      id: ch.id,
      title: ch.title,
      role: ch.role,
      weight: parsed.weights?.[ch.title] ?? getDefaultWeight(ch.role),
    }));

    // 构建边
    const edges: ChapterEdge[] = [];
    const edgeSet = new Set<string>(); // 用于去重

    if (Array.isArray(parsed.edges)) {
      for (const edge of parsed.edges) {
        const fromId = titleToId.get(normalizeTitle(edge.from));
        const toId = titleToId.get(normalizeTitle(edge.to));
        
        if (fromId && toId && fromId !== toId) {
          const edgeKey = `${fromId}->${toId}`;
          if (!edgeSet.has(edgeKey)) {
            edgeSet.add(edgeKey);
            edges.push({
              from: fromId,
              to: toId,
              type: validateDependencyType(edge.type),
            });
          }
        }
      }
    }

    return { nodes, edges };
  } catch (e) {
    console.error('[DAGBuilder] Parse error:', e);
    return null;
  }
}

/**
 * 标准化标题
 */
function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * 验证依赖类型
 */
function validateDependencyType(type: string | undefined): DependencyType {
  const validTypes: DependencyType[] = ['prerequisite', 'parallel', 'supplement'];
  if (type && validTypes.includes(type as DependencyType)) {
    return type as DependencyType;
  }
  return 'prerequisite';
}

/**
 * 验证并修复 DAG（检测和移除循环）
 */
function validateAndFixDAG(dag: ChapterDAG): ChapterDAG {
  // 使用 DFS 检测循环
  const adjList = new Map<string, string[]>();
  for (const edge of dag.edges) {
    if (!adjList.has(edge.from)) {
      adjList.set(edge.from, []);
    }
    adjList.get(edge.from)!.push(edge.to);
  }

  const visited = new Set<string>();
  const recStack = new Set<string>();
  const cycleEdges = new Set<string>();

  function dfs(node: string, path: string[]): boolean {
    visited.add(node);
    recStack.add(node);

    const neighbors = adjList.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor, [...path, node])) {
          return true;
        }
      } else if (recStack.has(neighbor)) {
        // 发现循环，标记这条边
        cycleEdges.add(`${node}->${neighbor}`);
      }
    }

    recStack.delete(node);
    return false;
  }

  for (const node of dag.nodes) {
    if (!visited.has(node.id)) {
      dfs(node.id, []);
    }
  }

  // 移除循环边
  if (cycleEdges.size > 0) {
    console.log('[DAGBuilder] Removing', cycleEdges.size, 'cycle edges');
    dag.edges = dag.edges.filter(edge => !cycleEdges.has(`${edge.from}->${edge.to}`));
  }

  return dag;
}

