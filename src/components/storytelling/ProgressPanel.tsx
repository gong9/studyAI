'use client';

import React from 'react';
import { 
  CheckCircle2, Loader2, AlertCircle, BookOpen, 
  Brain, List, Mic2
} from 'lucide-react';

export interface Status {
  status: string;
  phase: string;
  total_chapters: number;
  processed_chapters: number;
  total_episodes: number;
  ready_episodes: number;
  current_episode: number;
  message: string;
}

interface ProgressPanelProps {
  status: Status;
  className?: string;
}

const phases = [
  { id: 'story_extraction', label: '故事提取', icon: BookOpen, desc: '分析各章节故事元素' },
  { id: 'synthesizing', label: '全书综合', icon: Brain, desc: '形成全书视角' },
  { id: 'planning', label: '分集规划', icon: List, desc: '规划回目和悬念' },
  { id: 'generating', label: '讲稿生成', icon: Mic2, desc: '生成评书讲稿' },
];

export function ProgressPanel({ status, className = '' }: ProgressPanelProps) {
  const currentPhaseIndex = phases.findIndex(p => p.id === status.phase);
  const isCompleted = status.status === 'completed' || status.phase === 'done';
  const isError = status.status === 'error';

  // 计算总体进度
  const progressPercent = status.total_episodes 
    ? Math.round((status.ready_episodes / status.total_episodes) * 100) 
    : 0;

  return (
    <div className={`bg-white/70 backdrop-blur border border-amber-100/50 rounded-2xl overflow-hidden ${className}`}>
      {/* 头部 */}
      <div className="p-6 border-b border-amber-100/50">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {isCompleted ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-500" />
            ) : isError ? (
              <AlertCircle className="w-6 h-6 text-red-500" />
            ) : (
              <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
            )}
            <div>
              <h3 className="font-bold text-zinc-900">
                {isCompleted ? '全部完成' : isError ? '处理出错' : '正在处理中'}
              </h3>
              <p className="text-sm text-zinc-400">{status.message}</p>
            </div>
          </div>
          
          <div className="text-right">
            <div className="text-2xl font-bold text-amber-600">{progressPercent}%</div>
            <div className="text-xs text-zinc-400">
              {status.ready_episodes} / {status.total_episodes} 回
            </div>
          </div>
        </div>

        {/* 总进度条 */}
        <div className="h-2 bg-amber-100 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* 阶段列表 */}
      <div className="p-6">
        <div className="space-y-4">
          {phases.map((phase, index) => {
            const isActive = phase.id === status.phase;
            const isDone = currentPhaseIndex > index || isCompleted;
            const isPending = currentPhaseIndex < index && !isCompleted;

            return (
              <div 
                key={phase.id}
                className={`flex items-center gap-4 p-4 rounded-xl transition-all ${
                  isActive 
                    ? 'bg-amber-50 border border-amber-200' 
                    : isDone 
                      ? 'bg-emerald-50/50' 
                      : 'bg-zinc-50/50'
                }`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  isActive 
                    ? 'bg-amber-500 text-white' 
                    : isDone 
                      ? 'bg-emerald-500 text-white' 
                      : 'bg-zinc-200 text-zinc-400'
                }`}>
                  {isDone && !isActive ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : isActive ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <phase.icon className="w-5 h-5" />
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <h4 className={`font-bold ${
                    isActive ? 'text-amber-700' : isDone ? 'text-emerald-700' : 'text-zinc-400'
                  }`}>
                    {phase.label}
                  </h4>
                  <p className={`text-xs ${
                    isActive ? 'text-amber-500' : isDone ? 'text-emerald-500' : 'text-zinc-300'
                  }`}>
                    {phase.desc}
                  </p>
                </div>

                {/* 阶段进度 */}
                {phase.id === 'story_extraction' && status.total_chapters > 0 && (
                  <div className="text-right">
                    <span className={`text-sm font-bold ${isActive ? 'text-amber-600' : 'text-zinc-400'}`}>
                      {status.processed_chapters}/{status.total_chapters}
                    </span>
                    <p className="text-xs text-zinc-300">章节</p>
                  </div>
                )}
                
                {phase.id === 'generating' && status.total_episodes > 0 && (
                  <div className="text-right">
                    <span className={`text-sm font-bold ${isActive ? 'text-amber-600' : 'text-zinc-400'}`}>
                      {status.ready_episodes}/{status.total_episodes}
                    </span>
                    <p className="text-xs text-zinc-300">回目</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default ProgressPanel;

