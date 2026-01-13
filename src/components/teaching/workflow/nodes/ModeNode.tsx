'use client';

import React from 'react';
import { BookOpen, Files, FileStack, FileText } from 'lucide-react';
import { BaseNode, type NodeStatus } from '../BaseNode';
import { cn } from '@/lib/utils';

export type SourceMode = 'book' | 'docs' | 'fragments' | 'paper';

const MODE_CONFIG: Record<SourceMode, { icon: React.ElementType; name: string; desc: string }> = {
  book: { icon: BookOpen, name: '书籍', desc: '上传一本书' },
  docs: { icon: Files, name: '多文档', desc: '上传多个文档' },
  fragments: { icon: FileStack, name: '碎片资料', desc: '上传/粘贴资料' },
  paper: { icon: FileText, name: '论文', desc: '上传学术论文' },
};

interface ModeNodeProps {
  sourceMode: SourceMode;
  dimensions?: { width: number; height: number };
}

export function ModeNode({ sourceMode, dimensions = { width: 200, height: 160 } }: ModeNodeProps) {
  const config = MODE_CONFIG[sourceMode];
  const ModeIcon = config.icon;

  return (
    <BaseNode
      title="模式选择"
      status="completed"
      icon={ModeIcon}
      dimensions={dimensions}
    >
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <div className="w-12 h-12 rounded-xl bg-zinc-100 flex items-center justify-center">
          <ModeIcon className="w-6 h-6 text-zinc-700" />
        </div>
        <div className="text-center">
          <div className="text-sm font-bold text-zinc-800">{config.name}</div>
          <div className="text-[11px] text-zinc-500 mt-0.5">{config.desc}</div>
        </div>
      </div>
    </BaseNode>
  );
}

export default ModeNode;

