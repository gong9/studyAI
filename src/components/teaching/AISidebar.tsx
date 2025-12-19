'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { 
  MessageSquare, Send, Loader2, X, ChevronRight, ChevronLeft,
  Sparkles, FileText, Wand2, BookOpen, Copy, Check, Plus
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ==================== 类型定义 ====================

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Array<{
    content: string;
    documentName?: string;
    score?: number;
  }>;
  isLoading?: boolean;
  isError?: boolean;
}

interface AISidebarProps {
  knowledgeBaseId: string;
  isOpen: boolean;
  onToggle: () => void;
  onInsertText?: (text: string) => void;  // 插入到编辑器
  selectedText?: string;  // 编辑器中选中的文本
  className?: string;
}

// ==================== 快捷操作 ====================

const QUICK_ACTIONS = [
  { id: 'polish', label: '润色', icon: Wand2, description: '优化文字表达' },
  { id: 'expand', label: '扩写', icon: Plus, description: '补充相关内容' },
  { id: 'summary', label: '总结', icon: FileText, description: '生成摘要' },
];

// ==================== 组件 ====================

export function AISidebar({ 
  knowledgeBaseId, 
  isOpen, 
  onToggle, 
  onInsertText,
  selectedText,
  className 
}: AISidebarProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 处理消息发送
  const handleSend = async (action: 'ask' | 'polish' | 'expand' | 'summary' = 'ask', text?: string) => {
    const messageText = text || input.trim();
    if (!messageText || loading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: action === 'ask' 
        ? messageText 
        : `【${QUICK_ACTIONS.find(a => a.id === action)?.label}】${messageText.substring(0, 100)}${messageText.length > 100 ? '...' : ''}`,
    };

    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: '',
      isLoading: true,
    };

    setMessages(prev => [...prev, userMessage, assistantMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await fetch('/api/teaching/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          text: messageText,
          knowledgeBaseId,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setMessages(prev => prev.map(msg => 
          msg.id === assistantMessage.id
            ? { ...msg, content: data.result, sources: data.sources, isLoading: false }
            : msg
        ));
      } else {
        setMessages(prev => prev.map(msg =>
          msg.id === assistantMessage.id
            ? { ...msg, content: data.error || '处理失败，请重试', isLoading: false, isError: true }
            : msg
        ));
      }
    } catch (error: any) {
      setMessages(prev => prev.map(msg =>
        msg.id === assistantMessage.id
          ? { ...msg, content: '网络错误，请重试', isLoading: false, isError: true }
          : msg
      ));
    } finally {
      setLoading(false);
    }
  };

  // 复制到剪贴板
  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // 插入到编辑器
  const handleInsert = (text: string) => {
    onInsertText?.(text);
  };

  // 快捷操作
  const handleQuickAction = (actionId: string) => {
    if (!selectedText) {
      alert('请先在编辑器中选中要处理的文本');
      return;
    }
    handleSend(actionId as 'polish' | 'expand' | 'summary', selectedText);
  };

  // 清空对话
  const handleClear = () => {
    setMessages([]);
  };

  return (
    <div 
      className={cn(
        "h-full flex flex-col bg-white border-l border-slate-100 transition-all duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] overflow-hidden",
        isOpen ? "w-[380px]" : "w-0",
        className
      )}
    >
        {/* 头部 - 阿里式的精致简洁 */}
        <div className="flex-shrink-0 px-6 py-5 border-b border-slate-50 bg-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-50 rounded-2xl flex items-center justify-center border border-blue-100">
                <Sparkles className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <h3 className="text-[15px] font-bold text-slate-800 tracking-tight">智能备课助手</h3>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div className="w-1 h-1 rounded-full bg-emerald-500" />
                  <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">AI RAG Engine</p>
                </div>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onToggle} className="h-8 w-8 text-slate-300 hover:text-slate-600 rounded-xl">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* 快捷操作 - 浮动卡片感 */}
        {selectedText && (
          <div className="flex-shrink-0 px-6 py-4 bg-slate-50/50 border-b border-slate-100">
            <div className="flex items-center gap-2 mb-3">
              <div className="px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded text-[10px] font-bold uppercase">选中操作</div>
              <p className="text-[11px] text-slate-400 font-medium">针对编辑器中选中的文字</p>
            </div>
            <div className="flex gap-2">
              {QUICK_ACTIONS.map(action => (
                <button
                  key={action.id}
                  onClick={() => handleQuickAction(action.id)}
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-[12px] font-bold text-slate-600 shadow-sm hover:border-blue-200 hover:text-blue-600 transition-all active:scale-[0.97] disabled:opacity-50"
                >
                  <action.icon className="w-3.5 h-3.5" />
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 消息列表 - 极简气泡 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth custom-scrollbar">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <div className="w-16 h-16 bg-slate-50 rounded-3xl flex items-center justify-center mb-6">
                <MessageSquare className="w-8 h-8 text-slate-200" />
              </div>
              <p className="text-sm font-bold text-slate-600 mb-2">欢迎使用 AI 教学助手</p>
              <p className="text-xs text-slate-400 leading-relaxed max-w-[200px] mx-auto">
                您可以直接询问教材内容，或者在编辑器中选中文段进行优化
              </p>
            </div>
          ) : (
            messages.map(msg => (
              <div
                key={msg.id}
                className={cn(
                  "flex flex-col",
                  msg.role === 'user' ? "items-end" : "items-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[92%] rounded-2xl px-4 py-3 text-[14px] leading-relaxed",
                    msg.role === 'user' 
                      ? "bg-slate-800 text-white rounded-tr-none shadow-md" 
                      : "bg-white border border-slate-100 text-slate-700 rounded-tl-none shadow-sm"
                  )}
                >
                  {msg.isLoading ? (
                    <div className="flex items-center gap-3 py-1">
                      <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                        <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                        <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" />
                      </div>
                      <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">Thinking</span>
                    </div>
                  ) : (
                    <>
                      <div className={cn(
                        "whitespace-pre-wrap",
                        msg.isError && "text-red-500"
                      )}>
                        {msg.content}
                      </div>
                      
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-slate-50">
                          <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mb-2">知识库来源</p>
                          <div className="space-y-2">
                            {msg.sources.slice(0, 2).map((source, i) => (
                              <div key={i} className="text-[11px] text-slate-400 bg-slate-50/50 p-2 rounded-lg border border-slate-100/30">
                                {source.content.substring(0, 60)}...
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {msg.role === 'assistant' && !msg.isLoading && !msg.isError && (
                  <div className="mt-2.5 flex items-center gap-4 ml-1">
                    <button
                      onClick={() => handleCopy(msg.content, msg.id)}
                      className="text-[11px] font-bold text-slate-300 hover:text-slate-600 transition-colors"
                    >
                      {copiedId === msg.id ? '已复制' : '复制内容'}
                    </button>
                    {onInsertText && (
                      <button
                        onClick={() => handleInsert(msg.content)}
                        className="text-[11px] font-bold text-blue-500 hover:text-blue-700 transition-colors"
                      >
                        插入到编辑器
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 输入区 - 苹果风纯净感 */}
        <div className="flex-shrink-0 p-6 bg-white">
          <div className="relative flex items-end gap-2 bg-slate-50 border border-slate-100 rounded-2xl p-2 transition-all focus-within:bg-white focus-within:border-blue-200 focus-within:shadow-md">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend('ask');
                }
              }}
              placeholder="询问助手..."
              className="flex-1 px-3 py-2 text-sm bg-transparent border-none focus:ring-0 resize-none min-h-[40px] max-h-[120px] text-slate-700 placeholder:text-slate-300 font-medium"
              rows={1}
              disabled={loading}
            />
            <button
              onClick={() => handleSend('ask')}
              disabled={!input.trim() || loading}
              className="p-2.5 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-100 hover:bg-blue-700 active:scale-95 disabled:opacity-20 disabled:grayscale transition-all"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-center text-[10px] text-slate-200 mt-4 font-bold uppercase tracking-[0.2em]">
            Precision & Creativity
          </p>
      </div>
    </div>
  );
}

export default AISidebar;

