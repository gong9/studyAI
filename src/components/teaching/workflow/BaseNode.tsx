'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// 节点状态类型
export type NodeStatus = 'pending' | 'ready' | 'processing' | 'completed';

// 节点尺寸配置
export interface NodeDimensions {
  width: number;
  height: number;
}

// 基础节点属性
export interface BaseNodeProps {
  title: string;
  status: NodeStatus;
  icon: React.ElementType;
  children: React.ReactNode;
  progress?: number;
  dimensions?: NodeDimensions;
  onClick?: () => void;
  className?: string;
}

// 状态对应的边框颜色
const STATUS_BORDER_COLORS: Record<NodeStatus, string> = {
  pending: 'border-zinc-300',
  ready: 'border-zinc-900',
  processing: 'border-amber-500',
  completed: 'border-emerald-500',
};

// 状态对应的阴影效果
const STATUS_GLOW_COLORS: Record<NodeStatus, string> = {
  pending: '',
  ready: 'shadow-lg shadow-zinc-200',
  processing: 'shadow-xl shadow-amber-500/20',
  completed: 'shadow-lg shadow-emerald-500/10',
};

// 状态对应的图标背景
const STATUS_ICON_BG: Record<NodeStatus, string> = {
  pending: 'bg-zinc-100 text-zinc-400',
  ready: 'bg-zinc-900 text-white',
  processing: 'bg-amber-500/20 text-amber-600',
  completed: 'bg-emerald-500/20 text-emerald-600',
};

// 状态标签
const STATUS_LABELS: Record<NodeStatus, { text: string; className: string } | null> = {
  pending: null,
  ready: { text: '待操作', className: 'bg-zinc-100 text-zinc-600' },
  processing: { text: '处理中', className: 'bg-amber-500/20 text-amber-600' },
  completed: { text: '已完成', className: 'bg-emerald-500/20 text-emerald-600' },
};

export function BaseNode({
  title,
  status,
  icon: Icon,
  children,
  progress,
  dimensions = { width: 280, height: 200 },
  onClick,
  className,
}: BaseNodeProps) {
  const borderColor = STATUS_BORDER_COLORS[status];
  const glowColor = STATUS_GLOW_COLORS[status];
  const iconBg = STATUS_ICON_BG[status];
  const statusLabel = STATUS_LABELS[status];

  return (
    <div
      style={{ width: dimensions.width, height: dimensions.height }}
      className={className}
    >
      <div
        className={cn(
          'rounded-2xl border-2 bg-white backdrop-blur-xl h-full flex flex-col',
          'transition-all duration-300 cursor-pointer',
          'hover:shadow-xl hover:scale-[1.02]',
          borderColor,
          glowColor
        )}
        onClick={onClick}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center transition-colors', iconBg)}>
              <Icon className="w-4 h-4" />
            </div>
            <span className="text-sm font-bold text-zinc-800 tracking-tight">{title}</span>
          </div>

          {/* 状态标签 */}
          {status === 'processing' ? (
            <motion.span
              className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600 font-bold flex items-center gap-1"
              animate={{ opacity: [1, 0.6, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
            >
              <Loader2 className="w-3 h-3 animate-spin" />
              处理中
            </motion.span>
          ) : statusLabel ? (
            <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-bold', statusLabel.className)}>
              {statusLabel.text}
            </span>
          ) : null}
        </div>

        {/* 进度条 */}
        {status === 'processing' && progress !== undefined && (
          <div className="mx-4 mt-3 flex-shrink-0">
            <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-amber-500 to-orange-500"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
            <p className="text-[10px] text-amber-600 mt-1 text-right font-medium">{progress}%</p>
          </div>
        )}

        {/* 内容区 */}
        <div className="p-4 flex-1 overflow-hidden" data-scrollable>
          {children}
        </div>
      </div>
    </div>
  );
}

export default BaseNode;

