'use client';

/**
 * 全书理解面板
 * 
 * 新流程：
 * 1. 点击"智能扫描" → 执行阶段1（粗读建结构）
 * 2. 显示章节列表 + 知识图谱
 * 3. 用户选择章节 → 点击"深度分析" → 执行阶段2-4
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import BookKnowledgeGraph from './BookKnowledgeGraph';
import { 
  Sparkles, 
  Loader2, 
  Network, 
  CheckCircle2,
  AlertCircle,
  BookOpen,
  Zap,
  RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ==================== 类型定义 ====================

interface BookUnderstandingPanelProps {
  knowledgeBaseId: string;
  /** 阶段1完成回调（刷新章节列表） */
  onSkimComplete?: (result: SkimResult) => void;
  /** 阶段2-4完成回调 */
  onAnalyzeComplete?: (result: any) => void;
  className?: string;
}

interface SkimResult {
  thesis: {
    title: string;
    topic: string;
    knowledgeType: string;
  };
  chapters: ChapterMeta[];
  chapterDAG: {
    nodes: any[];
    edges: any[];
  };
  totalPages: number;
}

interface ChapterMeta {
  id: string;
  title: string;
  role: string;
  goal: string;
  keyConcepts: string[];
  startPage?: number;
  endPage?: number;
}

type PanelState = 'idle' | 'skimming' | 'skimmed' | 'analyzing' | 'completed' | 'error';

// ==================== 组件 ====================

