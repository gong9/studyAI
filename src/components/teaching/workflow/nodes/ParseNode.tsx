'use client';

import React from 'react';
import { Sparkles, Network, ListTree, FileSearch, SkipForward, Edit3 } from 'lucide-react';
import { BaseNode, type NodeStatus } from '../BaseNode';
import { cn } from '@/lib/utils';

type SourceMode = 'book' | 'docs' | 'fragments' | 'paper';

const PARSE_CONFIG: Record<SourceMode, { action: string; icon: React.ElementType }> = {
  book: { action: '智能扫描', icon: Sparkles },
  docs: { action: '处理文档', icon: FileSearch },
  fragments: { action: '主题聚类', icon: ListTree },
  paper: { action: '论文分析', icon: FileSearch },
};

interface ParseNodeProps {
  status: NodeStatus;
  sourceMode: SourceMode;
  chapterCount?: number;
  progress?: number;
  onParse?: () => void;
  onSkip?: () => void; // 碎片模式跳过
  onViewGraph?: () => void;
  onAdjust?: () => void; // 调整大纲
  onClick?: () => void;
  dimensions?: { width: number; height: number };
}

export function ParseNode({
  status,
  sourceMode,
  chapterCount = 0,
  progress,
  onParse,
  onSkip,
  onViewGraph,
  onAdjust,
  onClick,
  dimensions = { width: 280, height: 200 },
}: ParseNodeProps) {
  const config = PARSE_CONFIG[sourceMode];
  const ActionIcon = config.icon;

  return (
    <BaseNode
      title="大纲解析"
      status={status}
      icon={ListTree}
      dimensions={dimensions}
      onClick={onClick}
      progress={status === 'processing' ? progress : undefined}
    >
      {status === 'completed' ? (
        <div className="space-y-2">
          {/* 章节统计 */}
          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100">
            <div className="flex items-center justify-between">
              <span className="text-xs text-emerald-700 font-medium">已提取章节</span>
              <span className="text-lg font-bold text-emerald-600">{chapterCount}</span>
            </div>
          </div>
          
          {/* 操作按钮 */}
          <div className="flex gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); onViewGraph?.(); }}
              className="flex-1 text-[10px] px-2 py-1.5 rounded-lg bg-zinc-100 text-zinc-700 font-medium hover:bg-zinc-200 flex items-center justify-center gap-1"
            >
              <Network className="w-3 h-3" />
              知识图谱
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onAdjust?.(); }}
              className="flex-1 text-[10px] px-2 py-1.5 rounded-lg bg-zinc-100 text-zinc-700 font-medium hover:bg-zinc-200 flex items-center justify-center gap-1"
            >
              <Edit3 className="w-3 h-3" />
              调整大纲
            </button>
          </div>
        </div>
      ) : status === 'processing' ? (
        <div className="flex flex-col items-center justify-center h-full gap-2">
          <div className="text-sm font-medium text-amber-600">{config.action}中...</div>
          <div className="text-[10px] text-zinc-500">AI 正在分析文档结构</div>
        </div>
      ) : status === 'ready' ? (
        <div className="flex flex-col items-center justify-center h-full gap-3">
          <div className="w-12 h-12 rounded-xl bg-zinc-100 flex items-center justify-center">
            <ActionIcon className="w-5 h-5 text-zinc-500" />
          </div>
          <div className="text-xs text-zinc-500 text-center">{config.action}</div>
          <div className="flex gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); onParse?.(); }}
              className="text-[10px] px-3 py-1.5 rounded-full bg-zinc-900 text-white font-medium hover:bg-zinc-800 flex items-center gap-1"
            >
              <ActionIcon className="w-3 h-3" />
              {config.action}
            </button>
            {sourceMode === 'fragments' && (
              <button
                onClick={(e) => { e.stopPropagation(); onSkip?.(); }}
                className="text-[10px] px-3 py-1.5 rounded-full bg-zinc-100 text-zinc-600 font-medium hover:bg-zinc-200 flex items-center gap-1"
              >
                <SkipForward className="w-3 h-3" />
                跳过
              </button>
            )}
          </div>
        </div>
      ) : (
        // pending 状态 - 等待上一步完成
        <div className="flex flex-col items-center justify-center h-full gap-2">
          <div className="w-12 h-12 rounded-xl bg-zinc-100 flex items-center justify-center">
            <ActionIcon className="w-5 h-5 text-zinc-300" />
          </div>
          <div className="text-xs text-zinc-400 text-center">等待文档处理完成</div>
        </div>
      )}
    </BaseNode>
  );
}

export default ParseNode;

