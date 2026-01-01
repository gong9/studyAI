/**
 * 阶段4：课程地图生成
 * 
 * 职责：
 * - 生成可视化的课程地图
 * - 展示章节和概念依赖关系
 * - 支持 DAG 布局
 * 
 * 原则：纯计算，不调用 LLM
 */

import type { 
  ChapterMeta,
  ChapterDAG,
  ConceptGraph,
  CourseMap,
  CourseMapNode,
  CourseMapEdge
} from '../types';

// ==================== 类型定义 ====================

export interface CourseMapGeneratorInput {
  /** 章节列表 */
  chapters: ChapterMeta[];
  /** 章节依赖 DAG */
  chapterDAG: ChapterDAG;
  /** 概念图谱 */
  graph: ConceptGraph;
  /** 是否包含概念节点 */
  includeConcepts?: boolean;
  /** 布局类型 */
  layout?: 'dagre' | 'force' | 'radial';
}

export interface CourseMapGeneratorOutput {
  success: boolean;
  courseMap: CourseMap | null;
  error?: string;
}

// ==================== 颜色配置 ====================

/** 章节角色颜色 */
const CHAPTER_COLORS: Record<string, string> = {
  core: '#3B82F6',      // 蓝色
  foundation: '#10B981', // 绿色
  extension: '#F59E0B',  // 橙色
  reference: '#6B7280',  // 灰色
};

/** 概念类型颜色 */
const CONCEPT_COLORS: Record<string, string> = {
  definition: '#8B5CF6', // 紫色
  principle: '#EC4899',  // 粉色
  formula: '#EF4444',    // 红色
  method: '#14B8A6',     // 青色
  example: '#84CC16',    // 黄绿
  term: '#6B7280',       // 灰色
};

// ==================== 核心函数 ====================

/**
 * 生成课程地图
 */
export function generateCourseMap(input: CourseMapGeneratorInput): CourseMapGeneratorOutput {
  try {
    const { 
      chapters, 
      chapterDAG, 
      graph, 
      includeConcepts = false,
      layout = 'dagre'
    } = input;

    const nodes: CourseMapNode[] = [];
    const edges: CourseMapEdge[] = [];
    let edgeId = 0;

    // 1. 添加章节节点
    for (const node of chapterDAG.nodes) {
      const chapter = chapters.find(c => c.id === node.id);
      nodes.push({
        id: node.id,
        type: 'chapter',
        label: node.title,
        weight: node.weight,
        category: node.role,
      });
    }

    // 2. 添加章节边
    for (const edge of chapterDAG.edges) {
      edges.push({
        id: `edge_${edgeId++}`,
        source: edge.from,
        target: edge.to,
        type: edge.type,
      });
    }

    // 3. 如果需要，添加概念节点和边
    if (includeConcepts) {
      // 添加概念节点
      for (const concept of graph.concepts) {
        nodes.push({
          id: concept.id,
          type: 'concept',
          label: concept.name,
          weight: concept.weight,
          category: concept.type,
        });

        // 添加章节到概念的边
        edges.push({
          id: `edge_${edgeId++}`,
          source: concept.chapterId,
          target: concept.id,
          type: 'contains',
        });
      }

      // 添加概念关系边
      for (const rel of graph.relations) {
        edges.push({
          id: `edge_${edgeId++}`,
          source: rel.from,
          target: rel.to,
          type: rel.type,
        });
      }
    }

    // 4. 计算布局位置（简单的层次布局）
    if (layout === 'dagre') {
      calculateDagreLayout(nodes, edges, chapters);
    }

    console.log('[CourseMapGenerator] Generated map:', nodes.length, 'nodes,', edges.length, 'edges');

    return {
      success: true,
      courseMap: {
        nodes,
        edges,
        layout,
      },
    };
  } catch (error: any) {
    console.error('[CourseMapGenerator] Error:', error);
    return {
      success: false,
      courseMap: null,
      error: error.message || '课程地图生成失败',
    };
  }
}

// ==================== 辅助函数 ====================

/**
 * 计算 DAG 布局位置
 */
function calculateDagreLayout(
  nodes: CourseMapNode[],
  edges: CourseMapEdge[],
  chapters: ChapterMeta[]
): void {
  // 构建邻接表
  const adjList = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const node of nodes) {
    adjList.set(node.id, []);
    inDegree.set(node.id, 0);
  }

  for (const edge of edges) {
    if (adjList.has(edge.source) && adjList.has(edge.target)) {
      adjList.get(edge.source)!.push(edge.target);
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    }
  }

  // 拓扑排序分层
  const layers: string[][] = [];
  const assigned = new Set<string>();

  while (assigned.size < nodes.length) {
    const layer: string[] = [];
    
    for (const node of nodes) {
      if (assigned.has(node.id)) continue;
      
      // 检查所有前置节点是否已分配
      let ready = true;
      for (const edge of edges) {
        if (edge.target === node.id && !assigned.has(edge.source)) {
          ready = false;
          break;
        }
      }
      
      if (ready) {
        layer.push(node.id);
      }
    }

    // 如果这一层没有节点（可能有环），添加剩余节点
    if (layer.length === 0) {
      for (const node of nodes) {
        if (!assigned.has(node.id)) {
          layer.push(node.id);
        }
      }
    }

    for (const id of layer) {
      assigned.add(id);
    }
    
    if (layer.length > 0) {
      layers.push(layer);
    }
  }

  // 计算位置
  const nodeMap = new Map<string, CourseMapNode>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  const layerHeight = 150;
  const nodeWidth = 200;

  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    const layerWidth = layer.length * nodeWidth;
    const startX = -layerWidth / 2 + nodeWidth / 2;

    for (let j = 0; j < layer.length; j++) {
      const node = nodeMap.get(layer[j]);
      if (node) {
        node.position = {
          x: startX + j * nodeWidth,
          y: i * layerHeight,
        };
      }
    }
  }
}

/**
 * 生成 Mermaid 格式的课程地图
 */
export function generateMermaidDiagram(courseMap: CourseMap): string {
  let mermaid = 'flowchart TD\n';

  // 添加节点
  for (const node of courseMap.nodes) {
    const label = node.label.replace(/"/g, "'");
    if (node.type === 'chapter') {
      mermaid += `  ${node.id}["${label}"]\n`;
    } else {
      mermaid += `  ${node.id}(("${label}"))\n`;
    }
  }

  mermaid += '\n';

  // 添加边
  for (const edge of courseMap.edges) {
    const arrowType = edge.type === 'prerequisite' ? '-->' : '-.->';
    mermaid += `  ${edge.source} ${arrowType} ${edge.target}\n`;
  }

  return mermaid;
}

/**
 * 生成统计信息
 */
export function getCourseMapStats(courseMap: CourseMap): {
  totalNodes: number;
  chapterNodes: number;
  conceptNodes: number;
  totalEdges: number;
  prerequisiteEdges: number;
} {
  const chapterNodes = courseMap.nodes.filter(n => n.type === 'chapter').length;
  const conceptNodes = courseMap.nodes.filter(n => n.type === 'concept').length;
  const prerequisiteEdges = courseMap.edges.filter(e => e.type === 'prerequisite').length;

  return {
    totalNodes: courseMap.nodes.length,
    chapterNodes,
    conceptNodes,
    totalEdges: courseMap.edges.length,
    prerequisiteEdges,
  };
}

