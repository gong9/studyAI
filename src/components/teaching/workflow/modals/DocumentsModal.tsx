'use client';

import React, { useRef } from 'react';
import { X, Upload, FileText, Trash2, Loader2, ClipboardPaste, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Document {
  id: string;
  name: string;
  status: string;
}

interface DocumentsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documents: Document[];
  sourceMode: string;
  uploading?: boolean;
  onUpload: (files: FileList) => void;
  onDelete?: (docId: string) => void;
  onPaste?: () => void;
}

export function DocumentsModal({
  open,
  onOpenChange,
  documents,
  sourceMode,
  uploading = false,
  onUpload,
  onDelete,
  onPaste,
}: DocumentsModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onUpload(e.target.files);
      e.target.value = '';
    }
  };

  const canUploadMore = sourceMode !== 'book' || documents.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-[90vw] max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 bg-zinc-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-zinc-900 rounded-xl flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-900">文档管理</h2>
              <p className="text-xs text-zinc-500">
                {sourceMode === 'book' ? '书籍模式：仅支持上传一本书' : '可上传多个文档'}
              </p>
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
        <div className="flex-1 p-6 overflow-auto">
          {/* 上传区域 */}
          {canUploadMore && (
            <div
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors mb-4",
                uploading
                  ? "border-amber-300 bg-amber-50"
                  : "border-zinc-200 hover:border-zinc-400 hover:bg-zinc-50"
              )}
            >
              {uploading ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
                  <span className="text-sm text-amber-600 font-medium">上传中...</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="w-8 h-8 text-zinc-400" />
                  <span className="text-sm text-zinc-600 font-medium">点击或拖拽上传文档</span>
                  <span className="text-xs text-zinc-400">支持 PDF、DOCX、TXT</span>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.docx,.txt"
                multiple={sourceMode !== 'book'}
                onChange={handleFileSelect}
                disabled={uploading}
              />
            </div>
          )}

          {/* 粘贴按钮（碎片模式） */}
          {sourceMode === 'fragments' && (
            <button
              onClick={onPaste}
              className="w-full mb-4 p-3 rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 transition-colors flex items-center justify-center gap-2"
            >
              <ClipboardPaste className="w-4 h-4 text-zinc-500" />
              <span className="text-sm text-zinc-600 font-medium">粘贴文本内容</span>
            </button>
          )}

          {/* 文档列表 */}
          <div className="space-y-2">
            <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">
              已上传 ({documents.length})
            </div>
            {documents.length === 0 ? (
              <div className="text-center py-8 text-zinc-400 text-sm">
                暂无文档
              </div>
            ) : (
              documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-zinc-50 border border-zinc-100"
                >
                  <FileText className="w-5 h-5 text-zinc-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-zinc-800 truncate">{doc.name}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <div className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        doc.status === 'completed' ? "bg-emerald-500" : "bg-amber-500 animate-pulse"
                      )} />
                      <span className="text-[10px] text-zinc-500">
                        {doc.status === 'completed' ? '已就绪' : '处理中'}
                      </span>
                    </div>
                  </div>
                  {onDelete && (
                    <button
                      onClick={() => onDelete(doc.id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-zinc-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* 底部 */}
        <div className="px-6 py-4 border-t border-zinc-100 bg-zinc-50/50 flex justify-end">
          <Button onClick={() => onOpenChange(false)}>
            完成
          </Button>
        </div>
      </div>
    </div>
  );
}

export default DocumentsModal;