export function BookUnderstandingPanel({ 
  knowledgeBaseId, 
  onSkimComplete,
  onAnalyzeComplete,
  className 
}: BookUnderstandingPanelProps) {
  const [state, setState] = useState<PanelState>('idle');
  const [error, setError] = useState<string>('');
  const [skimResult, setSkimResult] = useState<SkimResult | null>(null);
  const [analyzeResult, setAnalyzeResult] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'chapters' | 'concepts' | 'all'>('chapters');

  // 执行阶段1：粗读建结构
  const startSkim = useCallback(async () => {
    setState('skimming');
    setError('');
    setSkimResult(null);

    try {
      const response = await fetch('/api/book-understanding/skim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ knowledgeBaseId }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || '粗读分析失败');
      }

      setSkimResult(data);
      setState('skimmed');
      onSkimComplete?.(data);

    } catch (err: any) {
      console.error('[BookUnderstanding] Skim error:', err);
      setError(err.message || '粗读分析失败');
      setState('error');
    }
  }, [knowledgeBaseId, onSkimComplete]);

  // 执行阶段2-4：深度分析（需要选中章节ID）
  const startAnalyze = useCallback(async (chapterIds: string[]) => {
    if (chapterIds.length === 0) {
      setError('请先选择要分析的章节');
      return;
    }

    setState('analyzing');
    setError('');

    try {
      const response = await fetch('/api/book-understanding/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ knowledgeBaseId, chapterIds }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || '深度分析失败');
      }

      setAnalyzeResult(data);
      setState('completed');
      onAnalyzeComplete?.(data);

    } catch (err: any) {
      console.error('[BookUnderstanding] Analyze error:', err);
      setError(err.message || '深度分析失败');
      setState('error');
    }
  }, [knowledgeBaseId, onAnalyzeComplete]);

  // 重置状态
  const reset = useCallback(() => {
    setState('idle');
    setError('');
    setSkimResult(null);
    setAnalyzeResult(null);
  }, []);

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              全书理解
            </CardTitle>
            <CardDescription className="mt-1">
              四阶段智能分析：粗读建结构 → 知识图谱 → 精读填充 → 输出呈现
            </CardDescription>
          </div>
          
          {/* 操作按钮 */}
          <div className="flex gap-2">
            {state === 'idle' && (
              <Button 
                onClick={startSkim}
                className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
              >
                <BookOpen className="w-4 h-4 mr-2" />
                智能扫描
              </Button>
            )}
            
            {state === 'skimming' && (
              <Button disabled variant="outline">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                扫描中...
              </Button>
            )}

            {state === 'analyzing' && (
              <Button disabled variant="outline">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                分析中...
              </Button>
            )}

            {(state === 'skimmed' || state === 'completed' || state === 'error') && (
              <Button variant="outline" size="sm" onClick={reset}>
                <RefreshCw className="w-4 h-4 mr-2" />
                重新扫描
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* 状态提示 */}
        {state === 'skimming' && (
          <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-lg border border-amber-200">
            <Loader2 className="w-5 h-5 text-amber-600 animate-spin" />
            <div>
              <div className="font-medium text-amber-800">正在分析全书结构...</div>
              <div className="text-sm text-amber-600">按页解析文档，识别章节边界，分类章节角色</div>
            </div>
          </div>
        )}

        {state === 'analyzing' && (
          <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
            <div>
              <div className="font-medium text-blue-800">正在深度分析选中章节...</div>
              <div className="text-sm text-blue-600">构建知识图谱，精读填充概念，生成讲稿</div>
            </div>
          </div>
        )}

        {state === 'error' && (
          <div className="flex items-center gap-3 p-4 bg-red-50 rounded-lg border border-red-200">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <div>
              <div className="font-medium text-red-800">处理失败</div>
              <div className="text-sm text-red-600">{error}</div>
            </div>
          </div>
        )}

        {/* 阶段1完成：显示结果 */}
        {(state === 'skimmed' || state === 'completed') && skimResult && (
          <div className="space-y-4">
            {/* 全书信息 */}
            <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg border border-green-200">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <div className="flex-1">
                <div className="font-medium text-green-800">{skimResult.thesis.title}</div>
                <div className="text-sm text-green-600">
                  {skimResult.totalPages} 页 · {skimResult.chapters.length} 个章节 · 
                  {skimResult.thesis.knowledgeType === 'concept' ? '概念型' : 
                   skimResult.thesis.knowledgeType === 'skill' ? '技能型' : 
                   skimResult.thesis.knowledgeType === 'reference' ? '参考型' : '叙事型'}
                </div>
              </div>
            </div>

            {/* 视图切换 */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">查看：</span>
              <div className="flex gap-1">
                <Button 
                  variant={viewMode === 'chapters' ? 'secondary' : 'ghost'} 
                  size="sm"
                  onClick={() => setViewMode('chapters')}
                >
                  章节关系
                </Button>
                {analyzeResult && (
                  <>
                    <Button 
                      variant={viewMode === 'concepts' ? 'secondary' : 'ghost'} 
                      size="sm"
                      onClick={() => setViewMode('concepts')}
                    >
                      概念图谱
                    </Button>
                    <Button 
                      variant={viewMode === 'all' ? 'secondary' : 'ghost'} 
                      size="sm"
                      onClick={() => setViewMode('all')}
                    >
                      全部
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* 知识图谱 */}
            <BookKnowledgeGraph
              chapterDAG={skimResult.chapterDAG}
              conceptGraph={analyzeResult?.kgResult ? {
                concepts: analyzeResult.kgResult.concepts,
                relations: analyzeResult.kgResult.relations,
              } : undefined}
              viewMode={viewMode}
              height={350}
            />

            {/* 提示：选择章节进行深度分析 */}
            {state === 'skimmed' && (
              <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <Zap className="w-5 h-5 text-blue-600" />
                <div className="flex-1">
                  <div className="text-sm text-blue-800">
                    章节已保存到左侧列表。选择章节后点击"生成讲稿"进行深度分析。
                  </div>
                </div>
              </div>
            )}

            {/* 阶段4完成：讲稿信息 */}
            {state === 'completed' && analyzeResult?.outputResult?.manuscript && (
              <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg border border-purple-200">
                <CheckCircle2 className="w-5 h-5 text-purple-600" />
                <div className="flex-1">
                  <div className="font-medium text-purple-800">
                    {analyzeResult.outputResult.manuscript.title}
                  </div>
                  <div className="text-sm text-purple-600">
                    {analyzeResult.outputResult.manuscript.sections?.length} 个段落 · 
                    约 {analyzeResult.outputResult.manuscript.totalDuration} 分钟
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 初始状态 */}
        {state === 'idle' && (
          <div className="text-center py-8 text-zinc-500">
            <Network className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>点击"智能扫描"开始全书理解</p>
            <p className="text-sm mt-1">将识别章节结构并保存到左侧列表</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default BookUnderstandingPanel;
