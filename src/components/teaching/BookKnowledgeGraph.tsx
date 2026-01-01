'use client';

/**
 * 全书知识图谱可视化组件
 * 
 * 展示：
 * - 章节关系 DAG
 * - 核心概念节点和关系
 * 
 * 使用 react-force-graph-2d
 */

import React, { useRef, useCallback, useMemo, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

// 动态导入 force-graph（避免 SSR 问题）
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-64 text-gray-500">
      加载中...
    </div>
  ),
});

// ==================== 类型定义 ====================

interface ChapterNode {
  id: string;
  title: string;
  role: 'core' | 'foundation' | 'extension' | 'reference';
  weight: number;
}

interface ChapterEdge {
  from: string;
  to: string;
  type: string;
}

interface ConceptNode {
  id: string;
  name: string;
  chapterId: string;
  type: string;
  weight: number;
}

interface ConceptEdge {
  from: string;
  to: string;
  type: string;
}

export interface BookKnowledgeGraphProps {
  /** 章节 DAG */
  chapterDAG?: {
    nodes: ChapterNode[];
    edges: ChapterEdge[];
  };
  /** 概念图谱 */
  conceptGraph?: {
    concepts: ConceptNode[];
    relations: ConceptEdge[];
  };
  /** 视图模式 */
  viewMode?: 'chapters' | 'concepts' | 'all';
  /** 高度 */
  height?: number;
  /** 点击节点回调 */
  onNodeClick?: (node: any) => void;
}

// ==================== 颜色配置 ====================

const ROLE_COLORS: Record<string, string> = {
  core: '#f59e0b',       // 橙色 - 核心
  foundation: '#3b82f6', // 蓝色 - 基础
  extension: '#10b981',  // 绿色 - 拓展
  reference: '#6b7280',  // 灰色 - 参考
};

const CONCEPT_TYPE_COLORS: Record<string, string> = {
  definition: '#8b5cf6', // 紫色 - 定义
  formula: '#ef4444',    // 红色 - 公式
  method: '#06b6d4',     // 青色 - 方法
  example: '#22c55e',    // 绿色 - 示例
  principle: '#f97316',  // 橙色 - 原理
  term: '#64748b',       // 灰色 - 术语
};

// ==================== 组件 ====================

