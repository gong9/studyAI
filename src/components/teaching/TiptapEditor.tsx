'use client';

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Typography from '@tiptap/extension-typography';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { cn } from '@/lib/utils';
import { 
  Bold, Italic, Strikethrough, Code, List, ListOrdered,
  Heading1, Heading2, Heading3, Quote, Undo, Redo,
  AlignLeft, AlignCenter, AlignRight, Highlighter,
  Wand2, Plus, FileText, Loader2, Eye, Edit3
} from 'lucide-react';

interface TiptapEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  className?: string;
  editable?: boolean;
  onSelectionChange?: (selectedText: string) => void;
  knowledgeBaseId?: string;
  mode?: 'preview' | 'edit';
  onModeChange?: (mode: 'preview' | 'edit') => void;
}

// 工具栏按钮
const ToolbarButton = ({ 
  onClick, 
  active = false, 
  disabled = false,
  children,
  title
}: { 
  onClick: () => void; 
  active?: boolean; 
  disabled?: boolean;
  children: React.ReactNode;
  title?: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={cn(
      "p-2 rounded-lg transition-all duration-200",
      "hover:bg-indigo-50 hover:text-indigo-600",
      "disabled:opacity-40 disabled:cursor-not-allowed",
      active 
        ? "bg-indigo-50 text-indigo-600 shadow-sm" 
        : "text-slate-600"
    )}
  >
    {children}
  </button>
);

// 分隔线
const Divider = () => (
  <div className="w-px h-6 bg-gray-200 mx-1" />
);

// 渲染 Markdown 为 HTML（包含 LaTeX）
function renderMarkdownWithLatex(markdown: string): string {
  if (!markdown) return '';
  
  let html = markdown;
  
  // 处理块级公式 $$...$$（支持跨行）
  html = html.replace(/\$\$([\s\S]+?)\$\$/g, (_, formula) => {
    try {
      const rendered = katex.renderToString(formula.trim(), {
        displayMode: true,
        throwOnError: false,
      });
      return `<div class="math-block-preview">${rendered}</div>`;
    } catch (e) {
      return `<div class="math-error">${formula}</div>`;
    }
  });
  
  // 处理行内公式 $...$
  html = html.replace(/\$([^$\n]+?)\$/g, (_, formula) => {
    if (!formula.trim()) return `$${formula}$`;
    try {
      const rendered = katex.renderToString(formula.trim(), {
        displayMode: false,
        throwOnError: false,
      });
      return `<span class="math-inline-preview">${rendered}</span>`;
    } catch (e) {
      return `<span class="math-error">${formula}</span>`;
    }
  });
  
  // 处理 Markdown 表格
  html = processMarkdownTables(html);
  
  // 处理 Markdown 格式
  html = html
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^---$/gm, '<hr>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="ordered">$2</li>')
    .replace(/^- (.+)$/gm, '<li>$1</li>');
  
  // 处理段落
  const lines = html.split('\n');
  const result: string[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      result.push('<br>');
      continue;
    }
    if (trimmed.startsWith('<')) {
      result.push(trimmed);
    } else {
      result.push(`<p>${trimmed}</p>`);
    }
  }
  
  return result.join('\n');
}

// 处理 Markdown 表格转 HTML
function processMarkdownTables(markdown: string): string {
  // 使用正则匹配完整的表格块
  const tableRegex = /(\|[^\n]+\|\n)+/g;
  
  return markdown.replace(tableRegex, (tableBlock) => {
    const lines = tableBlock.trim().split('\n').filter(line => line.trim());
    
    if (lines.length < 2) return tableBlock;
    
    // 检查是否是有效的表格（第二行是分隔行）
    const separatorLine = lines[1];
    if (!separatorLine.includes('---')) return tableBlock;
    
    let tableHtml = '<table style="border-collapse: collapse; width: 100%; margin: 1rem 0;"><thead><tr>';
    
    // 表头（第一行）
    const headerCells = lines[0].split('|').filter(c => c.trim());
    headerCells.forEach(cell => {
      tableHtml += `<th style="border: 1px solid #d1d5db; padding: 0.5rem 1rem; background-color: #f1f5f9; font-weight: 600; text-align: left;">${cell.trim()}</th>`;
    });
    tableHtml += '</tr></thead><tbody>';
    
    // 数据行（跳过分隔行）
    for (let j = 2; j < lines.length; j++) {
      const cells = lines[j].split('|').filter(c => c.trim());
      if (cells.length > 0) {
        tableHtml += '<tr>';
        cells.forEach(cell => {
          tableHtml += `<td style="border: 1px solid #d1d5db; padding: 0.5rem 1rem;">${cell.trim()}</td>`;
        });
        tableHtml += '</tr>';
      }
    }
    
    tableHtml += '</tbody></table>';
    return tableHtml;
  });
}

