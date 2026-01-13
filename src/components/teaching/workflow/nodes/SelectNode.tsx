'use client';

import React from 'react';
import { CheckSquare, ChevronRight, BookOpen, CheckCircle } from 'lucide-react';
import { BaseNode, type NodeStatus } from '../BaseNode';
import { cn } from '@/lib/utils';

interface Chapter {
  id: string;
  title: string;
  level?: number;
}

interface SelectNodeProps {
  status: NodeStatus;
  chapters: Chapter[];
  selectedChapter?: Chapter | null;
  onClick?: () => void;
  dimensions?: { width: number; height: number };
}

export function SelectNode({
  status,
  chapters,
  selectedChapter,
  onClick,
  dimensions = { width: 280, height: 200 },
}: SelectNodeProps) {
  return (
    <BaseNode
      title="章节选择"
      status={status}
      icon={CheckSquare}
      dimensions={dimensions}
      onClick={onClick}
    >
      {selectedChapter ? (
        // 有选中的章节
        <div className="space-y-3">
          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100">
            <div className="text-[10px] text-emerald-600 font-medium mb-1">已选择</div>
            <div className="text-sm font-bold text-emerald-800 line-clamp-2">
              {selectedChapter.title}
            </div>
          </div>
          
          <div className="flex items-center justify-between text-xs text-zinc-500 px-1">
            <span>共 {chapters.length} 个章节</span>
            <button
              onClick={(e) => { e.stopPropagation(); onClick?.(); }}
              className="text-zinc-600 hover:text-zinc-900 font-medium flex items-center gap-0.5"
            >
              重新选择 <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      ) : status === 'completed' ? (
        // 已完成状态（有手稿但没选章节）
        <div className="flex flex-col items-center justify-center h-full gap-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
            <CheckCircle className="w-6 h-6 text-emerald-500" />
          </div>
          <div className="text-center">
            <div className="text-xs font-medium text-emerald-700">已完成</div>
            <div className="text-[10px] text-zinc-400 mt-0.5">共 {chapters.length} 个章节</div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onClick?.(); }}
            className="text-[10px] px-3 py-1 rounded-full bg-zinc-100 text-zinc-600 font-medium hover:bg-zinc-200"
          >
            查看章节
          </button>
        </div>
      ) : status === 'ready' ? (
        // 可以选择章节
        <div className="space-y-2">
          <div className="space-y-1 max-h-[100px] overflow-y-auto" data-scrollable>
            {chapters.slice(0, 5).map((ch) => (
              <div
                key={ch.id}
                className="flex items-center gap-2 text-xs text-zinc-600 px-2 py-1.5 rounded bg-zinc-50 border border-zinc-100 hover:bg-zinc-100 cursor-pointer"
              >
                <BookOpen className="w-3 h-3 text-zinc-400 flex-shrink-0" />
                <span className="truncate">{ch.title}</span>
              </div>
            ))}
          </div>
          {chapters.length > 5 && (
            <div className="text-[10px] text-zinc-400 text-center">
              +{chapters.length - 5} 更多章节
            </div>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onClick?.(); }}
            className="w-full text-[10px] px-3 py-1.5 rounded-full bg-zinc-900 text-white font-medium hover:bg-zinc-800"
          >
            选择章节
          </button>
        </div>
      ) : (
        // pending 状态
        <div className="flex flex-col items-center justify-center h-full gap-2">
          <div className="w-12 h-12 rounded-xl bg-zinc-100 flex items-center justify-center">
            <CheckSquare className="w-5 h-5 text-zinc-400" />
          </div>
          <div className="text-xs text-zinc-400 text-center">
            等待大纲解析完成
          </div>
        </div>
      )}
    </BaseNode>
  );
}

export default SelectNode;
