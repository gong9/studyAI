'use client';

import React from 'react';
import { motion } from 'framer-motion';
import type { NodeStatus } from './BaseNode';

export interface NodePosition {
  x: number;
  y: number;
}

export interface NodeDimensions {
  width: number;
  height: number;
}

export interface ConnectionLineProps {
  from: NodePosition;
  to: NodePosition;
  fromDimensions: NodeDimensions;
  toDimensions: NodeDimensions;
  fromStatus: NodeStatus;
  toStatus: NodeStatus;
  isDashed?: boolean; // 虚线（用于可选路径）
  label?: string; // 连接线标签
}

export function ConnectionLine({
  from,
  to,
  fromDimensions,
  toDimensions,
  fromStatus,
  toStatus,
  isDashed = false,
  label,
}: ConnectionLineProps) {
  // 计算连接点
  const startX = from.x + fromDimensions.width;
  const startY = from.y + fromDimensions.height / 2;
  const endX = to.x;
  const endY = to.y + toDimensions.height / 2;

  // 贝塞尔曲线控制点
  const midX = (startX + endX) / 2;
  const path = `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;

  // 根据状态确定颜色
  const isActive = fromStatus === 'completed' || fromStatus === 'processing';
  const isCompleted = fromStatus === 'completed' && toStatus !== 'pending';

  // 线条颜色
  const strokeColor = isCompleted
    ? '#10b981' // emerald-500
    : isActive
    ? '#f59e0b' // amber-500
    : '#d4d4d8'; // zinc-300

  return (
    <g>
      {/* 发光效果（激活时） */}
      {isActive && !isDashed && (
        <motion.path
          d={path}
          fill="none"
          stroke={strokeColor}
          strokeWidth={6}
          strokeOpacity={0.15}
          filter="url(#glow)"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.5 }}
        />
      )}

      {/* 主线条 */}
      <motion.path
        d={path}
        fill="none"
        stroke={strokeColor}
        strokeWidth={2}
        strokeDasharray={isDashed ? '6 6' : isActive ? 'none' : '4 4'}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.5 }}
      />

      {/* 流动动画（处理中） */}
      {fromStatus === 'processing' && !isDashed && (
        <motion.circle
          r={4}
          fill={strokeColor}
          initial={{ offsetDistance: '0%' }}
          animate={{ offsetDistance: '100%' }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: 'linear',
          }}
          style={{
            offsetPath: `path("${path}")`,
          }}
        />
      )}

      {/* 连接线标签 */}
      {label && (
        <text
          x={midX}
          y={(startY + endY) / 2 - 8}
          textAnchor="middle"
          className="text-[10px] fill-zinc-400 font-medium"
        >
          {label}
        </text>
      )}

      {/* 箭头 */}
      <motion.polygon
        points={`${endX - 8},${endY - 4} ${endX},${endY} ${endX - 8},${endY + 4}`}
        fill={strokeColor}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      />
    </g>
  );
}

// SVG 滤镜定义（需要在 SVG 中使用）
export function ConnectionLineDefs() {
  return (
    <defs>
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="3" result="coloredBlur" />
        <feMerge>
          <feMergeNode in="coloredBlur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}

export default ConnectionLine;