// 将 Markdown 转换为 Tiptap 可用的 HTML
function markdownToHtml(markdown: string): string {
  if (!markdown) return '';
  
  let html = markdown;
  
  // 处理表格（需要在其他处理之前）
  html = processMarkdownTables(html);
  
  // 处理标题
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  
  // 处理粗体
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  
  // 处理斜体
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  
  // 处理分隔线
  html = html.replace(/^---$/gm, '<hr>');
  
  // 处理引用
  html = html.replace(/^> (.+)$/gm, '<blockquote><p>$1</p></blockquote>');
  
  // 处理有序列表
  html = html.replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>');
  
  // 处理无序列表
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  
  // 处理段落
  const lines = html.split('\n');
  const result: string[] = [];
  let inList = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    if (!trimmed) {
      if (inList) {
        result.push('</ul>');
        inList = false;
      }
      continue;
    }
    
    if (trimmed.startsWith('<li>')) {
      if (!inList) {
        result.push('<ul>');
        inList = true;
      }
      result.push(trimmed);
      continue;
    }
    
    if (inList) {
      result.push('</ul>');
      inList = false;
    }
    
    if (trimmed.startsWith('<')) {
      result.push(trimmed);
    } else {
      result.push(`<p>${trimmed}</p>`);
    }
  }
  
  if (inList) {
    result.push('</ul>');
  }
  
  return result.join('');
}

