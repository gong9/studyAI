'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  ArrowLeft, Save, CheckCircle, Loader2, FileCheck, 
  Eye, Edit3, RefreshCw, AlertCircle, ChevronRight, MessageSquare
} from 'lucide-react';
import { cn } from '@/lib/utils';
import dynamic from 'next/dynamic';
import 'katex/dist/katex.min.css';

// 动态导入 Tiptap 避免 SSR 问题
const TiptapEditor = dynamic(
  () => import('@/components/teaching/TiptapEditor'),
  { 
    ssr: false,
    loading: () => <div className="animate-pulse bg-gray-100 rounded-xl h-96" />
  }
);

// 动态导入 AI 侧边栏
const AISidebar = dynamic(
  () => import('@/components/teaching/AISidebar'),
  { ssr: false }
);

// 状态映射
const STATUS_MAP: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  draft: { label: 'LLM 初稿', color: 'bg-blue-100 text-blue-700', icon: <Edit3 className="h-3 w-3" /> },
  user_editing: { label: '编辑中', color: 'bg-yellow-100 text-yellow-700', icon: <Edit3 className="h-3 w-3" /> },
  confirmed: { label: '已确认', color: 'bg-green-100 text-green-700', icon: <CheckCircle className="h-3 w-3" /> },
  reviewing: { label: '审核中', color: 'bg-purple-100 text-purple-700', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  enriching: { label: '润色中', color: 'bg-indigo-100 text-indigo-700', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  rendering: { label: '渲染中', color: 'bg-pink-100 text-pink-700', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  completed: { label: '已完成', color: 'bg-zinc-100 text-zinc-700', icon: <CheckCircle className="h-3 w-3" /> },
};

// 强制刷新 UI
export default function ManuscriptEditorPage() {
  const params = useParams();
  const router = useRouter();
  const manuscriptId = params.manuscriptId as string;
  const kbId = params.id as string;

  const [manuscript, setManuscript] = useState<any>(null);
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState(''); // 用于对比是否有变化
  const [editorMode, setEditorMode] = useState<'preview' | 'edit'>('preview'); // 默认预览模式
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [error, setError] = useState('');
  const [aiSidebarOpen, setAiSidebarOpen] = useState(false);
  const [selectedText, setSelectedText] = useState('');

  useEffect(() => {
    fetchManuscript();
  }, [manuscriptId]);

  const fetchManuscript = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/teaching/manuscript/${manuscriptId}`);
      if (res.ok) {
        const data = await res.json();
        setManuscript(data);
        // 优先使用确认版，其次初稿
        const initialContent = data.confirmedContent || data.draftContent || '';
        setContent(initialContent);
        setOriginalContent(initialContent);
        setHasChanges(false); // 重置变更状态
      } else {
        const err = await res.json();
        setError(err.error || '获取手稿失败');
      }
    } catch (error: any) {
      setError(error.message || '网络错误');
    } finally {
      setLoading(false);
    }
  };

  const handleContentChange = (value: string) => {
    setContent(value);
    // 只有内容真正变化时才标记为有变更
    setHasChanges(value !== originalContent);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/teaching/manuscript/${manuscriptId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });

      if (res.ok) {
        setHasChanges(false);
        fetchManuscript();
      } else {
        const err = await res.json();
        alert(err.error || '保存失败');
      }
    } catch (error: any) {
      alert(error.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirm = async () => {
    if (hasChanges) {
      alert('请先保存更改');
      return;
    }

    if (!confirm('确认后，手稿将作为最终版本用于后续处理。是否继续？')) {
      return;
    }

    setConfirming(true);
    try {
      const res = await fetch(`/api/teaching/manuscript/${manuscriptId}/confirm`, {
        method: 'POST',
      });

      if (res.ok) {
        fetchManuscript();
      } else {
        const err = await res.json();
        alert(err.error || '确认失败');
      }
    } catch (error: any) {
      alert(error.message || '确认失败');
    } finally {
      setConfirming(false);
    }
  };

  const handleReview = async () => {
    if (manuscript?.status !== 'confirmed') {
      alert('请先确认手稿');
      return;
    }

    setReviewing(true);
    try {
      const res = await fetch(`/api/teaching/manuscript/${manuscriptId}/review`, {
        method: 'POST',
      });

      if (res.ok) {
        fetchManuscript();
      } else {
        const err = await res.json();
        alert(err.error || '审核失败');
      }
    } catch (error: any) {
      alert(error.message || '审核失败');
    } finally {
      setReviewing(false);
    }
  };

  const handleEnrich = async () => {
    if (!['confirmed', 'reviewing'].includes(manuscript?.status)) {
      alert('请先确认手稿');
      return;
    }

    setEnriching(true);
    try {
      const res = await fetch(`/api/teaching/manuscript/${manuscriptId}/enrich`, {
        method: 'POST',
      });

      if (res.ok) {
        fetchManuscript();
      } else {
        const err = await res.json();
        alert(err.error || '润色失败');
      }
    } catch (error: any) {
      alert(error.message || '润色失败');
    } finally {
      setEnriching(false);
    }
  };

  const handleRender = async () => {
    // 如果还没有生成 slidevMd，先调用渲染 API
    if (!manuscript?.slidevMd) {
      try {
        const res = await fetch(`/api/teaching/manuscript/${manuscriptId}/render`, {
          method: 'POST',
        });
        if (!res.ok) {
          const err = await res.json();
          alert(err.error || '渲染失败');
          return;
        }
        // 刷新手稿数据
        await fetchManuscript();
      } catch (error: any) {
        alert(error.message || '渲染失败');
        return;
      }
    }
    router.push(`/dashboard/teaching/${kbId}/manuscript/${manuscriptId}/preview`);
  };

  const statusInfo = STATUS_MAP[manuscript?.status] || STATUS_MAP.draft;
  const isEditable = !['confirmed', 'reviewing', 'enriching', 'rendering', 'completed'].includes(manuscript?.status);

  if (loading) {
    return (
      <div className="h-screen bg-zinc-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen bg-zinc-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <p className="text-zinc-600">{error}</p>
          <Button variant="outline" className="mt-4" onClick={() => router.back()}>
            返回
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[#f5f7f9] overflow-hidden font-sans">
      {/* 顶部导航 - 更加果粉的毛玻璃效果感 */}
      <header className="flex-shrink-0 bg-white/80 backdrop-blur-md border-b border-slate-200/60 z-30">
        <div className="max-w-[1600px] mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => router.push(`/dashboard/teaching/${kbId}`)}
              className="hover:bg-slate-100 text-slate-600 rounded-full transition-all"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              返回
            </Button>
            <div className="h-4 w-px bg-slate-200" />
            <div>
              <h1 className="text-sm font-semibold text-slate-900 leading-none mb-1">{manuscript?.chapter?.title || '未命名手稿'}</h1>
              <p className="text-[11px] text-slate-400 font-medium tracking-tight uppercase">{manuscript?.knowledgeBase?.name}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* 状态标签 - 阿里风格的简洁标签 */}
            <div className={cn(
              'px-2.5 py-1 rounded-md text-[11px] font-bold flex items-center gap-1.5 border tracking-wider uppercase',
              statusInfo.color.replace('bg-', 'bg-').replace('text-', 'text-') // 保持原有颜色映射，但在 CSS 中进一步美化
            )}>
              <div className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
              {statusInfo.label}
            </div>

            <div className="w-px h-4 bg-slate-200 mx-2" />

            {/* 操作按钮组 - 阿里高效 + 苹果圆润 */}
            {isEditable && (
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleSave}
                  disabled={saving || !hasChanges}
                  className="h-8 border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-xs"
                >
                  {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <Save className="h-3 w-3 mr-1.5" />}
                  保存草稿
                </Button>
                <Button 
                  size="sm"
                  onClick={handleConfirm}
                  disabled={confirming || hasChanges}
                  className="h-8 bg-blue-600 hover:bg-blue-700 text-white shadow-sm rounded-lg text-xs font-semibold px-4"
                >
                  {confirming ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <CheckCircle className="h-3 w-3 mr-1.5" />}
                  确认生成
                </Button>
              </div>
            )}

            {manuscript?.status === 'confirmed' && (
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleReview}
                  disabled={reviewing}
                  className="h-8 border-slate-200 text-slate-600 rounded-lg text-xs"
                >
                  {reviewing ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <FileCheck className="h-3 w-3 mr-1.5" />}
                  智能审核
                </Button>
                <Button 
                  size="sm"
                  onClick={handleEnrich}
                  disabled={enriching}
                  className="h-8 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm rounded-lg text-xs font-semibold px-4"
                >
                  {enriching ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <RefreshCw className="h-3 w-3 mr-1.5" />}
                  润色分页
                </Button>
              </div>
            )}

            {['enriching', 'completed'].includes(manuscript?.status) && manuscript?.enrichedContent && (
              <Button 
                size="sm" 
                onClick={handleRender}
                className="h-8 bg-zinc-800 hover:bg-zinc-700 text-white shadow-sm rounded-lg text-xs font-semibold px-4"
              >
                <Eye className="h-3 w-3 mr-1.5" />
                预览课件
              </Button>
            )}

            <div className="w-px h-4 bg-slate-200 mx-2" />
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAiSidebarOpen(!aiSidebarOpen)}
              className={cn(
                "h-8 px-3 rounded-lg text-xs font-semibold transition-all",
                aiSidebarOpen 
                  ? "bg-slate-900 text-white hover:bg-slate-800" 
                  : "text-slate-600 hover:bg-slate-100"
              )}
            >
              <MessageSquare className={cn("h-3.5 w-3.5 mr-1.5", aiSidebarOpen ? "text-indigo-400" : "text-slate-400")} />
              AI 助手
            </Button>
          </div>
        </div>
      </header>

      {/* 主内容区 - 采用 flex 布局，带有背景色差提升层次感 */}
      <div className="flex-1 overflow-hidden flex relative">
        <main className={cn(
          "flex-1 overflow-hidden flex flex-col transition-all duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] px-8 py-6",
          aiSidebarOpen ? "mr-[380px]" : "max-w-[1400px] mx-auto w-full"
        )}>
          {/* 状态卡片堆叠 - 苹果风浮动岛 */}
          <div className="flex-shrink-0 space-y-4 mb-6">
            {manuscript?.teachingPlan && (
              <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-5 flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">学情目标</p>
                    <p className="text-sm font-semibold text-slate-700">{manuscript.teachingPlan.constraints?.grade} {manuscript.teachingPlan.constraints?.subject}</p>
                  </div>
                  <div className="w-px h-8 bg-slate-100" />
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">预计时长</p>
                    <p className="text-sm font-semibold text-slate-700">{manuscript.teachingPlan.constraints?.duration || '45min'}</p>
                  </div>
                  <div className="w-px h-8 bg-slate-100" />
                  <div className="max-w-md">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">教学重点</p>
                    <p className="text-sm font-medium text-slate-600 truncate">{manuscript.teachingPlan.teaching_goals?.join('、')}</p>
                  </div>
                </div>
              </div>
            )}

            {manuscript?.reviewComments && manuscript.reviewComments.length > 0 && (
              <div className="bg-amber-50/50 rounded-2xl border border-amber-200/40 p-4 flex items-start gap-3">
                <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-xs font-bold text-amber-700 mb-1">审核优化建议</p>
                  <ul className="grid grid-cols-2 gap-x-6 gap-y-1">
                    {manuscript.reviewComments.map((comment: string, i: number) => (
                      <li key={i} className="text-[12px] text-amber-600/80 flex items-center gap-1.5">
                        <span className="w-1 h-1 rounded-full bg-amber-300" />
                        {comment}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* 编辑区容器 - 白色主面板 */}
          <div className="flex-1 min-h-0 flex flex-col">
            {/* 编辑器 */}
            <div className="flex-1 bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-200/60 flex flex-col min-h-0 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-50 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-4 bg-blue-600 rounded-full" />
                    <h2 className="text-sm font-bold text-slate-800">
                      {isEditable ? '手稿正文' : '手稿只读预览'}
                    </h2>
                  </div>
                  {/* 预览/编辑切换按钮 */}
                  {isEditable && (
                    <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
                      <button
                        onClick={() => setEditorMode('preview')}
                        className={cn(
                          "flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-all",
                          editorMode === 'preview' 
                            ? "bg-white text-blue-600 shadow-sm" 
                            : "text-slate-500 hover:text-slate-700"
                        )}
                      >
                        <Eye className="w-3 h-3" />
                        预览
                      </button>
                      <button
                        onClick={() => setEditorMode('edit')}
                        className={cn(
                          "flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-all",
                          editorMode === 'edit' 
                            ? "bg-white text-blue-600 shadow-sm" 
                            : "text-slate-500 hover:text-slate-700"
                        )}
                      >
                        <Edit3 className="w-3 h-3" />
                        编辑
                      </button>
                    </div>
                  )}
                </div>
                {hasChanges && (
                  <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100 uppercase tracking-tighter">
                    未保存
                  </span>
                )}
              </div>
              <div className="flex-1 min-h-0">
                <TiptapEditor
                  content={content}
                  onChange={handleContentChange}
                  editable={isEditable}
                  placeholder="开始您的教学创意..."
                  onSelectionChange={setSelectedText}
                  knowledgeBaseId={kbId}
                  mode={editorMode}
                  onModeChange={setEditorMode}
                  className="h-full"
                />
              </div>
            </div>
          </div>
        </main>

        {/* AI 侧边栏 - 独立悬浮层感 */}
        <div className={cn(
          "absolute right-0 top-0 bottom-0 z-40 transition-transform duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] shadow-2xl",
          aiSidebarOpen ? "translate-x-0" : "translate-x-full"
        )}>
          <AISidebar
            knowledgeBaseId={kbId}
            isOpen={aiSidebarOpen}
            onToggle={() => setAiSidebarOpen(!aiSidebarOpen)}
            selectedText={selectedText}
            onInsertText={(text) => {
              setContent(prev => prev + '\n\n' + text);
              setHasChanges(true);
            }}
          />
        </div>
      </div>
    </div>
  );
}
