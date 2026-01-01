'use client';

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';

/** 课程地图节点 */
interface CourseMapNode {
  id: string;
  type: 'chapter' | 'concept';
  label: string;
  weight: number;
  category: string;
  position?: { x: number; y: number };
}

/** 课程地图边 */
interface CourseMapEdge {
  id: string;
  source: string;
  target: string;
  type: string;
}

/** 课程地图 */
interface CourseMap {
  nodes: CourseMapNode[];
  edges: CourseMapEdge[];
  layout: string;
}

interface CourseMapViewerProps {
  courseMap: CourseMap;
  className?: string;
  showConcepts?: boolean;
}

/** 章节角色颜色 */
const CHAPTER_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  core: { bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-700' },
  foundation: { bg: 'bg-green-50', border: 'border-green-300', text: 'text-green-700' },
  extension: { bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-700' },
  reference: { bg: 'bg-zinc-50', border: 'border-zinc-300', text: 'text-zinc-600' },
};

/** 概念类型颜色 */
const CONCEPT_COLORS: Record<string, { bg: string; border: string }> = {
  definition: { bg: 'bg-purple-100', border: 'border-purple-400' },
  principle: { bg: 'bg-pink-100', border: 'border-pink-400' },
  formula: { bg: 'bg-red-100', border: 'border-red-400' },
  method: { bg: 'bg-teal-100', border: 'border-teal-400' },
  example: { bg: 'bg-lime-100', border: 'border-lime-400' },
  term: { bg: 'bg-zinc-100', border: 'border-zinc-400' },
};

export function CourseMapViewer({ courseMap, className, showConcepts = false }: CourseMapViewerProps) {
  // 过滤节点
  const visibleNodes = useMemo(() => {
    if (showConcepts) return courseMap.nodes;
    return courseMap.nodes.filter(n => n.type === 'chapter');
  }, [courseMap.nodes, showConcepts]);

  // 过滤边
  const visibleEdges = useMemo(() => {
    const nodeIds = new Set(visibleNodes.map(n => n.id));
    return courseMap.edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));
  }, [courseMap.edges, visibleNodes]);

  // 按层级分组章节
  const layers = useMemo(() => {
    const chapterNodes = visibleNodes.filter(n => n.type === 'chapter');
    
    // 构建邻接表
    const adjList = new Map<string, string[]>();
    const inDegree = new Map<string, number>();
    
    chapterNodes.forEach(n => {
      adjList.set(n.id, []);
      inDegree.set(n.id, 0);
    });
    
    visibleEdges.forEach(e => {
      if (adjList.has(e.source)) {
        adjList.get(e.source)!.push(e.target);
        inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
      }
    });
    
    // 拓扑排序分层
    const result: CourseMapNode[][] = [];
    const assigned = new Set<string>();
    
    while (assigned.size < chapterNodes.length) {
      const layer: CourseMapNode[] = [];
      
      chapterNodes.forEach(node => {
        if (assigned.has(node.id)) return;
        
        // 检查所有前置是否已分配
        let ready = true;
        visibleEdges.forEach(e => {
          if (e.target === node.id && !assigned.has(e.source)) {
            ready = false;
          }
        });
        
        if (ready) {
          layer.push(node);
        }
      });
      
      if (layer.length === 0) {
        // 有环，添加剩余节点
        chapterNodes.forEach(n => {
          if (!assigned.has(n.id)) layer.push(n);
        });
      }
      
      layer.forEach(n => assigned.add(n.id));
      if (layer.length > 0) result.push(layer);
    }
    
    return result;
  }, [visibleNodes, visibleEdges]);

  // 统计信息
  const stats = useMemo(() => {
    const chapters = courseMap.nodes.filter(n => n.type === 'chapter');
    const concepts = courseMap.nodes.filter(n => n.type === 'concept');
    
    return {
      totalChapters: chapters.length,
      coreChapters: chapters.filter(c => c.category === 'core').length,
      totalConcepts: concepts.length,
      totalEdges: courseMap.edges.length,
    };
  }, [courseMap]);

  return (
    <div className={cn("space-y-6", className)}>
      {/* 统计信息 */}
      <div className="flex flex-wrap gap-4 p-4 bg-zinc-50 rounded-lg">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-blue-500" />
          <span className="text-sm text-zinc-600">
            <span className="font-medium">{stats.coreChapters}</span> 核心章节
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-green-500" />
          <span className="text-sm text-zinc-600">
            <span className="font-medium">{stats.totalChapters}</span> 总章节
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-purple-500" />
          <span className="text-sm text-zinc-600">
            <span className="font-medium">{stats.totalConcepts}</span> 概念
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-zinc-400" />
          <span className="text-sm text-zinc-600">
            <span className="font-medium">{stats.totalEdges}</span> 关系
          </span>
        </div>
      </div>

      {/* 图例 */}
      <div className="flex flex-wrap gap-3 text-xs">
        <span className="text-zinc-500">章节角色：</span>
        {Object.entries(CHAPTER_COLORS).map(([role, colors]) => (
          <span 
            key={role}
            className={cn("px-2 py-1 rounded border", colors.bg, colors.border, colors.text)}
          >
            {role === 'core' ? '核心' : 
             role === 'foundation' ? '基础' : 
             role === 'extension' ? '拓展' : '参考'}
          </span>
        ))}
      </div>

      {/* 层级流程图 */}
      <div className="overflow-x-auto">
        <div className="min-w-[600px] space-y-8 p-4">
          {layers.map((layer, layerIndex) => (
            <div key={layerIndex} className="relative">
              {/* 层级标签 */}
              <div className="absolute -left-2 top-0 -translate-x-full text-xs text-zinc-400 font-medium">
                L{layerIndex + 1}
              </div>
              
              {/* 节点容器 */}
              <div className="flex flex-wrap gap-4 justify-center">
                {layer.map((node) => {
                  const colors = CHAPTER_COLORS[node.category] || CHAPTER_COLORS.core;
                  const sizeClass = node.weight >= 0.7 ? 'min-w-[180px]' : 'min-w-[140px]';
                  
                  return (
                    <div
                      key={node.id}
                      className={cn(
                        "px-4 py-3 rounded-lg border-2 shadow-sm transition-all hover:shadow-md cursor-pointer",
                        sizeClass,
                        colors.bg,
                        colors.border
                      )}
                    >
                      <div className={cn("font-medium text-sm", colors.text)}>
                        {node.label}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <div 
                          className="h-1.5 bg-current rounded-full opacity-30"
                          style={{ width: `${node.weight * 100}%`, maxWidth: '80px' }}
                        />
                        <span className="text-xs opacity-60">
                          {Math.round(node.weight * 100)}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 连接箭头（非最后一层） */}
              {layerIndex < layers.length - 1 && (
                <div className="flex justify-center py-2">
                  <svg width="24" height="24" viewBox="0 0 24 24" className="text-zinc-300">
                    <path 
                      d="M12 4 L12 20 M6 14 L12 20 L18 14" 
                      stroke="currentColor" 
                      strokeWidth="2" 
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 概念节点（可选） */}
      {showConcepts && (
        <div className="mt-6 pt-6 border-t">
          <h4 className="text-sm font-medium text-zinc-700 mb-3">概念节点</h4>
          <div className="flex flex-wrap gap-2">
            {courseMap.nodes
              .filter(n => n.type === 'concept')
              .sort((a, b) => b.weight - a.weight)
              .slice(0, 20)
              .map(node => {
                const colors = CONCEPT_COLORS[node.category] || CONCEPT_COLORS.term;
                return (
                  <span
                    key={node.id}
                    className={cn(
                      "inline-flex items-center px-2 py-1 text-xs rounded-full border",
                      colors.bg,
                      colors.border
                    )}
                    title={`权重: ${Math.round(node.weight * 100)}%`}
                  >
                    {node.label}
                  </span>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