export function TiptapEditor({ 
  content, 
  onChange, 
  placeholder = '开始编写教学手稿...',
  className,
  editable = true,
  onSelectionChange,
  knowledgeBaseId,
  mode: externalMode,
  onModeChange
}: TiptapEditorProps) {
  const [selectedText, setSelectedText] = useState('');
  const [showBubbleMenu, setShowBubbleMenu] = useState(false);
  const [bubblePosition, setBubblePosition] = useState({ x: 0, y: 0 });
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  // 内部 mode 状态，如果有外部控制则使用外部的
  const [internalMode, setInternalMode] = useState<'preview' | 'edit'>('preview');
  const mode = externalMode ?? internalMode;
  const setMode = onModeChange ?? setInternalMode;
  const editorContainerRef = useRef<HTMLDivElement>(null);

  // 渲染预览内容
  const previewHtml = useMemo(() => renderMarkdownWithLatex(content), [content]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
      Typography,
      Highlight.configure({
        multicolor: true,
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
    ],
    content: markdownToHtml(content),
    editable,
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-lg max-w-none focus:outline-none min-h-[400px] p-6',
        ),
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const md = htmlToMarkdown(html);
      onChange(md);
    },
    onSelectionUpdate: ({ editor }) => {
      const { from, to } = editor.state.selection;
      const text = editor.state.doc.textBetween(from, to, ' ');
      
      setSelectedText(text);
      onSelectionChange?.(text);
      
      if (text.length > 3 && editable && knowledgeBaseId) {
        const domSelection = window.getSelection();
        if (domSelection && domSelection.rangeCount > 0) {
          const range = domSelection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          const containerRect = editorContainerRef.current?.getBoundingClientRect();
          
          if (containerRect) {
            setBubblePosition({
              x: rect.left - containerRect.left + rect.width / 2,
              y: rect.top - containerRect.top - 10,
            });
            setShowBubbleMenu(true);
          }
        }
      } else {
        setShowBubbleMenu(false);
      }
    },
  });

  // AI 操作
  const handleAIAction = async (action: 'polish' | 'expand' | 'summary') => {
    if (!editor || !selectedText || !knowledgeBaseId || aiLoading) return;
    
    setAiLoading(action);
    
    try {
      const response = await fetch('/api/teaching/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          text: selectedText,
          knowledgeBaseId,
        }),
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        editor.chain().focus().deleteSelection().insertContent(data.result).run();
        setShowBubbleMenu(false);
      } else {
        alert(data.error || 'AI 处理失败');
      }
    } catch (error) {
      alert('网络错误，请重试');
    } finally {
      setAiLoading(null);
    }
  };

  if (!editor) {
    return (
      <div className="animate-pulse bg-gray-100 rounded-xl h-96" />
    );
  }

  return (
    <div 
      ref={editorContainerRef}
      className={cn("flex flex-col h-full bg-white relative", className)}
    >
      {/* 编辑模式时显示工具栏 */}
      {mode === 'edit' && editable && (
        <div className="border-b border-gray-100 bg-gray-50/80 px-3 py-2 flex items-center gap-1">
          <ToolbarButton 
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            title="撤销"
          >
            <Undo className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton 
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            title="重做"
          >
            <Redo className="w-4 h-4" />
          </ToolbarButton>

          <Divider />

          <ToolbarButton 
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            active={editor.isActive('heading', { level: 1 })}
            title="一级标题"
          >
            <Heading1 className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton 
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            active={editor.isActive('heading', { level: 2 })}
            title="二级标题"
          >
            <Heading2 className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton 
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            active={editor.isActive('heading', { level: 3 })}
            title="三级标题"
          >
            <Heading3 className="w-4 h-4" />
          </ToolbarButton>

          <Divider />

          <ToolbarButton 
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive('bold')}
            title="粗体"
          >
            <Bold className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton 
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive('italic')}
            title="斜体"
          >
            <Italic className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton 
            onClick={() => editor.chain().focus().toggleHighlight().run()}
            active={editor.isActive('highlight')}
            title="高亮"
          >
            <Highlighter className="w-4 h-4" />
          </ToolbarButton>

          <Divider />

          <ToolbarButton 
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive('bulletList')}
            title="无序列表"
          >
            <List className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton 
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            active={editor.isActive('orderedList')}
            title="有序列表"
          >
            <ListOrdered className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton 
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            active={editor.isActive('blockquote')}
            title="引用"
          >
            <Quote className="w-4 h-4" />
          </ToolbarButton>
        </div>
      )}

      {/* AI 悬浮工具条（编辑模式） */}
      {mode === 'edit' && showBubbleMenu && editable && knowledgeBaseId && (
        <div 
          className="absolute z-50 bg-white border border-slate-200 rounded-xl shadow-xl px-1.5 py-1 flex items-center gap-1 animate-in fade-in zoom-in-95 duration-200"
          style={{
            left: bubblePosition.x,
            top: bubblePosition.y + 50,
            transform: 'translate(-50%, 0)',
          }}
        >
          <button
            onClick={() => handleAIAction('polish')}
            disabled={!!aiLoading}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all disabled:opacity-50"
          >
            {aiLoading === 'polish' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5 text-indigo-500" />}
            润色
          </button>
          <button
            onClick={() => handleAIAction('expand')}
            disabled={!!aiLoading}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all disabled:opacity-50"
          >
            {aiLoading === 'expand' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 text-indigo-500" />}
            扩写
          </button>
          <button
            onClick={() => handleAIAction('summary')}
            disabled={!!aiLoading}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all disabled:opacity-50"
          >
            {aiLoading === 'summary' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5 text-indigo-500" />}
            总结
          </button>
        </div>
      )}

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto">
        {mode === 'preview' ? (
          /* 预览模式 */
          <div className="p-6">
            <div 
              className="preview-content prose prose-lg max-w-none"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </div>
        ) : (
          /* 编辑模式 */
          <EditorContent editor={editor} className="h-full" />
        )}
      </div>
      
      {/* 自定义样式 */}
      <style jsx global>{`
        /* 编辑器容器样式 */
        .tiptap {
          min-height: 100%;
          padding: 1.5rem;
          outline: none;
        }
        
        /* 编辑器标题样式 */
        .ProseMirror h1 {
          font-size: 1.875rem !important;
          font-weight: 700 !important;
          color: #1e293b !important;
          border-bottom: 2px solid #e0e7ff !important;
          padding-bottom: 0.75rem !important;
          margin-top: 1.5rem !important;
          margin-bottom: 1rem !important;
        }
        .ProseMirror h2 {
          font-size: 1.5rem !important;
          font-weight: 600 !important;
          color: #4f46e5 !important;
          margin-top: 1.25rem !important;
          margin-bottom: 0.75rem !important;
        }
        .ProseMirror h3 {
          font-size: 1.25rem !important;
          font-weight: 600 !important;
          color: #6366f1 !important;
          margin-top: 1rem !important;
          margin-bottom: 0.5rem !important;
        }
        .ProseMirror p {
          margin: 0.5rem 0 !important;
          line-height: 1.75 !important;
        }
        .ProseMirror strong {
          color: #4f46e5 !important;
          font-weight: 700 !important;
        }
        
        /* 预览区标题样式 */
        .preview-content h1 {
          font-size: 1.875rem;
          font-weight: 700;
          color: #1e293b;
          border-bottom: 2px solid #e0e7ff;
          padding-bottom: 0.75rem;
          margin-top: 1.5rem;
          margin-bottom: 1rem;
        }
        .preview-content h2 {
          font-size: 1.5rem;
          font-weight: 600;
          color: #4f46e5;
          margin-top: 1.25rem;
          margin-bottom: 0.75rem;
        }
        .preview-content h3 {
          font-size: 1.25rem;
          font-weight: 600;
          color: #6366f1;
          margin-top: 1rem;
          margin-bottom: 0.5rem;
        }
        .preview-content p {
          margin: 0.5rem 0;
          line-height: 1.75;
          color: #334155;
        }
        .preview-content strong {
          color: #4f46e5;
          font-weight: 700;
        }
        .preview-content blockquote {
          border-left: 4px solid #818cf8;
          background: #eef2ff;
          padding: 0.75rem 1rem;
          margin: 0.75rem 0;
          border-radius: 0 0.5rem 0.5rem 0;
          font-style: italic;
          color: #475569;
        }
        .preview-content li {
          margin: 0.25rem 0;
          color: #334155;
        }
        .preview-content hr {
          border-color: #e2e8f0;
          margin: 1.5rem 0;
        }
        
        /* 数学公式预览样式 */
        .math-inline-preview {
          display: inline-block;
          padding: 0.125rem 0.375rem;
          margin: 0 0.125rem;
          background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
          border: 1px solid #bae6fd;
          border-radius: 0.25rem;
        }
        .math-inline-preview .katex {
          font-size: 1.05em;
        }
        .math-block-preview {
          display: block;
          text-align: center;
          padding: 1.25rem 1.5rem;
          margin: 1rem 0;
          background: linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%);
          border: 1px solid #c7d2fe;
          border-radius: 0.5rem;
        }
        .math-block-preview .katex {
          font-size: 1.35em;
        }
        .math-block-preview .katex-display {
          margin: 0 !important;
        }
        .math-error {
          color: #ef4444;
          font-family: monospace;
          font-size: 0.9em;
          background: #fef2f2;
          padding: 0.25rem 0.5rem;
          border-radius: 0.25rem;
        }
      `}</style>
    </div>
  );
}

// 简单的 HTML 转 Markdown
function htmlToMarkdown(html: string): string {
  return html
    .replace(/<h1[^>]*>(.*?)<\/h1>/g, '# $1\n\n')
    .replace(/<h2[^>]*>(.*?)<\/h2>/g, '## $1\n\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/g, '### $1\n\n')
    .replace(/<strong>(.*?)<\/strong>/g, '**$1**')
    .replace(/<em>(.*?)<\/em>/g, '*$1*')
    .replace(/<code>(.*?)<\/code>/g, '`$1`')
    .replace(/<li>(.*?)<\/li>/g, '- $1\n')
    .replace(/<ul[^>]*>/g, '')
    .replace(/<\/ul>/g, '\n')
    .replace(/<ol[^>]*>/g, '')
    .replace(/<\/ol>/g, '\n')
    .replace(/<blockquote[^>]*>(.*?)<\/blockquote>/g, '> $1\n\n')
    .replace(/<p[^>]*>(.*?)<\/p>/g, '$1\n\n')
    .replace(/<hr[^>]*>/g, '---\n\n')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export default TiptapEditor;
