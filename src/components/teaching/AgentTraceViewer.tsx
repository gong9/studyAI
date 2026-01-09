'use client';

import React, { useState, useEffect } from 'react';
import { 
  Brain, Clock, CheckCircle, XCircle, Loader2, 
  ChevronDown, ChevronRight, Sparkles, Wrench, Bot,
  MessageSquare, AlertTriangle, Users, X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { 
  getTraceTimeline, 
  type TraceTimeline 
} from '@/lib/teaching/python-agent-client';

interface AgentTraceViewerProps {
  traceId: string;
  onClose?: () => void;
}

// 步骤类型图标映射
const STEP_ICONS: Record<string, React.ReactNode> = {
  start: <Sparkles className="w-4 h-4 text-emerald-500" />,
  end: <CheckCircle className="w-4 h-4 text-emerald-500" />,
  planning: <Brain className="w-4 h-4 text-purple-500" />,
  reasoning: <MessageSquare className="w-4 h-4 text-blue-500" />,
  tool_call: <Wrench className="w-4 h-4 text-amber-500" />,
  subagent: <Bot className="w-4 h-4 text-cyan-500" />,
  decision: <CheckCircle className="w-4 h-4 text-green-500" />,
  output: <Sparkles className="w-4 h-4 text-indigo-500" />,
  error: <XCircle className="w-4 h-4 text-red-500" />,
  hitl: <Users className="w-4 h-4 text-orange-500" />,
};

// 步骤类型中文名称
const STEP_NAMES: Record<string, string> = {
  start: '开始执行',
  end: '执行完成',
  planning: '任务规划',
  reasoning: '思考推理',
  tool_call: '工具调用',
  subagent: '子 Agent',
  decision: '决策点',
  output: '输出结果',
  error: '错误',
  hitl: '人工审核',
};

export function AgentTraceViewer({ traceId, onClose }: AgentTraceViewerProps) {
  const [loading, setLoading] = useState(true);
  const [timeline, setTimeline] = useState<TraceTimeline[]>([]);
  const [traceName, setTraceName] = useState('');
  const [traceStatus, setTraceStatus] = useState('');
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

  useEffect(() => {
    loadTimeline();
  }, [traceId]);

  const loadTimeline = async () => {
    setLoading(true);
    try {
      const data = await getTraceTimeline(traceId);
      if (data) {
        setTimeline(data.timeline);
        setTraceName(data.name);
        setTraceStatus(data.status);
      }
    } catch (error) {
      console.error('Failed to load trace timeline:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleStep = (index: number) => {
    const newExpanded = new Set(expandedSteps);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedSteps(newExpanded);
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('zh-CN', { hour12: false });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        <span className="ml-2 text-slate-500">加载执行追踪...</span>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden">
      {/* 头部 */}
      <div className="px-4 py-3 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
            <Brain className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Agent 执行追踪</h3>
            <p className="text-xs text-slate-500">{traceName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn(
            "px-2 py-0.5 rounded-full text-xs font-medium",
            traceStatus === 'completed' ? "bg-emerald-100 text-emerald-700" :
            traceStatus === 'failed' ? "bg-red-100 text-red-700" :
            "bg-amber-100 text-amber-700"
          )}>
            {traceStatus === 'completed' ? '已完成' : 
             traceStatus === 'failed' ? '失败' : '运行中'}
          </span>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0">
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* 时间线 */}
      <div className="max-h-[400px] overflow-y-auto p-4">
        <div className="relative">
          {/* 竖线 */}
          <div className="absolute left-[19px] top-6 bottom-6 w-0.5 bg-slate-200" />

          <div className="space-y-3">
            {timeline.map((step, index) => {
              const isExpanded = expandedSteps.has(index);
              const hasDetails = step.reasoning || step.decision || step.error;
              
              return (
                <div 
                  key={index}
                  className={cn(
                    "relative flex items-start gap-3 p-2 rounded-lg transition-colors",
                    hasDetails && "cursor-pointer hover:bg-slate-50",
                    step.type === 'error' && "bg-red-50"
                  )}
                  onClick={() => hasDetails && toggleStep(index)}
                >
                  {/* 图标 */}
                  <div className={cn(
                    "relative z-10 w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
                    step.type === 'start' ? "bg-emerald-100" :
                    step.type === 'end' ? "bg-emerald-100" :
                    step.type === 'error' ? "bg-red-100" :
                    "bg-slate-100"
                  )}>
                    {STEP_ICONS[step.type] || <Sparkles className="w-4 h-4 text-slate-400" />}
                  </div>

                  {/* 内容 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-800">
                        {step.name || step.message || STEP_NAMES[step.type] || step.type}
                      </span>
                      {step.duration_ms && (
                        <span className="text-xs text-slate-400 flex items-center gap-0.5">
                          <Clock className="w-3 h-3" />
                          {step.duration_ms}ms
                        </span>
                      )}
                      {hasDetails && (
                        isExpanded ? 
                          <ChevronDown className="w-4 h-4 text-slate-400" /> : 
                          <ChevronRight className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                    
                    <span className="text-xs text-slate-400">
                      {formatTime(step.time)}
                    </span>

                    {/* 展开的详情 */}
                    {isExpanded && hasDetails && (
                      <div className="mt-2 space-y-2">
                        {step.reasoning && (
                          <div className="p-2 bg-blue-50 rounded-md border border-blue-100">
                            <div className="flex items-center gap-1 text-xs text-blue-600 font-medium mb-1">
                              <MessageSquare className="w-3 h-3" />
                              思考过程
                            </div>
                            <p className="text-xs text-blue-800">{step.reasoning}</p>
                          </div>
                        )}
                        {step.decision && (
                          <div className="p-2 bg-green-50 rounded-md border border-green-100">
                            <div className="flex items-center gap-1 text-xs text-green-600 font-medium mb-1">
                              <CheckCircle className="w-3 h-3" />
                              决策
                            </div>
                            <p className="text-xs text-green-800">{step.decision}</p>
                          </div>
                        )}
                        {step.error && (
                          <div className="p-2 bg-red-50 rounded-md border border-red-100">
                            <div className="flex items-center gap-1 text-xs text-red-600 font-medium mb-1">
                              <AlertTriangle className="w-3 h-3" />
                              错误
                            </div>
                            <p className="text-xs text-red-800">{step.error}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 底部统计 */}
      <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
        <span>共 {timeline.length} 个步骤</span>
        <span>Trace ID: {traceId.slice(0, 8)}...</span>
      </div>
    </div>
  );
}

export default AgentTraceViewer;