export default function BookKnowledgeGraph({
  chapterDAG,
  conceptGraph,
  viewMode = 'chapters',
  height = 400,
  onNodeClick,
}: BookKnowledgeGraphProps) {
  const graphRef = useRef<any>();
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const frameCount = useRef(0);
  const hasCentered = useRef(false);

  // 每次数据变化时重置居中状态
  useEffect(() => {
    frameCount.current = 0;
    hasCentered.current = false;
  }, [chapterDAG, conceptGraph]);

  // 引擎停止后自动居中
  const handleEngineStop = useCallback(() => {
    if (graphRef.current && !hasCentered.current) {
      hasCentered.current = true;
      graphRef.current?.zoomToFit(400, 80);
    }
  }, []);

  // 渲染几帧后也尝试居中（备用方案）
  const handleRenderFrame = useCallback(() => {
    frameCount.current++;
    // 渲染 30 帧后居中（约 0.5 秒）
    if (frameCount.current === 30 && graphRef.current && !hasCentered.current) {
      hasCentered.current = true;
      graphRef.current?.zoomToFit(400, 80);
    }
  }, []);

  // 构建图数据
  const graphData = useMemo(() => {
    const nodes: any[] = [];
    const links: any[] = [];

    // 添加章节节点
    if ((viewMode === 'chapters' || viewMode === 'all') && chapterDAG) {
      chapterDAG.nodes.forEach(ch => {
        nodes.push({
          id: `ch_${ch.id}`,
          name: ch.title,
          type: 'chapter',
          role: ch.role,
          weight: ch.weight,
          color: ROLE_COLORS[ch.role] || ROLE_COLORS.core,
          size: 8 + ch.weight * 4,
        });
      });

      chapterDAG.edges.forEach(edge => {
        links.push({
          source: `ch_${edge.from}`,
          target: `ch_${edge.to}`,
          type: edge.type,
        });
      });
    }

    // 添加概念节点
    if ((viewMode === 'concepts' || viewMode === 'all') && conceptGraph) {
      conceptGraph.concepts.forEach(c => {
        nodes.push({
          id: `concept_${c.id}`,
          name: c.name,
          type: 'concept',
          conceptType: c.type,
          chapterId: c.chapterId,
          weight: c.weight,
          color: CONCEPT_TYPE_COLORS[c.type] || CONCEPT_TYPE_COLORS.term,
          size: 4 + c.weight * 3,
        });
      });

      conceptGraph.relations.forEach(rel => {
        links.push({
          source: `concept_${rel.from}`,
          target: `concept_${rel.to}`,
          type: rel.type,
        });
      });

      // 如果是全部视图，添加章节到概念的连接
      if (viewMode === 'all' && chapterDAG) {
        conceptGraph.concepts.forEach(c => {
          const chapterNode = chapterDAG.nodes.find(ch => ch.id === c.chapterId);
          if (chapterNode) {
            links.push({
              source: `ch_${c.chapterId}`,
              target: `concept_${c.id}`,
              type: 'contains',
              dashed: true,
            });
          }
        });
      }
    }

    return { nodes, links };
  }, [chapterDAG, conceptGraph, viewMode]);

  // 节点点击处理
  const handleNodeClick = useCallback((node: any) => {
    if (onNodeClick) {
      onNodeClick(node);
    }
    // 聚焦到节点
    if (graphRef.current) {
      graphRef.current.centerAt(node.x, node.y, 500);
      graphRef.current.zoom(2, 500);
    }
  }, [onNodeClick]);

  // 节点悬停处理
  const handleNodeHover = useCallback((node: any) => {
    setHoveredNode(node?.id || null);
  }, []);

  // 自定义节点渲染
  const nodeCanvasObject = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const label = node.name;
    const fontSize = Math.max(10 / globalScale, 3);
    const size = node.size || 6;
    const isHovered = node.id === hoveredNode;

    // 绘制节点
    ctx.beginPath();
    if (node.type === 'chapter') {
      // 章节用圆角矩形
      const rectSize = size * 2;
      ctx.roundRect(node.x - rectSize / 2, node.y - rectSize / 2, rectSize, rectSize, 3);
    } else {
      // 概念用圆形
      ctx.arc(node.x, node.y, size, 0, 2 * Math.PI);
    }
    
    ctx.fillStyle = isHovered ? '#fff' : node.color;
    ctx.fill();
    
    if (isHovered) {
      ctx.strokeStyle = node.color;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // 绘制标签
    if (globalScale > 0.5 || isHovered) {
      ctx.font = `${fontSize}px "PingFang SC", "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = isHovered ? node.color : '#374151';
      
      // 截断过长的标签
      const maxLength = 10;
      const displayLabel = label.length > maxLength 
        ? label.substring(0, maxLength) + '...' 
        : label;
      
      ctx.fillText(displayLabel, node.x, node.y + size + 2);
    }
  }, [hoveredNode]);

  // 空状态
  if (!chapterDAG && !conceptGraph) {
    return (
      <div 
        className="flex flex-col items-center justify-center bg-gray-50 rounded-lg border-2 border-dashed border-gray-200"
        style={{ height }}
      >
        <div className="text-gray-400 text-sm">暂无知识图谱数据</div>
        <div className="text-gray-300 text-xs mt-1">完成粗读分析后将显示章节关系图</div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* 图例 */}
      <div className="absolute top-2 left-2 z-10 bg-white/90 backdrop-blur rounded-lg p-2 text-xs shadow-sm">
        {viewMode !== 'concepts' && (
          <div className="mb-2">
            <div className="font-medium text-gray-600 mb-1">章节角色</div>
            <div className="flex flex-wrap gap-2">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded" style={{ backgroundColor: ROLE_COLORS.core }} />
                核心
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded" style={{ backgroundColor: ROLE_COLORS.foundation }} />
                基础
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded" style={{ backgroundColor: ROLE_COLORS.extension }} />
                拓展
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded" style={{ backgroundColor: ROLE_COLORS.reference }} />
                参考
              </span>
            </div>
          </div>
        )}
        {viewMode !== 'chapters' && conceptGraph && conceptGraph.concepts.length > 0 && (
          <div>
            <div className="font-medium text-gray-600 mb-1">概念类型</div>
            <div className="flex flex-wrap gap-2">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CONCEPT_TYPE_COLORS.definition }} />
                定义
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CONCEPT_TYPE_COLORS.method }} />
                方法
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CONCEPT_TYPE_COLORS.principle }} />
                原理
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 图谱 */}
      <div className="rounded-lg overflow-hidden border border-gray-200 bg-white">
        <ForceGraph2D
          ref={graphRef}
          graphData={graphData}
          width={undefined}
          height={height}
          nodeCanvasObject={nodeCanvasObject}
          nodePointerAreaPaint={(node: any, color, ctx) => {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(node.x, node.y, node.size + 2, 0, 2 * Math.PI);
            ctx.fill();
          }}
          linkColor={() => '#94a3b8'}
          linkWidth={2}
          linkDirectionalArrowLength={6}
          linkDirectionalArrowRelPos={0.85}
          linkCurvature={0.15}
          onNodeClick={handleNodeClick}
          onNodeHover={handleNodeHover}
          onEngineStop={handleEngineStop}
          onRenderFramePost={handleRenderFrame}
          cooldownTicks={100}
          d3AlphaDecay={0.02}
          d3VelocityDecay={0.4}
          d3AlphaMin={0.001}
          enableZoomInteraction={true}
          enablePanInteraction={true}
        />
      </div>

      {/* 节点数量统计 */}
      <div className="mt-2 text-xs text-gray-500 text-center">
        {graphData.nodes.filter(n => n.type === 'chapter').length} 个章节
        {viewMode !== 'chapters' && conceptGraph && (
          <> · {graphData.nodes.filter(n => n.type === 'concept').length} 个概念</>
        )}
        {graphData.links.length > 0 && (
          <> · {graphData.links.length} 条关系</>
        )}
      </div>
    </div>
  );
}

