'use client';

import React from 'react';
import { X, FileText, CheckCircle, Edit3, Sparkles, Clock, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Manuscript {
  id: string;
  chapterTitle: string;
  status: string;
  hasSlidev?: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ManuscriptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  manuscripts: Manuscript[];
  selectedManuscript?: Manuscript | null;
  generating?: boolean;
  progress?: number;
  onSelect?: (manuscript: Manuscript) => void;
  onEdit?: (manuscriptId: string) => void;
}

export function ManuscriptModal({
  open,
  onOpenChange,
  manuscripts,
  selectedManuscript,
  generating = false,
  progress = 0,
  onSelect,
  onEdit,
}: ManuscriptModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-[90vw] max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 bg-zinc-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-xl flex items-center justify-center shadow-sm">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-900">手稿管理</h2>
              <p className="text-xs text-zinc-500">选择手稿继续流程</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="h-8 w-8 p-0"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* 内容 */}
        <div className="flex-1 p-6 overflow-auto">
          {/* 生成中状态 */}
          {generating && (
            <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-100">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center animate-pulse">
                  <Sparkles className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <div className="text-sm font-bold text-amber-800">AI 正在生成手稿...</div>
                  <div className="text-xs text-amber-600">请稍候，这可能需要几分钟</div>
                </div>
              </div>
              <div className="w-full h-2 bg-amber-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* 手稿列表 */}
          {manuscripts.length > 0 && (
            <div>
              <div className="text-xs font-bold text-zinc-500 mb-3 flex items-center gap-2">
                <Clock className="w-3.5 h-3.5" />
                所有手稿 ({manuscripts.length})
              </div>
              <div className="space-y-2">
                {manuscripts.map((m) => {
                  const isSelected = selectedManuscript?.id === m.id;
                  return (
                    <div
                      key={m.id}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-xl border transition-all",
                        isSelected
                          ? "bg-emerald-50 border-emerald-300"
                          : "bg-white border-zinc-200 hover:border-zinc-300"
                      )}
                    >
                      {/* 选择圆圈 */}
                      <button
                        onClick={() => onSelect?.(m)}
                        className="flex-shrink-0"
                      >
                        {isSelected ? (
                          <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                            <CheckCircle className="w-4 h-4 text-white" />
                          </div>
                        ) : (
                          <div className="w-5 h-5 rounded-full border-2 border-zinc-300 hover:border-zinc-400 transition-colors" />
                        )}
                      </button>

                      {/* 手稿信息 */}
                      <button
                        onClick={() => onSelect?.(m)}
                        className="flex-1 min-w-0 text-left"
                      >
                        <div className={cn(
                          "text-sm font-medium truncate",
                          isSelected ? "text-emerald-800" : "text-zinc-900"
                        )}>
                          {m.chapterTitle}
                        </div>
                        <div className="text-xs text-zinc-400">
                          {new Date(m.updatedAt).toLocaleDateString('zh-CN')}
                        </div>
                      </button>

                      {/* 标签 */}
                      {m.hasSlidev && (
                        <div className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-600 font-medium flex-shrink-0">
                          有PPT
                        </div>
                      )}

                      {/* 编辑按钮 */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEdit?.(m.id)}
                        className="h-8 px-2 text-zinc-500 hover:text-zinc-900"
                      >
                        <Edit3 className="w-4 h-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 空状态 */}
          {manuscripts.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
              <FileText className="w-12 h-12 mb-4 opacity-20" />
              <p className="text-sm">暂无手稿</p>
              <p className="text-xs mt-1">请先选择章节后生成手稿</p>
            </div>
          )}
        </div>

        {/* 底部操作 */}
        {selectedManuscript && (
          <div className="px-6 py-4 border-t border-zinc-100 bg-zinc-50/50">
            <div className="flex items-center justify-between">
              <div className="text-sm text-zinc-600">
                已选择: <span className="font-medium text-zinc-900">{selectedManuscript.chapterTitle}</span>
              </div>
              <Button
                onClick={() => onOpenChange(false)}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                确认选择
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ManuscriptModal;
