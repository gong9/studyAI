'use client';

import React from 'react';
import { Upload, FileText, Plus, ClipboardPaste, CheckCircle } from 'lucide-react';
import { BaseNode, type NodeStatus } from '../BaseNode';
import { cn } from '@/lib/utils';

interface Document {
  id: string;
  name: string;
  status: string;
}

interface InputNodeProps {
  status: NodeStatus;
  documents: Document[];
  sourceMode: string;
  onUpload?: () => void;
  onPaste?: () => void;
  onClick?: () => void;
  dimensions?: { width: number; height: number };
}

export function InputNode({
  status,
  documents,
  sourceMode,
  onUpload,
  onPaste,
  onClick,
  dimensions = { width: 280, height: 200 },
}: InputNodeProps) {
  const hasDocuments = documents.length > 0;
  const completedDocs = documents.filter(d => d.status === 'completed').length;

  return (
    <BaseNode
      title="文档输入"
      status={status}
      icon={Upload}
      dimensions={dimensions}
      onClick={onClick}
    >
      {hasDocuments ? (
        <div className="space-y-2">
          {/* 文档统计 */}
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-50 border border-zinc-100">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-zinc-500" />
              <span className="text-sm font-medium text-zinc-700">
                {documents.length} 个文档
              </span>
            </div>
            {completedDocs === documents.length ? (
              <CheckCircle className="w-4 h-4 text-emerald-500" />
            ) : (
              <span className="text-[10px] text-amber-600 font-medium">
                {completedDocs}/{documents.length} 就绪
              </span>
            )}
          </div>

          {/* 文档列表预览 */}
          <div className="space-y-1 max-h-[80px] overflow-y-auto" data-scrollable>
            {documents.slice(0, 3).map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-2 text-xs text-zinc-600 px-2 py-1.5 rounded bg-white border border-zinc-100"
              >
                <div className={cn(
                  "w-1.5 h-1.5 rounded-full flex-shrink-0",
                  doc.status === 'completed' ? "bg-emerald-500" : "bg-amber-500 animate-pulse"
                )} />
                <span className="truncate">{doc.name}</span>
              </div>
            ))}
            {documents.length > 3 && (
              <div className="text-[10px] text-zinc-400 text-center py-1">
                +{documents.length - 3} 更多
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-3">
          <div className="w-12 h-12 rounded-xl bg-zinc-100 border-2 border-dashed border-zinc-300 flex items-center justify-center">
            <Upload className="w-5 h-5 text-zinc-400" />
          </div>
          <div className="text-xs text-zinc-500 text-center">
            点击上传文档
          </div>
          <div className="flex gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); onUpload?.(); }}
              className="text-[10px] px-2.5 py-1 rounded-full bg-zinc-900 text-white font-medium hover:bg-zinc-800 flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              上传
            </button>
            {sourceMode === 'fragments' && (
              <button
                onClick={(e) => { e.stopPropagation(); onPaste?.(); }}
                className="text-[10px] px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-700 font-medium hover:bg-zinc-200 flex items-center gap-1"
              >
                <ClipboardPaste className="w-3 h-3" />
                粘贴
              </button>
            )}
          </div>
        </div>
      )}
    </BaseNode>
  );
}

export default InputNode;

