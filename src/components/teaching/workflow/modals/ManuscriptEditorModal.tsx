'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { X, Save, Loader2, AlertCircle, Eye, Edit3 } from 'lucide-react';
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

interface ManuscriptEditorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  manuscriptId: string | null;
  kbId: string;
  onSuccess?: () => void;
}

export function ManuscriptEditorModal({
  open,
  onOpenChange,
  manuscriptId,
  kbId,
  onSuccess,
}: ManuscriptEditorModalProps) {
  const [manuscript, setManuscript] = useState<any>(null);
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [editorMode, setEditorMode] = useState<'preview' | 'edit'>('preview');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [error, setError] = useState('');

  // 清理内容：去除可能的代码块包装
  const cleanContent = (raw: string): string => {
    if (!raw) return '';
    let cleaned = raw.trim();
    
    // 去除开头的 ```markdown 或 ```
    if (cleaned.startsWith('```markdown')) {
      cleaned = cleaned.slice(11);
    } else if (cleaned.startsWith('```md')) {
      cleaned = cleaned.slice(5);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.slice(3);
    }
    
    // 去除结尾的 ```
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }
    
    return cleaned.trim();
  };

  const fetchManuscript = useCallback(async () => {
    if (!manuscriptId) {
      setError('无效的手稿 ID');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/teaching/manuscript/${manuscriptId}`);
      if (res.ok) {
        const data = await res.json();
        setManuscript(data);
        
        // 获取内容并清理
        let initialContent = '';
        if (data.status === 'completed' && data.enrichedContent) {
          initialContent = cleanContent(data.enrichedContent);
        } else if (data.status === 'confirmed' && data.confirmedContent) {
          initialContent = cleanContent(data.confirmedContent);
        } else {
          initialContent = cleanContent(data.draftContent || '');
        }
        
        setContent(initialContent);
        setOriginalContent(initialContent);
        setHasChanges(false);
      } else {
        const err = await res.json();
        setError(err.error || '获取手稿失败');
      }
    } catch (error: any) {
      setError(error.message || '网络错误');
    } finally {
      setLoading(false);
    }
  }, [manuscriptId]);

  useEffect(() => {
    if (open && manuscriptId) {
      fetchManuscript();
    }
  }, [open, manuscriptId, fetchManuscript]);

  // 重置状态当弹窗关闭时
  useEffect(() => {
    if (!open) {
      setManuscript(null);
      setContent('');
      setOriginalContent('');
      setHasChanges(false);
      setError('');
      setLoading(false);
    }
  }, [open]);

  const handleContentChange = (value: string) => {
    setContent(value);
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
        setOriginalContent(content);
        onSuccess?.();
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

  const handleClose = () => {
    if (hasChanges) {
      if (!confirm('有未保存的更改，确定要关闭吗？')) {
        return;
      }
    }
    onOpenChange(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-[95vw] max-w-5xl h-[90vh] flex flex-col overflow-hidden">
        {/* 顶部导航 */}
        <header className="flex-shrink-0 bg-white border-b border-zinc-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-bold text-zinc-900">
                {manuscript?.chapter?.title || '手稿编辑'}
              </h1>
              {hasChanges && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                  未保存
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-3">
              {/* 预览/编辑切换 */}
              <div className="flex items-center gap-1 bg-zinc-100 rounded-lg p-0.5">
                <button
                  onClick={() => setEditorMode('preview')}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5",
                    editorMode === 'preview' 
                      ? "bg-white text-zinc-900 shadow-sm" 
                      : "text-zinc-500 hover:text-zinc-700"
                  )}
                >
                  <Eye className="h-3 w-3" />
                  预览
                </button>
                <button
                  onClick={() => setEditorMode('edit')}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5",
                    editorMode === 'edit' 
                      ? "bg-white text-zinc-900 shadow-sm" 
                      : "text-zinc-500 hover:text-zinc-700"
                  )}
                >
                  <Edit3 className="h-3 w-3" />
                  编辑
                </button>
              </div>

              {/* 保存按钮 */}
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleSave}
                disabled={saving || !hasChanges}
                className="h-8"
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                )}
                保存
              </Button>

              {/* 关闭按钮 */}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClose}
                className="h-8 w-8 p-0"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </header>

        {/* 主内容区 */}
        <div className="flex-1 overflow-auto bg-zinc-50">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full">
              <AlertCircle className="h-12 w-12 text-red-400 mb-4" />
              <p className="text-zinc-600">{error}</p>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto py-6 px-4">
              {/* 编辑器容器 */}
              <div className="bg-white rounded-xl shadow-sm border border-zinc-200 overflow-hidden min-h-[500px]">
                <TiptapEditor
                  content={content}
                  onChange={handleContentChange}
                  mode={editorMode}
                  placeholder="开始编写你的培训手稿..."
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ManuscriptEditorModal;
