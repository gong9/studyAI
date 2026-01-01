'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { 
  BookOpen, 
  Network, 
  Search, 
  FileText, 
  CheckCircle,
  Loader2,
  Circle
} from 'lucide-react';

/** 处理阶段 */
export type ProcessingStage = 
  | 'pending'
  | 'stage1_skim'
  | 'stage2_kg'
  | 'stage3_deepread'
  | 'stage4_output'
  | 'completed'
  | 'failed';

interface ProgressData {
  status: ProcessingStage;
  message: string;
  percent: number;
  data?: {
    thesis?: string;
    chapterCount?: number;
    conceptCount?: number;
    relationCount?: number;
    enrichedCount?: number;
    sectionCount?: number;
  };
}

interface BookUnderstandingProgressProps {
  progress: ProgressData;
  className?: string;
}

/** 阶段配置 */
const STAGES = [
  {
    id: 'stage1_skim',
    title: '粗读建结构',
    description: '分析全书主题、章节角色、依赖关系',
    icon: BookOpen,
    color: 'blue',
  },
  {
    id: 'stage2_kg',
    title: '知识图谱',
    description: '抽取概念、构建关系、计算权重',
    icon: Network,
    color: 'purple',
  },
  {
    id: 'stage3_deepread',
    title: '精读填充',
    description: 'RAG 检索原文、填充概念详情',
    icon: Search,
    color: 'green',
  },
  {
    id: 'stage4_output',
    title: '输出呈现',
    description: '生成讲稿、课程地图',
    icon: FileText,
    color: 'orange',
  },
];

/** 获取阶段索引 */
function getStageIndex(status: ProcessingStage): number {
  switch (status) {
    case 'pending': return -1;
    case 'stage1_skim': return 0;
    case 'stage2_kg': return 1;
    case 'stage3_deepread': return 2;
    case 'stage4_output': return 3;
    case 'completed': return 4;
    case 'failed': return -2;
    default: return -1;
  }
}

export function BookUnderstandingProgress({ progress, className }: BookUnderstandingProgressProps) {
  const currentStageIndex = getStageIndex(progress.status);
  const isFailed = progress.status === 'failed';
  const isCompleted = progress.status === 'completed';

  return (
    <div className={cn("space-y-6", className)}>
      {/* 总进度条 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-zinc-700">
            {isCompleted ? '处理完成' : isFailed ? '处理失败' : '全书理解处理中...'}
          </span>
          <span className="text-zinc-500">{progress.percent}%</span>
        </div>
        <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
          <div 
            className={cn(
              "h-full transition-all duration-500 ease-out rounded-full",
              isFailed ? "bg-red-500" : isCompleted ? "bg-green-500" : "bg-blue-500"
            )}
            style={{ width: `${progress.percent}%` }}
          />
        </div>
        <p className="text-sm text-zinc-500">{progress.message}</p>
      </div>

      {/* 阶段步骤 */}
      <div className="relative">
        {/* 连接线 */}
        <div className="absolute left-6 top-10 bottom-10 w-0.5 bg-zinc-200" />
        
        <div className="space-y-4">
          {STAGES.map((stage, index) => {
            const Icon = stage.icon;
            const isActive = currentStageIndex === index;
            const isCompleted = currentStageIndex > index || progress.status === 'completed';
            const isPending = currentStageIndex < index && !isFailed;

            return (
              <div key={stage.id} className="relative flex items-start gap-4">
                {/* 图标 */}
                <div className={cn(
                  "relative z-10 flex items-center justify-center w-12 h-12 rounded-xl transition-all",
                  isCompleted ? "bg-green-100" : 
                  isActive ? "bg-blue-100 ring-2 ring-blue-500 ring-offset-2" : 
                  "bg-zinc-100"
                )}>
                  {isCompleted ? (
                    <CheckCircle className="w-6 h-6 text-green-600" />
                  ) : isActive ? (
                    <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                  ) : (
                    <Icon className={cn(
                      "w-6 h-6",
                      isPending ? "text-zinc-400" : "text-zinc-600"
                    )} />
                  )}
                </div>

                {/* 内容 */}
                <div className="flex-1 min-w-0 pt-1">
                  <div className="flex items-center gap-2">
                    <h4 className={cn(
                      "font-medium",
                      isActive ? "text-blue-700" : 
                      isCompleted ? "text-green-700" : 
                      "text-zinc-600"
                    )}>
                      {stage.title}
                    </h4>
                    {isActive && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
                        进行中
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-zinc-500 mt-0.5">{stage.description}</p>
                  
                  {/* 阶段数据 */}
                  {isCompleted && progress.data && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {stage.id === 'stage1_skim' && progress.data.chapterCount && (
                        <span className="inline-flex items-center px-2 py-1 text-xs bg-green-50 text-green-700 rounded">
                          {progress.data.chapterCount} 个章节
                        </span>
                      )}
                      {stage.id === 'stage2_kg' && (
                        <>
                          {progress.data.conceptCount && (
                            <span className="inline-flex items-center px-2 py-1 text-xs bg-purple-50 text-purple-700 rounded">
                              {progress.data.conceptCount} 个概念
                            </span>
                          )}
                          {progress.data.relationCount && (
                            <span className="inline-flex items-center px-2 py-1 text-xs bg-purple-50 text-purple-700 rounded">
                              {progress.data.relationCount} 个关系
                            </span>
                          )}
                        </>
                      )}
                      {stage.id === 'stage3_deepread' && progress.data.enrichedCount && (
                        <span className="inline-flex items-center px-2 py-1 text-xs bg-green-50 text-green-700 rounded">
                          {progress.data.enrichedCount} 个概念已填充
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 完成状态 */}
      {isCompleted && (
        <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <span className="font-medium text-green-800">全书理解完成！</span>
          </div>
          <p className="mt-1 text-sm text-green-700">
            已生成讲稿和课程地图，可以进行预览和编辑。
          </p>
        </div>
      )}

      {/* 失败状态 */}
      {isFailed && (
        <div className="mt-4 p-4 bg-red-50 rounded-lg border border-red-200">
          <div className="flex items-center gap-2">
            <Circle className="w-5 h-5 text-red-600" />
            <span className="font-medium text-red-800">处理失败</span>
          </div>
          <p className="mt-1 text-sm text-red-700">
            {progress.message || '处理过程中发生错误，请重试。'}
          </p>
        </div>
      )}
    </div>
  );
}

