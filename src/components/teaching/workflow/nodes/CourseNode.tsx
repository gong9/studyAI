'use client';

import React from 'react';
import { Play, Film, Download, CheckCircle, ChevronRight, RefreshCw } from 'lucide-react';
import { BaseNode, type NodeStatus } from '../BaseNode';

interface Course {
  id: string;
  title: string;
  duration?: number;
}

interface CourseNodeProps {
  status: NodeStatus;
  courses: Course[];
  progress?: number;
  onGenerate?: () => void;
  onPlay?: (courseId: string) => void;
  onExport?: () => void;
  onClick?: () => void;
  dimensions?: { width: number; height: number };
}

export function CourseNode({
  status,
  courses,
  progress,
  onGenerate,
  onPlay,
  onExport,
  onClick,
  dimensions = { width: 280, height: 220 },
}: CourseNodeProps) {
  const hasCourses = courses.length > 0;

  return (
    <BaseNode
      title="课程输出"
      status={status}
      icon={Film}
      dimensions={dimensions}
      onClick={onClick}
      progress={status === 'processing' ? progress : undefined}
    >
      {hasCourses ? (
        <div className="space-y-3">
          {/* 课程列表 */}
          <div className="space-y-1.5 max-h-[100px] overflow-y-auto" data-scrollable>
            {courses.map((course) => (
              <button
                key={course.id}
                onClick={(e) => { e.stopPropagation(); onPlay?.(course.id); }}
                className="w-full flex items-center gap-2 p-2.5 rounded-lg bg-emerald-50 border border-emerald-100 hover:bg-emerald-100 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center flex-shrink-0">
                  <Play className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 text-left min-w-0">
                  <div className="text-xs font-bold text-emerald-800 truncate">{course.title}</div>
                  {course.duration && (
                    <div className="text-[10px] text-emerald-600">
                      {Math.floor(course.duration / 60)} 分钟
                    </div>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              </button>
            ))}
          </div>
          
          {/* 操作按钮 */}
          <div className="flex gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); onGenerate?.(); }}
              className="flex-1 text-xs px-3 py-2 rounded-lg border border-zinc-200 text-zinc-600 font-medium hover:bg-zinc-50 flex items-center justify-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              重新生成
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onExport?.(); }}
              className="flex-1 text-xs px-3 py-2 rounded-lg bg-zinc-100 text-zinc-700 font-medium hover:bg-zinc-200 flex items-center justify-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              导出视频
            </button>
          </div>
        </div>
      ) : status === 'processing' ? (
        <div className="flex flex-col items-center justify-center h-full gap-2">
          <div className="text-sm font-medium text-amber-600">生成中...</div>
          <div className="text-[10px] text-zinc-500">正在合成课程视频</div>
        </div>
      ) : status === 'ready' ? (
        <div className="flex flex-col items-center justify-center h-full gap-3">
          <div className="w-12 h-12 rounded-xl bg-zinc-100 flex items-center justify-center">
            <Film className="w-5 h-5 text-zinc-500" />
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onGenerate?.(); }}
            className="text-[10px] px-3 py-1.5 rounded-full bg-zinc-900 text-white font-medium hover:bg-zinc-800 flex items-center gap-1"
          >
            <Play className="w-3 h-3" />
            生成课程
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-2">
          <div className="w-12 h-12 rounded-xl bg-zinc-100 flex items-center justify-center">
            <Film className="w-5 h-5 text-zinc-400" />
          </div>
          <div className="text-xs text-zinc-400 text-center">
            等待PPT生成
          </div>
        </div>
      )}
    </BaseNode>
  );
}

export default CourseNode;

