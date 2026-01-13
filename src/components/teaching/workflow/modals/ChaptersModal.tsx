'use client';

import React, { useState } from 'react';
import { X, BookOpen, ChevronRight, ChevronDown, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ChapterNode {
  id: string;
  title: string;
  level: number;
  orderIndex: number;
  contentPreview?: string;
  children: ChapterNode[];
}

interface ChaptersModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chapters: ChapterNode[];
  selectedChapter?: ChapterNode | null;
  onSelect: (chapter: ChapterNode) => void;
}

export function ChaptersModal({
  open,
  onOpenChange,
  chapters,
  selectedChapter,
  onSelect,
}: ChaptersModalProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  if (!open) return null;

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelect = (chapter: ChapterNode) => {
    onSelect(chapter);
    onOpenChange(false);
  };

  const renderChapterTree = (nodes: ChapterNode[], depth = 0): React.ReactNode => {
    return nodes.map((node) => {
      const hasChildren = node.children && node.children.length > 0;
      const isExpanded = expandedIds.has(node.id);
      const isSelected = selectedChapter?.id === node.id;

      return (
        <div key={node.id}>
          <div
            className={cn(
              "flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-all group",
              isSelected
                ? "bg-zinc-900 text-white"
                : "hover:bg-zinc-100 text-zinc-700"
            )}
            style={{ paddingLeft: `${depth * 16 + 12}px` }}
            onClick={() => handleSelect(node)}
          >
            {hasChildren ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpand(node.id);
                }}
                className={cn(
                  "w-5 h-5 flex items-center justify-center rounded",
                  isSelected ? "hover:bg-white/20" : "hover:bg-zinc-200"
                )}
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>
            ) : (
              <div className="w-5" />
            )}
            
            <BookOpen className={cn(
              "w-4 h-4 flex-shrink-0",
              isSelected ? "text-white" : "text-zinc-400"
            )} />
            
            <span className="flex-1 text-sm font-medium truncate">
              {node.title}
            </span>
            
            {isSelected && (
              <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            )}
          </div>

          {hasChildren && isExpanded && (
            <div className="mt-0.5">
              {renderChapterTree(node.children, depth + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  // 计算总章节数
  const countChapters = (nodes: ChapterNode[]): number => {
    return nodes.reduce((count, node) => {
      return count + 1 + (node.children ? countChapters(node.children) : 0);
    }, 0);
  };

  const totalChapters = countChapters(chapters);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-[90vw] max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 bg-zinc-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-zinc-900 rounded-xl flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-900">选择章节</h2>
              <p className="text-xs text-zinc-500">共 {totalChapters} 个章节</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="h-8 w-8 p-0 text-zinc-400 hover:text-zinc-900"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* 内容 */}
        <div className="flex-1 p-4 overflow-auto">
          {chapters.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
              <BookOpen className="w-12 h-12 mb-3 opacity-20" />
              <p className="text-sm">暂无章节</p>
              <p className="text-xs mt-1">请先进行大纲解析</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {renderChapterTree(chapters)}
            </div>
          )}
        </div>

        {/* 底部 */}
        {selectedChapter && (
          <div className="px-6 py-4 border-t border-zinc-100 bg-zinc-50/50">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-zinc-500 uppercase font-bold">已选择</div>
                <div className="text-sm font-bold text-zinc-800 truncate">
                  {selectedChapter.title}
                </div>
              </div>
              <Button onClick={() => onOpenChange(false)}>
                确认选择
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ChaptersModal;

