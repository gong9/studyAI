'use client';

import React from 'react';
import { FileText, CheckCircle, Sparkles, ChevronRight, Edit3, PenLine } from 'lucide-react';
import { BaseNode, type NodeStatus } from '../BaseNode';
import { cn } from '@/lib/utils';

interface Manuscript {
  id: string;
  chapterTitle: string;
  status: string;
  hasSlidev?: boolean;
}

interface ScriptNodeProps {
  status: NodeStatus;
  manuscripts: Manuscript[];
  selectedManuscript?: Manuscript | null;
  selectedChapterTitle?: string; // 当前选中的章节标题
  progress?: number;
  onSelect?: (manuscript: Manuscript) => void;
  onEdit?: (manuscript: Manuscript) => void;
  onGenerate?: () => void; // 生成手稿
  onClick?: () => void;
  dimensions?: { width: number; height: number };
}

export function ScriptNode({
  status,
  manuscripts,
  selectedManuscript,
  selectedChapterTitle,
  progress,
  onSelect,
  onEdit,
  onGenerate,
  onClick,
  dimensions = { width: 280, height: 200 },
}: ScriptNodeProps) {
  // 未选中的手稿列表
  const otherManuscripts = manuscripts.filter(m => m.id !== selectedManuscript?.id);

  return (
    <BaseNode
      title="手稿生成"
      status={status}
      icon={FileText}
      dimensions={dimensions}
      onClick={onClick}
      progress={status === 'processing' ? progress : undefined}
    >
      <div className="flex flex-col h-full gap-2">
        {status === 'processing' ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center animate-pulse">
              <Sparkles className="w-5 h-5 text-amber-500" />
            </div>
            <div className="text-xs font-medium text-amber-700">生成中...</div>
          </div>
        ) : manuscripts.length > 0 ? (
          <>
            {/* 已选择的手稿 */}
            {selectedManuscript ? (
              <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-emerald-600 font-medium">已选择</div>
                    <div className="text-xs font-bold text-emerald-800 truncate">
                      {selectedManuscript.chapterTitle}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit?.(selectedManuscript);
                    }}
                    className="p-1.5 rounded-md bg-emerald-100 hover:bg-emerald-200 transition-colors"
                    title="编辑手稿"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-emerald-700" />
                  </button>
                </div>
              </div>
            ) : null}
            
            {/* 手稿列表：未选择时显示全部，已选择时显示其他可切换的 */}
            {otherManuscripts.length > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] text-zinc-400 px-1">
                  {selectedManuscript ? '切换到其他手稿' : '选择手稿'}
                </div>
                <div className="space-y-1 overflow-y-auto max-h-[100px]" data-scrollable>
                  {otherManuscripts.map((m) => (
                    <button
                      key={m.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect?.(m);
                      }}
                      className="w-full flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg border bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300 transition-all text-left"
                    >
                      <FileText className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                      <span className="truncate flex-1">{m.chapterTitle}</span>
                      {m.hasSlidev && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-600 flex-shrink-0">
                          PPT
                        </span>
                      )}
                      <ChevronRight className="w-3 h-3 text-zinc-400 flex-shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : status === 'ready' ? (
          // ready 状态 - 可以生成手稿
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="w-12 h-12 rounded-xl bg-zinc-100 flex items-center justify-center">
              <PenLine className="w-5 h-5 text-zinc-500" />
            </div>
            {selectedChapterTitle && (
              <div className="text-[10px] text-zinc-500 text-center px-2 line-clamp-2">
                为「{selectedChapterTitle}」生成手稿
              </div>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onGenerate?.(); }}
              className="text-[10px] px-4 py-2 rounded-full bg-zinc-900 text-white font-medium hover:bg-zinc-800 flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              生成手稿
            </button>
          </div>
        ) : (
          // pending 状态 - 等待选择章节
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <div className="w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center">
              <FileText className="w-5 h-5 text-zinc-300" />
            </div>
            <div className="text-xs text-zinc-400 text-center">
              等待选择章节
            </div>
          </div>
        )}
      </div>
    </BaseNode>
  );
}

export default ScriptNode;
