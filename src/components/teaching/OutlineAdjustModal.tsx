'use client';

import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { 
  Type, 
  Image as ImageIcon, 
  Upload, 
  Loader2, 
  Check, 
  Plus, 
  Minus, 
  Edit3,
  ChevronRight,
  ChevronDown,
  AlertCircle,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChapterBoundary {
  title: string;
  level: number;
  startPage: number;
  endPage: number;
  sections?: ChapterBoundary[];
}

interface OutlineDiff {
  added: ChapterBoundary[];
  removed: { id: string; title: string }[];
  modified: ChapterBoundary[];
  unchanged: ChapterBoundary[];
}

interface OutlineAdjustModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  knowledgeBaseId: string;
  onSuccess?: () => void;
}

interface ImageItem {
  preview: string;
  base64: string;
}

export function OutlineAdjustModal({
  open,
  onOpenChange,
  knowledgeBaseId,
  onSuccess,
}: OutlineAdjustModalProps) {
  const [inputMode, setInputMode] = useState<'text' | 'image'>('text');
  const [textInput, setTextInput] = useState('');
  const [images, setImages] = useState<ImageItem[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState<{
    newChapters: ChapterBoundary[];
    diff: OutlineDiff;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  // 处理图片上传（支持多张）
  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        const base64 = result.split(',')[1];
        setImages(prev => [...prev, { preview: result, base64 }]);
      };
      reader.readAsDataURL(file);
    });
    // 重置 input 以允许重复上传相同文件
    e.target.value = '';
  }, []);

  // 处理拖拽上传（支持多张）
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        const base64 = result.split(',')[1];
        setImages(prev => [...prev, { preview: result, base64 }]);
      };
      reader.readAsDataURL(file);
    });
  }, []);

  // 删除单张图片
  const removeImage = useCallback((index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  }, []);

  // 识别并预览
  const handleRecognize = async () => {
    if (inputMode === 'text' && !textInput.trim()) {
      setError('请输入目录文本');
      return;
    }
    if (inputMode === 'image' && images.length === 0) {
      setError('请上传目录图片');
      return;
    }

    setLoading(true);
    setError(null);
    setPreviewResult(null);

    try {
      const response = await fetch('/api/book-understanding/adjust-outline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          knowledgeBaseId,
          text: inputMode === 'text' ? textInput : undefined,
          // 支持多张图片
          images: inputMode === 'image' ? images.map(img => img.base64) : undefined,
          applyChanges: false,
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || '识别失败');
      }

      setPreviewResult({
        newChapters: data.newChapters,
        diff: data.diff,
      });
    } catch (err: any) {
      setError(err.message || '识别失败');
    } finally {
      setLoading(false);
    }
  };

  // 应用变更
  const handleApply = async () => {
    setApplying(true);
    setError(null);

    try {
      const response = await fetch('/api/book-understanding/adjust-outline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          knowledgeBaseId,
          text: inputMode === 'text' ? textInput : undefined,
          images: inputMode === 'image' ? images.map(img => img.base64) : undefined,
          applyChanges: true,
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || '应用失败');
      }

      onSuccess?.();
      onOpenChange(false);
      resetState();
    } catch (err: any) {
      setError(err.message || '应用失败');
    } finally {
      setApplying(false);
    }
  };

  // 重置状态
  const resetState = () => {
    setTextInput('');
    setImages([]);
    setPreviewResult(null);
    setError(null);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-[90vw] max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* 弹窗头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 bg-zinc-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-xl flex items-center justify-center shadow-sm">
              <Edit3 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-900">调整大纲结构</h2>
              <p className="text-xs text-zinc-500 mt-0.5">通过文字或图片调整章节大纲</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              resetState();
              onOpenChange(false);
            }}
            className="h-8 w-8 p-0 text-zinc-400 hover:text-zinc-900"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* 弹窗内容 */}
        <div className="flex-1 p-6 overflow-auto">
          {!previewResult ? (
            // 输入阶段
            <div className="space-y-4">
              {/* Tab 切换 */}
              <div className="flex gap-2 border-b border-zinc-200 pb-2">
                <button
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                    inputMode === 'text' 
                      ? "bg-zinc-900 text-white" 
                      : "text-zinc-600 hover:bg-zinc-100"
                  )}
                  onClick={() => setInputMode('text')}
                >
                  <Type className="w-4 h-4" />
                  文字输入
                </button>
                <button
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                    inputMode === 'image' 
                      ? "bg-zinc-900 text-white" 
                      : "text-zinc-600 hover:bg-zinc-100"
                  )}
                  onClick={() => setInputMode('image')}
                >
                  <ImageIcon className="w-4 h-4" />
                  图片识别
                </button>
              </div>

              {inputMode === 'text' ? (
                <div>
                  <Textarea
                    placeholder={`粘贴目录内容，例如：

Introduction    4
What is an agent?    5
  The model    6
  The tools    7
Tools: Our keys    12
  Extensions    13
    Sample Extensions    15
Summary    40`}
                    className="min-h-[300px] font-mono text-sm"
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                  />
                  <p className="text-xs text-zinc-500 mt-2">
                    提示：使用缩进（空格或Tab）表示层级关系
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* 上传区域 */}
                  <div
                    className={cn(
                      "border-2 border-dashed rounded-lg p-6 text-center transition-colors",
                      images.length > 0 
                        ? "border-blue-300 bg-blue-50/50" 
                        : "border-zinc-300 hover:border-blue-300"
                    )}
                    onDrop={handleDrop}
                    onDragOver={(e) => e.preventDefault()}
                  >
                    <label className="cursor-pointer block">
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={handleImageUpload}
                      />
                      <div className="flex items-center justify-center gap-3">
                        <Upload className="w-8 h-8 text-zinc-400" />
                        <div className="text-left">
                          <p className="text-zinc-600 font-medium">
                            {images.length > 0 ? '继续添加图片' : '点击上传或拖拽目录截图到此处'}
                          </p>
                          <p className="text-xs text-zinc-400 mt-0.5">
                            支持上传多张图片，按页码顺序上传 • PNG、JPG 格式
                          </p>
                        </div>
                      </div>
                    </label>
                  </div>

                  {/* 图片预览网格 */}
                  {images.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-zinc-700">
                          已上传 {images.length} 张图片
                        </p>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className="text-xs text-zinc-500 hover:text-red-600"
                          onClick={() => setImages([])}
                        >
                          清空全部
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[280px] overflow-auto p-1">
                        {images.map((img, index) => (
                          <div 
                            key={index} 
                            className="relative group rounded-lg overflow-hidden border border-zinc-200 bg-white shadow-sm"
                          >
                            <img 
                              src={img.preview} 
                              alt={`目录截图 ${index + 1}`} 
                              className="w-full h-32 object-cover"
                            />
                            {/* 序号标签 */}
                            <div className="absolute top-2 left-2 w-6 h-6 bg-zinc-900/80 text-white text-xs font-bold rounded-full flex items-center justify-center">
                              {index + 1}
                            </div>
                            {/* 删除按钮 */}
                            <button
                              onClick={() => removeImage(index)}
                              className="absolute top-2 right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 text-red-600 text-sm p-3 bg-red-50 rounded-lg">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </div>
              )}
            </div>
          ) : (
            // 预览阶段
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {/* 新大纲结构 */}
                <div className="border rounded-lg p-4">
                  <h3 className="font-medium mb-3 flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-500" />
                    识别结果
                  </h3>
                  <div className="max-h-[300px] overflow-auto">
                    <ChapterTree chapters={previewResult.newChapters} />
                  </div>
                </div>

                {/* 变更摘要 */}
                <div className="border rounded-lg p-4">
                  <h3 className="font-medium mb-3">变更摘要</h3>
                  <div className="space-y-3 text-sm">
                    {previewResult.diff.added.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 text-green-600 font-medium mb-1">
                          <Plus className="w-4 h-4" />
                          新增 {previewResult.diff.added.length} 个章节
                        </div>
                        <ul className="pl-6 text-zinc-500">
                          {previewResult.diff.added.slice(0, 5).map((ch, i) => (
                            <li key={i}>{ch.title}</li>
                          ))}
                          {previewResult.diff.added.length > 5 && (
                            <li>...还有 {previewResult.diff.added.length - 5} 个</li>
                          )}
                        </ul>
                      </div>
                    )}

                    {previewResult.diff.removed.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 text-red-600 font-medium mb-1">
                          <Minus className="w-4 h-4" />
                          移除 {previewResult.diff.removed.length} 个章节
                        </div>
                        <ul className="pl-6 text-zinc-500">
                          {previewResult.diff.removed.slice(0, 5).map((ch, i) => (
                            <li key={i}>{ch.title}</li>
                          ))}
                          {previewResult.diff.removed.length > 5 && (
                            <li>...还有 {previewResult.diff.removed.length - 5} 个</li>
                          )}
                        </ul>
                      </div>
                    )}

                    {previewResult.diff.modified.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 text-yellow-600 font-medium mb-1">
                          <Edit3 className="w-4 h-4" />
                          修改 {previewResult.diff.modified.length} 个章节
                        </div>
                        <ul className="pl-6 text-zinc-500">
                          {previewResult.diff.modified.slice(0, 5).map((ch, i) => (
                            <li key={i}>{ch.title}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {previewResult.diff.unchanged.length > 0 && (
                      <div className="text-zinc-500">
                        {previewResult.diff.unchanged.length} 个章节保持不变
                      </div>
                    )}

                    {previewResult.diff.added.length === 0 && 
                     previewResult.diff.removed.length === 0 && 
                     previewResult.diff.modified.length === 0 && (
                      <div className="text-zinc-500">
                        没有检测到变更
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-red-600 text-sm p-3 bg-red-50 rounded-lg">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 弹窗底部 */}
        <div className="px-6 py-4 border-t border-zinc-100 bg-zinc-50/50 flex justify-end gap-3">
          {!previewResult ? (
            <>
              <Button 
                variant="outline" 
                onClick={() => {
                  resetState();
                  onOpenChange(false);
                }}
              >
                取消
              </Button>
              <Button onClick={handleRecognize} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    识别中...
                  </>
                ) : (
                  '识别并预览'
                )}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setPreviewResult(null)}>
                返回修改
              </Button>
              <Button onClick={handleApply} disabled={applying}>
                {applying ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    应用中...
                  </>
                ) : (
                  '确认应用'
                )}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// 章节树组件
function ChapterTree({ chapters }: { chapters: ChapterBoundary[] }) {
  return (
    <div className="space-y-1">
      {chapters.map((ch, i) => (
        <ChapterNode key={i} chapter={ch} />
      ))}
    </div>
  );
}

function ChapterNode({ chapter }: { chapter: ChapterBoundary }) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = chapter.sections && chapter.sections.length > 0;

  return (
    <div>
      <div 
        className={cn(
          "flex items-center gap-1 py-1 px-2 rounded hover:bg-zinc-100 cursor-default",
          chapter.level === 1 && "font-medium",
          chapter.level === 2 && "pl-6 text-sm",
          chapter.level === 3 && "pl-10 text-sm text-zinc-500",
        )}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        {hasChildren ? (
          expanded ? (
            <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
          )
        ) : (
          <span className="w-4" />
        )}
        <span className="truncate">{chapter.title}</span>
        {chapter.startPage > 0 && (
          <span className="text-xs text-zinc-400 ml-auto shrink-0">
            p.{chapter.startPage}
          </span>
        )}
      </div>
      {hasChildren && expanded && (
        <div className="ml-2">
          {chapter.sections!.map((sub, i) => (
            <ChapterNode key={i} chapter={sub} />
          ))}
        </div>
      )}
    </div>
  );
}
