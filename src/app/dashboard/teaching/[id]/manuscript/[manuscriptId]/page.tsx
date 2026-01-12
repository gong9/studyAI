'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  ArrowLeft, Save, CheckCircle, Loader2, FileCheck, 
  Eye, Edit3, RefreshCw, AlertCircle, ChevronRight, MessageSquare,
  Sparkles, PenLine, Brain
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

// 动态导入 Agent 执行追踪查看器
const AgentTraceViewer = dynamic(
  () => import('@/components/teaching/AgentTraceViewer'),
  { ssr: false }
);

// 状态映射 - 区分 AI 生成和用户手稿
const STATUS_MAP: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  draft: { label: 'LLM 初稿', color: 'bg-blue-100 text-blue-700', icon: <Edit3 className="h-3 w-3" /> },
  user_draft: { label: '用户手稿', color: 'bg-emerald-100 text-emerald-700', icon: <PenLine className="h-3 w-3" /> },
  user_editing: { label: '编辑中', color: 'bg-yellow-100 text-yellow-700', icon: <Edit3 className="h-3 w-3" /> },
  confirmed: { label: '已确认', color: 'bg-green-100 text-green-700', icon: <CheckCircle className="h-3 w-3" /> },
  reviewing: { label: '审核中', color: 'bg-purple-100 text-purple-700', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  enriching: { label: '润色中', color: 'bg-indigo-100 text-indigo-700', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  rendering: { label: '渲染中', color: 'bg-pink-100 text-pink-700', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  processing: { label: '智能布局中', color: 'bg-cyan-100 text-cyan-700', icon: <Sparkles className="h-3 w-3 animate-pulse" /> },
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
  const [regenerating, setRegenerating] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [reviewEnriching, setReviewEnriching] = useState(false);
  const [directGenerating, setDirectGenerating] = useState(false); // 直接生成课件
  const [hasChanges, setHasChanges] = useState(false);
  const [error, setError] = useState('');
  const [aiSidebarOpen, setAiSidebarOpen] = useState(true);  // 默认打开 AI 助手
  const [selectedText, setSelectedText] = useState('');
  const [lastTraceId, setLastTraceId] = useState<string | null>(null); // 最后一次执行追踪 ID
  const [showTraceViewer, setShowTraceViewer] = useState(false); // 是否显示追踪查看器
  
  // 判断是否为用户直接创作的手稿（而非 AI 生成）
  const isUserManuscript = (() => {
    if (!manuscript) return false;
    // 检查 teachingPlan 中的 source 标记
    try {
      const plan = typeof manuscript.teachingPlan === 'string' 
        ? JSON.parse(manuscript.teachingPlan) 
        : manuscript.teachingPlan;
      // 空白手稿创建时会带有特定标记
      if (plan?.source === 'user_manuscript' || plan?.source === 'blank') return true;
      // 检查章节描述是否为用户自主创作
      if (manuscript.chapter?.contentPreview?.includes('用户自主创作')) return true;
    } catch {}
    // 如果 draftContent 为空或很短，也可能是用户手稿
    return false;
  })();

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
        
        // 根据状态决定显示哪个内容版本，保护用户编辑的内容
        let initialContent = '';
        if (data.status === 'completed' && data.enrichedContent) {
          // 只有完成状态才显示润色后的内容
          initialContent = data.enrichedContent;
        } else if (data.status === 'confirmed' && data.confirmedContent) {
          // 确认状态显示确认后的内容
          initialContent = data.confirmedContent;
        } else {
          // draft/user_editing 状态显示草稿
          initialContent = data.draftContent || '';
        }
        
        setContent(initialContent);
        setOriginalContent(initialContent);
        setHasChanges(false); // 重置变更状态
        
        // 如果内容为空，自动切换到编辑模式
        if (!initialContent.trim()) {
          setEditorMode('edit');
        }
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
    // 检查是否有 HTML 幻灯片（课件的关键数据）
    if (!manuscript?.htmlSlides) {
      setRendering(true);
      try {
        const res = await fetch(`/api/teaching/manuscript/${manuscriptId}/render`, {
          method: 'POST',
        });
        if (!res.ok) {
          const err = await res.json();
          alert(err.error || '渲染失败');
          return;
        }
        // 刷新手稿数据，等待 HTML 幻灯片生成完成
        await fetchManuscript();
      } catch (error: any) {
        alert(error.message || '渲染失败');
        return;
      } finally {
        setRendering(false);
      }
    }
    router.push(`/dashboard/teaching/${kbId}/manuscript/${manuscriptId}/presentation`);
  };

  // 审阅润色（GPT-5.1 审阅 + RAG 智能润色）
  const handleReviewEnrich = async () => {
    setReviewEnriching(true);
    try {
      const res = await fetch(`/api/teaching/manuscript/${manuscriptId}/review-enrich`, {
        method: 'POST',
      });

      if (res.ok) {
        const data = await res.json();
        alert(`审阅润色完成！\n评分：${data.review?.score || '-'}/10\n评价：${data.review?.overallAssessment || '-'}`);
        fetchManuscript();
      } else {
        const err = await res.json();
        alert(err.error || '审阅润色失败');
      }
    } catch (error: any) {
      alert(error.message || '审阅润色失败');
    } finally {
      setReviewEnriching(false);
    }
  };

  const handleRegenerate = async () => {
    if (!confirm('确定要重新生成课件吗？这将重新渲染 PPT 幻灯片，但不会修改手稿内容。')) {
      return;
    }

    setRegenerating(true);
    try {
      // 只调用 render API 重新生成 HTML 幻灯片，不修改手稿内容
      const renderRes = await fetch(`/api/teaching/manuscript/${manuscriptId}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true }), // 强制重新渲染
      });

      if (!renderRes.ok) {
        const err = await renderRes.json();
        alert(err.error || '重新生成失败');
        return;
      }

      // 刷新手稿数据
      await fetchManuscript();
      alert('课件已重新生成！');
    } catch (error: any) {
      alert(error.message || '重新生成失败');
    } finally {
      setRegenerating(false);
    }
  };

  // 直接生成课件（用户手稿专用）- 使用 Python Agent 智能布局
  const handleDirectGenerate = async () => {
    // 如果有未保存的内容，先保存
    if (hasChanges) {
      setSaving(true);
      try {
        const saveRes = await fetch(`/api/teaching/manuscript/${manuscriptId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
        });
        if (!saveRes.ok) {
          const err = await saveRes.json();
          alert(err.error || '保存失败');
          return;
        }
        setHasChanges(false);
      } catch (error: any) {
        alert(error.message || '保存失败');
        return;
      } finally {
        setSaving(false);
      }
    }

    // 检查内容是否为空
    if (!content.trim()) {
      alert('请先编写手稿内容');
      return;
    }

    setDirectGenerating(true);
    try {
      // 调用 render API，后端会自动检测用户手稿并调用 Python Agent 处理
      const renderRes = await fetch(`/api/teaching/manuscript/${manuscriptId}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          user_manuscript: true,  // 标记为用户手稿
        }),
      });

      if (!renderRes.ok) {
        const err = await renderRes.json();
        alert(err.error || '生成课件失败');
        return;
      }

      const result = await renderRes.json();
      
      // 保存追踪 ID
      if (result.trace_id) {
        setLastTraceId(result.trace_id);
      }
      
      // 刷新手稿数据
      await fetchManuscript();
      
      // 显示成功信息和追踪查看器
      if (result.processedByAgent) {
        // 不直接跳转，先显示执行追踪
        if (result.trace_id) {
          setShowTraceViewer(true);
        } else {
          // 跳转到预览页面
          router.push(`/dashboard/teaching/${kbId}/manuscript/${manuscriptId}/presentation`);
        }
      } else {
        // 没有 Agent 处理，直接跳转
        router.push(`/dashboard/teaching/${kbId}/manuscript/${manuscriptId}/presentation`);
      }
    } catch (error: any) {
      alert(error.message || '生成课件失败');
    } finally {
      setDirectGenerating(false);
    }
  };

  // 根据手稿来源选择正确的状态显示
  const getStatusInfo = () => {
    const status = manuscript?.status;
    if (isUserManuscript && status === 'draft') {
      return STATUS_MAP.user_draft;
    }
    return STATUS_MAP[status] || STATUS_MAP.draft;
  };
  const statusInfo = getStatusInfo();
  const isEditable = !['confirmed', 'reviewing', 'enriching', 'rendering', 'processing', 'completed'].includes(manuscript?.status);

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
              onClick={() => router.back()}
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

            {/* ========== 用户手稿模式：简化按钮 ========== */}
            {isUserManuscript && isEditable && (
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleSave}
                  disabled={saving || !hasChanges}
                  className="h-8 border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-xs"
                >
                  {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <Save className="h-3 w-3 mr-1.5" />}
                  保存
                </Button>
                <Button 
                  size="sm"
                  onClick={handleDirectGenerate}
                  disabled={directGenerating || !content.trim()}
                  className="h-8 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-sm rounded-lg text-xs font-semibold px-4"
                >
                  {directGenerating ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                      智能布局中...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3 w-3 mr-1.5" />
                      生成课件
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* ========== AI 生成手稿模式：完整流程按钮 ========== */}
            {!isUserManuscript && isEditable && (
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
                  className="h-8 bg-zinc-900 hover:bg-zinc-800 text-white shadow-sm rounded-lg text-xs font-semibold px-4"
                >
                  {confirming ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <CheckCircle className="h-3 w-3 mr-1.5" />}
                  确认生成
                </Button>
              </div>
            )}

            {/* draft 状态且非用户手稿：显示审阅润色按钮 */}
            {!isUserManuscript && manuscript?.status === 'draft' && (
              <Button 
                size="sm"
                onClick={handleReviewEnrich}
                disabled={reviewEnriching || hasChanges}
                className="h-8 bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm rounded-lg text-xs font-semibold px-4"
              >
                {reviewEnriching ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <FileCheck className="h-3 w-3 mr-1.5" />}
                {reviewEnriching ? '审阅润色中...' : '审阅润色'}
              </Button>
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
                  className="h-8 bg-zinc-900 hover:bg-zinc-800 text-white shadow-sm rounded-lg text-xs font-semibold px-4"
                >
                  {enriching ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <RefreshCw className="h-3 w-3 mr-1.5" />}
                  制作课件
                </Button>
              </div>
            )}


            {/* 有课件内容或状态为completed时显示预览课件按钮 */}
            {(manuscript?.enrichedContent || manuscript?.slidevMd || manuscript?.htmlSlides || manuscript?.status === 'completed') && (
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline"
                  size="sm" 
                  onClick={handleRegenerate}
                  disabled={regenerating || rendering}
                  className="h-8 border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-xs"
                >
                  {regenerating ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <RefreshCw className="h-3 w-3 mr-1.5" />}
                  重新生成
                </Button>
                <Button 
                  size="sm" 
                  onClick={handleRender}
                  disabled={rendering}
                  className="h-8 bg-zinc-800 hover:bg-zinc-700 text-white shadow-sm rounded-lg text-xs font-semibold px-4"
                >
                  {rendering ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <Eye className="h-3 w-3 mr-1.5" />}
                  {rendering ? '生成课件中...' : (manuscript?.htmlSlides ? '预览课件' : '生成课件')}
                </Button>
              </div>
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

      {/* 主内容区 - 腾讯文档风格布局 */}
      <div className="flex-1 overflow-hidden flex relative">
        {/* 主编辑区 - 居中显示 */}
        <main className={cn(
          "flex-1 overflow-y-auto transition-all duration-300 ease-out",
          aiSidebarOpen ? "mr-[420px]" : ""
        )}>
          <div className="max-w-[900px] mx-auto py-6 px-4">
            {/* 状态信息条 - 更紧凑 */}
            {manuscript?.teachingPlan && (
              <div className="mb-4 flex items-center gap-4 text-sm text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span className="text-slate-400">学段</span>
                  <span className="font-medium text-slate-700">{manuscript.teachingPlan.constraints?.grade} {manuscript.teachingPlan.constraints?.subject}</span>
                </span>
                <span className="w-1 h-1 rounded-full bg-slate-300" />
                <span className="flex items-center gap-1.5">
                  <span className="text-slate-400">时长</span>
                  <span className="font-medium text-slate-700">{manuscript.teachingPlan.constraints?.duration || '45min'}</span>
                </span>
                <span className="w-1 h-1 rounded-full bg-slate-300" />
                <span className="flex items-center gap-1.5 flex-1 min-w-0">
                  <span className="text-slate-400 flex-shrink-0">重点</span>
                  <span className="font-medium text-slate-700 truncate">{manuscript.teachingPlan.teaching_goals?.join('、')}</span>
                </span>
              </div>
            )}

            {/* GPT-5.1 审阅结果 */}
            {manuscript?.reviewComments && (() => {
              try {
                const review = typeof manuscript.reviewComments === 'string' 
                  ? JSON.parse(manuscript.reviewComments) 
                  : manuscript.reviewComments;
                if (review?.score) {
                  return (
                    <div className="mb-4 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg border border-indigo-100 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                            <span className="text-indigo-600 font-bold text-sm">{review.score}</span>
                          </div>
                          <div>
                            <span className="text-xs text-indigo-500 font-medium">GPT-5.1 审阅评分</span>
                            <p className="text-sm text-slate-700">{review.overallAssessment}</p>
                          </div>
                        </div>
                        {manuscript.enrichedContent && (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">
                            ✓ 已润色
                          </span>
                        )}
                      </div>
                      {review.suggestions && review.suggestions.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-slate-500">改进建议：</p>
                          <div className="grid gap-2">
                            {review.suggestions.slice(0, 4).map((s: any, i: number) => (
                              <div key={i} className={cn(
                                "text-xs p-2 rounded border-l-2",
                                s.severity === 'high' ? "bg-red-50 border-red-400 text-red-700" :
                                s.severity === 'medium' ? "bg-amber-50 border-amber-400 text-amber-700" :
                                "bg-slate-50 border-slate-300 text-slate-600"
                              )}>
                                <span className="font-medium">[{s.type}]</span> {s.issue}
                                <span className="text-slate-500"> → {s.suggestion}</span>
                              </div>
                            ))}
                            {review.suggestions.length > 4 && (
                              <p className="text-xs text-slate-400">还有 {review.suggestions.length - 4} 条建议...</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }
              } catch { /* 旧格式或解析失败 */ }
              // 兼容旧格式
              if (Array.isArray(manuscript.reviewComments) && manuscript.reviewComments.length > 0) {
                return (
              <div className="mb-4 bg-amber-50 rounded-lg border border-amber-100 px-4 py-3 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1 text-sm">
                  <span className="font-medium text-amber-700">优化建议：</span>
                  <span className="text-amber-600">
                    {manuscript.reviewComments.slice(0, 3).join('；')}
                    {manuscript.reviewComments.length > 3 && '...'}
                  </span>
                </div>
              </div>
                );
              }
              return null;
            })()}

            {/* 编辑器容器 - 文档风格 */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 min-h-[calc(100vh-180px)]">
              {/* 编辑器头部 */}
              <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-4 bg-slate-900 rounded-full" />
                    <h2 className="text-sm font-semibold text-slate-800">
                      {isEditable ? '手稿正文' : '只读模式'}
                    </h2>
                  </div>
                  {/* 预览/编辑切换 */}
                  {isEditable && (
                    <div className="flex items-center bg-slate-100 rounded-md p-0.5 ml-2">
                      <button
                        onClick={() => setEditorMode('preview')}
                        className={cn(
                          "flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-all",
                          editorMode === 'preview' 
                            ? "bg-white text-slate-900 shadow-sm" 
                            : "text-slate-500 hover:text-slate-700"
                        )}
                      >
                        <Eye className="w-3 h-3" />
                        预览
                      </button>
                      <button
                        onClick={() => setEditorMode('edit')}
                        className={cn(
                          "flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-all",
                          editorMode === 'edit' 
                            ? "bg-white text-slate-900 shadow-sm" 
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
                  <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    未保存
                  </span>
                )}
              </div>
              
              {/* 编辑器内容区 */}
              <div className="min-h-[500px]">
                <TiptapEditor
                  content={content}
                  onChange={handleContentChange}
                  editable={isEditable}
                  placeholder="开始您的教学创意..."
                  onSelectionChange={setSelectedText}
                  knowledgeBaseId={kbId}
                  mode={editorMode}
                  onModeChange={setEditorMode}
                  className="min-h-[500px]"
                />
              </div>
            </div>
          </div>
        </main>

        {/* AI 侧边栏 - 固定在右侧 */}
        <div className={cn(
          "fixed right-0 top-14 bottom-0 w-[420px] z-40 transition-transform duration-300 ease-out bg-white border-l border-slate-200 shadow-lg",
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

        {/* Agent 执行追踪弹窗 */}
        {showTraceViewer && lastTraceId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-[600px] max-h-[80vh]">
              <AgentTraceViewer 
                traceId={lastTraceId} 
                onClose={() => {
                  setShowTraceViewer(false);
                  // 关闭后跳转到预览页面
                  router.push(`/dashboard/teaching/${kbId}/manuscript/${manuscriptId}/presentation`);
                }} 
              />
              <div className="mt-4 flex justify-center gap-3">
                <Button 
                  variant="outline"
                  onClick={() => setShowTraceViewer(false)}
                  className="bg-white"
                >
                  继续编辑
                </Button>
                <Button 
                  onClick={() => {
                    setShowTraceViewer(false);
                    router.push(`/dashboard/teaching/${kbId}/manuscript/${manuscriptId}/presentation`);
                  }}
                  className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white"
                >
                  <Eye className="w-4 h-4 mr-2" />
                  预览课件
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
