'use client';

import React from 'react';
import { Presentation, Sparkles, Eye, CheckCircle, Play, Loader2, RefreshCw } from 'lucide-react';
import { BaseNode, type NodeStatus } from '../BaseNode';

interface PPTNodeProps {
  status: NodeStatus;
  hasSlidev?: boolean;
  slideCount?: number;
  progress?: number;
  onGenerate?: () => void;
  onPreview?: () => void;
  onCreateCourse?: () => void;
  onClick?: () => void;
  dimensions?: { width: number; height: number };
}

export function PPTNode({
  status,
  hasSlidev = false,
  slideCount = 0,
  progress,
  onGenerate,
  onPreview,
  onCreateCourse,
  onClick,
  dimensions = { width: 280, height: 220 },
}: PPTNodeProps) {
  return (
    <BaseNode
      title="PPT生成"
      status={status}
      icon={Presentation}
      dimensions={dimensions}
      onClick={onClick}
      progress={status === 'processing' ? progress : undefined}
    >
      {hasSlidev ? (
        <div className="space-y-2">
          {/* PPT状态 */}
          <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-500" />
                <span className="text-xs text-emerald-700 font-medium">PPT已生成</span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onGenerate?.(); }}
                className="p-1 rounded hover:bg-emerald-100 text-emerald-600"
                title="重新生成"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          
          {/* 按钮组 */}
          <div className="space-y-1.5">
            <button
              onClick={(e) => { e.stopPropagation(); onPreview?.(); }}
              className="w-full text-xs px-3 py-2 rounded-lg bg-zinc-100 text-zinc-700 font-medium hover:bg-zinc-200 flex items-center justify-center gap-2"
            >
              <Eye className="w-3.5 h-3.5" />
              预览PPT
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onCreateCourse?.(); }}
              className="w-full text-xs px-3 py-2 rounded-lg bg-zinc-900 text-white font-medium hover:bg-zinc-800 flex items-center justify-center gap-2"
            >
              <Play className="w-3.5 h-3.5" />
              生成课程
            </button>
          </div>
        </div>
      ) : status === 'processing' ? (
        <div className="flex flex-col items-center justify-center h-full gap-3">
          <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
          </div>
          <div className="text-center">
            <div className="text-xs font-medium text-amber-700">生成中...</div>
            <div className="text-[10px] text-zinc-400 mt-0.5">正在渲染 Slidev</div>
          </div>
        </div>
      ) : status === 'ready' ? (
        <div className="flex flex-col items-center justify-center h-full gap-3">
          <div className="w-12 h-12 rounded-xl bg-zinc-100 flex items-center justify-center">
            <Presentation className="w-5 h-5 text-zinc-500" />
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onGenerate?.(); }}
            className="text-xs px-4 py-2 rounded-lg bg-zinc-900 text-white font-medium hover:bg-zinc-800 flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            生成PPT
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-2">
          <div className="w-12 h-12 rounded-xl bg-zinc-100 flex items-center justify-center">
            <Presentation className="w-5 h-5 text-zinc-400" />
          </div>
          <div className="text-xs text-zinc-400 text-center">
            等待选择手稿
          </div>
        </div>
      )}
    </BaseNode>
  );
}

export default PPTNode;
