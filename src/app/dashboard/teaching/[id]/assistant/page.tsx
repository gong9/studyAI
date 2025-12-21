'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { 
  ArrowLeft, Send, Loader2, CheckCircle2, Circle, 
  Play, RotateCcw, SkipForward, X,
  Sparkles, Bot, User, ChevronRight, FileText,
  Clock, Zap, BookOpen, Eye, Copy, Check,
  AlertCircle, Coffee, Presentation, ExternalLink
} from 'lucide-react';
import { cn } from '@/lib/utils';

// 动画样式
const fadeIn = "animate-in fade-in duration-300";
const slideUp = "animate-in slide-in-from-bottom-2 duration-300";

// ==================== 类型定义 ====================

interface Task {
  id: string;
  type: string;
  title: string;
  description: string;
  status: 'pending' | 'running' | 'awaiting_confirm' | 'completed' | 'failed' | 'skipped';
  progress?: number;
  result?: any;
  error?: string;
}

interface TaskPlan {
  id: string;
  goal: string;
  chapterTitle: string;
  tasks: Task[];
  currentTaskIndex: number;
  status: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  isTaskCard?: boolean;
  taskPlan?: TaskPlan;
  taskResult?: any;
  isLoading?: boolean;
}

interface ChapterInfo {
  id: string;
  title: string;
}

// ==================== 主组件 ====================

export default function AssistantPage() {
  const params = useParams();
  const router = useRouter();
  const kbId = params.id as string;

  // 状态
  const [chapters, setChapters] = useState<ChapterInfo[]>([]);
  const [selectedChapter, setSelectedChapter] = useState<ChapterInfo | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<TaskPlan | null>(null);
  const [previewContent, setPreviewContent] = useState<string>('');
  const [previewType, setPreviewType] = useState<'markdown' | 'plan' | 'none'>('none');
  const [copied, setCopied] = useState(false);
  const [kbName, setKbName] = useState<string>('');
  const [manuscriptId, setManuscriptId] = useState<string | null>(null);
  
  // 右侧工作区状态
  const [workspaceMode, setWorkspaceMode] = useState<'idle' | 'working' | 'preview'>('idle');
  const [workingLogs, setWorkingLogs] = useState<Array<{id: string; message: string; type: 'info' | 'success' | 'error'; time: string}>>([]);
  const [currentTaskTitle, setCurrentTaskTitle] = useState<string>('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // 加载章节列表和知识库信息
  useEffect(() => {
    fetchChapters();
    fetchKnowledgeBase();
  }, [kbId]);

  const fetchKnowledgeBase = async () => {
    try {
      const res = await fetch(`/api/knowledge-bases/${kbId}`);
      if (res.ok) {
        const data = await res.json();
        setKbName(data.name || '');
      }
    } catch (error) {
      console.error('获取知识库失败:', error);
    }
  };

  // 自动滚动
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 日志自动滚动
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [workingLogs]);

  // 添加工作日志
  const addWorkingLog = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    const log = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      message,
      type,
      time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    };
    setWorkingLogs(prev => [...prev, log]);
  };

  const fetchChapters = async () => {
    try {
      const res = await fetch(`/api/teaching/chapters/${kbId}`);
      if (res.ok) {
        const data = await res.json();
        const flatChapters = flattenChapters(data.chapters || []);
        setChapters(flatChapters);
        if (flatChapters.length > 0) {
          setSelectedChapter(flatChapters[0]);
        }
      }
    } catch (error) {
      console.error('获取章节失败:', error);
    }
  };

  const flattenChapters = (nodes: any[], result: ChapterInfo[] = []): ChapterInfo[] => {
    for (const node of nodes) {
      result.push({ id: node.id, title: node.title });
      if (node.children?.length) {
        flattenChapters(node.children, result);
      }
    }
    return result;
  };

  // 发送消息
  const handleSend = async () => {
    if (!input.trim() || isLoading || !selectedChapter) return;

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: input,
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // 添加助手正在思考的消息
    const thinkingMessage: ChatMessage = {
      id: `msg-${Date.now() + 1}`,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      isLoading: true,
    };
    setMessages(prev => [...prev, thinkingMessage]);

    try {
      // 1. 规划任务
      const planRes = await fetch('/api/teaching/orchestrator/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: input,
          chapterId: selectedChapter.id,
          knowledgeBaseId: kbId,
        }),
      });

      if (!planRes.ok) {
        throw new Error('任务规划失败');
      }

      const planData = await planRes.json();
      const plan = planData.plan as TaskPlan;
      setCurrentPlan(plan);

      // 更新消息：展示任务计划
      setMessages(prev => prev.map(msg => 
        msg.id === thinkingMessage.id 
          ? {
              ...msg,
              content: `好的！我来帮你${input}。\n\n我规划了以下 ${plan.tasks.length} 个步骤：`,
              isLoading: false,
              isTaskCard: true,
              taskPlan: plan,
            }
          : msg
      ));

      // 设置预览
      setWorkspaceMode('preview');
      setPreviewType('plan');
      setPreviewContent(JSON.stringify(plan, null, 2));

    } catch (error: any) {
      setMessages(prev => prev.map(msg =>
        msg.id === thinkingMessage.id
          ? { ...msg, content: `抱歉，${error.message || '出了点问题'}`, isLoading: false }
          : msg
      ));
    } finally {
      setIsLoading(false);
    }
  };

  // 开始执行任务
  // overrideTaskIndex 用于在 confirm 后立即执行下一个任务（避免 setState 异步问题）
  const handleStartExecution = async (overrideTaskIndex?: number) => {
    if (!currentPlan) return;
    
    // 使用传入的 taskIndex 或当前计划的 index（确保是数字类型）
    const taskIndex = (typeof overrideTaskIndex === 'number') ? overrideTaskIndex : currentPlan.currentTaskIndex;
    const isFirstTask = taskIndex === 0;
    
    setIsLoading(true);
    
    // 切换到工作模式（如果是首次执行才清空日志）
    if (isFirstTask) {
      setWorkingLogs([]);
      addWorkingLog('🚀 开始执行任务计划...', 'info');
    }
    setWorkspaceMode('working');
    
    // 只在首次执行时添加消息
    const execMessageId = isFirstTask ? `msg-${Date.now()}` : `msg-exec-${currentPlan.id}`;
    
    if (isFirstTask) {
      const execMessage: ChatMessage = {
        id: execMessageId,
        role: 'assistant',
        content: '正在执行任务...',
        timestamp: new Date().toISOString(),
        isLoading: true,
      };
      setMessages(prev => [...prev, execMessage]);
    } else {
      // 更新现有消息
      setMessages(prev => prev.map(msg => 
        msg.isLoading === false && msg.role === 'assistant' && msg.content?.includes('请查看右侧预览')
          ? { ...msg, isLoading: true, content: '继续执行中...' }
          : msg
      ));
    }

    try {
      const response = await fetch('/api/teaching/orchestrator/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: currentPlan.id,
          fromTaskIndex: taskIndex,  // 使用正确的 taskIndex
        }),
      });

      if (!response.body) {
        throw new Error('No response body');
      }

      // 读取 SSE 流
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data:')) {
            try {
              const eventData = JSON.parse(line.slice(5).trim());
              handleSSEEvent(eventData, execMessageId);
            } catch (e) {
              // ignore parse errors
            }
          }
        }
      }
    } catch (error: any) {
      setMessages(prev => prev.map(msg =>
        msg.id === execMessageId
          ? { ...msg, content: `执行出错: ${error.message}`, isLoading: false }
          : msg
      ));
    } finally {
      setIsLoading(false);
    }
  };

  // 处理 SSE 事件
  const handleSSEEvent = (event: any, messageId: string) => {
    const { type, data, taskId } = event;

    switch (type) {
      case 'task_start':
        // 添加工作日志
        addWorkingLog(`▶ ${data.message}`, 'info');
        setCurrentTaskTitle(data.message?.replace('开始执行: ', '') || '');
        
        setMessages(prev => prev.map(msg =>
          msg.id === messageId
            ? { ...msg, content: `▶ ${data.message}`, isLoading: true }
            : msg
        ));
        // 更新任务状态
        if (currentPlan) {
          const task = currentPlan.tasks.find(t => t.id === taskId);
          if (task) task.status = 'running';
          setCurrentPlan({ ...currentPlan });
        }
        break;

      case 'task_progress':
        // 添加进度日志
        addWorkingLog(`   ${data.message} (${data.progress}%)`, 'info');
        
        setMessages(prev => prev.map(msg =>
          msg.id === messageId
            ? { ...msg, content: `▶ ${data.message} (${data.progress}%)` }
            : msg
        ));
        break;

      case 'task_complete':
      case 'await_confirm':
        // 添加完成日志
        addWorkingLog(`✅ ${data.message}`, 'success');
        
        // 切换到预览模式
        setWorkspaceMode('preview');
        setCurrentTaskTitle('');
        
        // 更新任务状态
        if (currentPlan) {
          const task = currentPlan.tasks.find(t => t.id === taskId);
          if (task) {
            task.status = 'awaiting_confirm';
            task.result = data.result;
          }
          setCurrentPlan({ ...currentPlan });
        }
        
        // 更新消息
        setMessages(prev => prev.map(msg =>
          msg.id === messageId
            ? { 
                ...msg, 
                content: `✅ ${data.message}\n\n请查看右侧预览，确认后继续下一步。`,
                isLoading: false,
                taskResult: data.result,
              }
            : msg
        ));

        // 更新预览
        if (data.result?.data?.markdown) {
          setPreviewType('markdown');
          setPreviewContent(data.result.data.markdown);
        } else if (data.result?.preview) {
          setPreviewType('markdown');
          setPreviewContent(data.result.preview);
        }
        break;

      case 'all_complete':
        addWorkingLog('🎉 所有任务已完成！', 'success');
        setWorkspaceMode('preview');
        
        // 设置 manuscriptId 用于跳转到完整课件页面
        if (data.manuscriptId) {
          setManuscriptId(data.manuscriptId);
        }
        
        setMessages(prev => prev.map(msg =>
          msg.id === messageId
            ? { ...msg, content: '🎉 所有任务已完成！', isLoading: false }
            : msg
        ));
        if (currentPlan) {
          currentPlan.status = 'completed';
          setCurrentPlan({ ...currentPlan });
        }
        break;

      case 'task_error':
      case 'error':
        addWorkingLog(`❌ ${data.message || data.error}`, 'error');
        setWorkspaceMode('preview');
        
        setMessages(prev => prev.map(msg =>
          msg.id === messageId
            ? { ...msg, content: `❌ ${data.message || data.error}`, isLoading: false }
            : msg
        ));
        break;
    }
  };

  // 确认并继续
  const handleConfirm = async (action: 'continue' | 'retry' | 'skip' | 'cancel') => {
    if (!currentPlan) return;

    setIsLoading(true);

    try {
      const res = await fetch('/api/teaching/orchestrator/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: currentPlan.id,
          action,
        }),
      });

      const data = await res.json();

      if (data.success) {
        if ((action === 'continue' || action === 'skip') && data.nextTask) {
          // 切换回工作模式
          setWorkspaceMode('working');
          addWorkingLog(action === 'continue' ? `➡️ 继续执行下一步...` : `⏭️ 已跳过，执行下一步...`, 'info');
          
          // 标记当前任务完成/跳过，更新计划
          const updatedPlan = { ...currentPlan };
          updatedPlan.tasks[updatedPlan.currentTaskIndex].status = action === 'continue' ? 'completed' : 'skipped';
          updatedPlan.currentTaskIndex = data.nextTaskIndex;
          setCurrentPlan(updatedPlan);

          // 继续执行下一个任务（直接传入 nextTaskIndex 避免 setState 异步问题）
          handleStartExecution(data.nextTaskIndex);
        } else if (action === 'retry' && data.nextTask) {
          // 重试当前任务
          setWorkspaceMode('working');
          addWorkingLog(`🔄 正在重试当前任务...`, 'info');
          
          const updatedPlan = { ...currentPlan };
          updatedPlan.tasks[updatedPlan.currentTaskIndex].status = 'pending';
          setCurrentPlan(updatedPlan);
          
          // 重试当前任务（传入当前 taskIndex）
          handleStartExecution(data.taskIndex);
        } else if (data.action === 'complete') {
          // 全部完成
          addWorkingLog(`🎉 所有任务已完成！`, 'success');
          setWorkspaceMode('preview');
          
          setMessages(prev => [...prev, {
            id: `msg-${Date.now()}`,
            role: 'assistant',
            content: '🎉 太好了！所有任务都已完成。你可以在右侧查看最终结果。',
            timestamp: new Date().toISOString(),
          }]);
          
          if (currentPlan) {
            currentPlan.status = 'completed';
            currentPlan.tasks.forEach(t => {
              if (t.status === 'awaiting_confirm') t.status = 'completed';
            });
            setCurrentPlan({ ...currentPlan });
          }
        } else if (action === 'cancel') {
          setWorkspaceMode('idle');
          setCurrentPlan(null);
          setWorkingLogs([]);
          setMessages(prev => [...prev, {
            id: `msg-${Date.now()}`,
            role: 'assistant',
            content: '好的，已取消当前任务。有其他需要帮助的吗？',
            timestamp: new Date().toISOString(),
          }]);
        }
      }
    } catch (error: any) {
      console.error('Confirm error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 获取任务状态图标
  const getTaskIcon = (status: Task['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case 'running':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'awaiting_confirm':
        return <Clock className="w-4 h-4 text-amber-500" />;
      case 'failed':
        return <X className="w-4 h-4 text-red-500" />;
      case 'skipped':
        return <SkipForward className="w-4 h-4 text-zinc-400" />;
      default:
        return <Circle className="w-4 h-4 text-zinc-300" />;
    }
  };

  return (
    <div className="h-screen flex flex-col bg-zinc-50 overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 h-14 bg-white border-b border-zinc-200 px-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push(`/dashboard/teaching/${kbId}`)}
            className="h-8 w-8"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-violet-200">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-zinc-900">AI 教研助手</span>
            <span className="text-xs text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded-full">Manus Mode</span>
          </div>
        </div>
        
        {/* 当前章节显示 */}
        {selectedChapter && (
          <div className="flex items-center gap-2 text-sm">
            <BookOpen className="w-4 h-4 text-zinc-400" />
            <span className="text-zinc-600 font-medium">{selectedChapter.title}</span>
          </div>
        )}
      </header>

      {/* Main Content - Left/Right Split */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧：对话区 */}
        <div className="w-[45%] flex flex-col border-r border-zinc-200 bg-white">
          {/* 消息列表 */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.length === 0 ? (
              <div className={cn("h-full flex flex-col items-center justify-center text-center px-8", fadeIn)}>
                <div className="relative mb-6">
                  <div className="w-20 h-20 bg-gradient-to-br from-violet-500 to-purple-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-violet-200">
                    <Bot className="w-10 h-10 text-white" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-emerald-500 rounded-full flex items-center justify-center border-4 border-white shadow-lg">
                    <Sparkles className="w-3.5 h-3.5 text-white" />
                  </div>
                </div>
                <h3 className="text-xl font-bold text-zinc-800 mb-2">你好！我是 AI 教研小秘书</h3>
                <p className="text-sm text-zinc-500 leading-relaxed max-w-md mb-6">
                  告诉我你想做什么，我会自动规划任务、逐步执行，并在关键步骤请你确认。
                </p>
                
                {/* 章节选择 - 放在这里更醒目 */}
                <div className="w-full max-w-md mb-8">
                  <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
                    📖 选择要处理的章节
                  </label>
                  <select
                    value={selectedChapter?.id || ''}
                    onChange={(e) => {
                      const chapter = chapters.find(c => c.id === e.target.value);
                      setSelectedChapter(chapter || null);
                    }}
                    className="w-full text-base bg-white border-2 border-zinc-200 hover:border-violet-300 rounded-xl px-4 py-3 font-medium text-zinc-800 focus:ring-2 focus:ring-violet-200 focus:border-violet-400 transition-all cursor-pointer"
                  >
                    {chapters.length === 0 ? (
                      <option value="">加载章节中...</option>
                    ) : (
                      chapters.map(c => (
                        <option key={c.id} value={c.id}>{c.title}</option>
                      ))
                    )}
                  </select>
                  {selectedChapter && (
                    <p className="mt-2 text-xs text-zinc-400">
                      知识库: <span className="text-zinc-600">{kbName}</span>
                    </p>
                  )}
                </div>
                
                {/* 快捷操作 */}
                <div className="space-y-3 w-full max-w-md">
                  <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">🚀 快捷指令</p>
                  <div className="flex flex-col gap-2">
                    {[
                      { text: '帮我准备这一章的完整教学材料', icon: '📚' },
                      { text: '生成教学手稿和讲课大纲', icon: '📝' },
                      { text: '制作 PPT 幻灯片', icon: '🎨' },
                    ].map((item, i) => (
                      <button
                        key={i}
                        onClick={() => setInput(item.text)}
                        disabled={!selectedChapter}
                        className={cn(
                          "flex items-center gap-3 px-4 py-3 border rounded-xl text-sm font-medium transition-all text-left group",
                          selectedChapter 
                            ? "bg-white hover:bg-violet-50 border-zinc-200 hover:border-violet-200 text-zinc-700"
                            : "bg-zinc-50 border-zinc-100 text-zinc-400 cursor-not-allowed"
                        )}
                      >
                        <span className="text-lg">{item.icon}</span>
                        <span className="flex-1">{item.text}</span>
                        <ChevronRight className={cn(
                          "w-4 h-4 transition-all",
                          selectedChapter ? "text-zinc-300 group-hover:text-violet-500 group-hover:translate-x-1" : "text-zinc-200"
                        )} />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex gap-3",
                    msg.role === 'user' ? "flex-row-reverse" : "",
                    fadeIn
                  )}
                  style={{ animationDelay: `${idx * 50}ms` }}
                >
                  {/* 头像 */}
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                    msg.role === 'user' 
                      ? "bg-zinc-800" 
                      : "bg-gradient-to-br from-violet-500 to-purple-600"
                  )}>
                    {msg.role === 'user' 
                      ? <User className="w-4 h-4 text-white" />
                      : <Bot className="w-4 h-4 text-white" />
                    }
                  </div>
                  
                  {/* 消息内容 */}
                  <div className={cn(
                    "flex-1 max-w-[85%]",
                    msg.role === 'user' ? "text-right" : ""
                  )}>
                    <div className={cn(
                      "inline-block px-4 py-3 rounded-2xl text-sm leading-relaxed",
                      msg.role === 'user'
                        ? "bg-zinc-800 text-white rounded-tr-none"
                        : "bg-zinc-100 text-zinc-800 rounded-tl-none"
                    )}>
                      {msg.isLoading ? (
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>{msg.content || '思考中...'}</span>
                        </div>
                      ) : (
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                      )}
                    </div>
                    
                    {/* 任务卡片 */}
                    {msg.isTaskCard && msg.taskPlan && (
                      <div className="mt-3 bg-white border border-zinc-200 rounded-xl p-4 shadow-sm">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">任务计划</span>
                          <span className="text-xs text-zinc-400">{msg.taskPlan.tasks.length} 个步骤</span>
                        </div>
                        <div className="space-y-2">
                          {msg.taskPlan.tasks.map((task, idx) => (
                            <div 
                              key={task.id}
                              className={cn(
                                "flex items-center gap-3 p-2 rounded-lg transition-colors",
                                task.status === 'running' && "bg-blue-50",
                                task.status === 'awaiting_confirm' && "bg-amber-50",
                                task.status === 'completed' && "bg-emerald-50"
                              )}
                            >
                              <span className="text-xs font-bold text-zinc-400 w-5">{idx + 1}</span>
                              {getTaskIcon(task.status)}
                              <span className="text-sm text-zinc-700 flex-1">{task.title}</span>
                            </div>
                          ))}
                        </div>
                        
                        {/* 操作按钮 */}
                        {msg.taskPlan.status !== 'completed' && (
                          <div className="mt-4 flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleStartExecution()}
                              disabled={isLoading}
                              className="bg-violet-600 hover:bg-violet-700 text-white gap-2"
                            >
                              <Play className="w-3 h-3" />
                              开始执行
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleConfirm('cancel')}
                              disabled={isLoading}
                            >
                              取消
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* 确认操作栏 */}
          {currentPlan && currentPlan.tasks.some(t => t.status === 'awaiting_confirm') && (
            <div className="flex-shrink-0 p-4 bg-amber-50 border-t border-amber-100">
              <div className="flex items-center justify-between">
                <span className="text-sm text-amber-800 font-medium">
                  ⏳ 等待确认：请查看右侧结果
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleConfirm('skip')}
                    disabled={isLoading}
                    className="gap-1"
                  >
                    <SkipForward className="w-3 h-3" />
                    跳过
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleConfirm('retry')}
                    disabled={isLoading}
                    className="gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    重试
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleConfirm('continue')}
                    disabled={isLoading}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    确认继续
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* 输入区 */}
          <div className="flex-shrink-0 p-4 border-t border-zinc-100 bg-white">
            <div className="flex gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="告诉我你想做什么..."
                className="flex-1 px-4 py-3 bg-zinc-100 border-none rounded-xl text-sm resize-none focus:ring-2 focus:ring-violet-200 focus:bg-white transition-all"
                rows={1}
                disabled={isLoading}
              />
              <Button
                onClick={handleSend}
                disabled={!input.trim() || isLoading || !selectedChapter}
                className="bg-violet-600 hover:bg-violet-700 text-white px-4"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* 右侧：工作区 */}
        <div className="flex-1 flex flex-col bg-zinc-900 text-white">
          {/* 工作区头部 */}
          <div className="flex-shrink-0 h-12 bg-zinc-800 border-b border-zinc-700 px-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {workspaceMode === 'working' ? (
                <>
                  <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                  <span className="text-sm font-medium text-zinc-300">AI 正在工作</span>
                  {currentTaskTitle && (
                    <span className="text-xs text-zinc-500 bg-zinc-700 px-2 py-0.5 rounded">
                      {currentTaskTitle}
                    </span>
                  )}
                </>
              ) : workspaceMode === 'preview' ? (
                <>
                  <Eye className="w-4 h-4 text-zinc-400" />
                  <span className="text-sm font-medium text-zinc-300">结果预览</span>
                </>
              ) : (
                <>
                  <Coffee className="w-4 h-4 text-zinc-500" />
                  <span className="text-sm font-medium text-zinc-500">等待任务</span>
                </>
              )}
            </div>
            {workspaceMode === 'preview' && previewContent && (
              <div className="flex gap-2">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-7 text-xs gap-1 text-zinc-400 hover:text-white hover:bg-zinc-700"
                  onClick={async () => {
                    await navigator.clipboard.writeText(previewContent);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied ? '已复制' : '复制'}
                </Button>
              </div>
            )}
          </div>

          {/* 工作区内容 */}
          <div className="flex-1 overflow-auto">
            {workspaceMode === 'idle' ? (
              /* 空闲状态 */
              <div className={cn("h-full flex flex-col items-center justify-center text-center px-8", fadeIn)}>
                <div className="w-20 h-20 bg-zinc-800 rounded-3xl flex items-center justify-center mb-6 border border-zinc-700">
                  <Bot className="w-10 h-10 text-zinc-600" />
                </div>
                <h3 className="text-base font-semibold text-zinc-400 mb-2">AI 工作区</h3>
                <p className="text-sm text-zinc-500 max-w-xs">
                  开始任务后，这里会实时显示 AI 正在做什么
                </p>
              </div>
            ) : workspaceMode === 'working' ? (
              /* 工作中状态 - 显示实时日志 */
              <div className="h-full flex flex-col">
                {/* 任务进度 */}
                {currentPlan && (
                  <div className="p-4 border-b border-zinc-800">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">任务进度</span>
                      <span className="text-xs text-zinc-500">
                        {currentPlan.tasks.filter(t => t.status === 'completed').length} / {currentPlan.tasks.length}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      {currentPlan.tasks.map((task, idx) => (
                        <div
                          key={task.id}
                          className={cn(
                            "flex-1 h-1.5 rounded-full transition-all",
                            task.status === 'completed' ? "bg-emerald-500" :
                            task.status === 'running' ? "bg-violet-500 animate-pulse" :
                            task.status === 'awaiting_confirm' ? "bg-amber-500" :
                            "bg-zinc-700"
                          )}
                        />
                      ))}
                    </div>
                  </div>
                )}
                
                {/* 实时日志 */}
                <div className="flex-1 p-4 font-mono text-xs overflow-auto">
                  <div className="space-y-1">
                    {workingLogs.map((log) => (
                      <div 
                        key={log.id} 
                        className={cn(
                          "flex gap-2 py-1",
                          fadeIn
                        )}
                      >
                        <span className="text-zinc-600 flex-shrink-0">{log.time}</span>
                        <span className={cn(
                          log.type === 'success' ? "text-emerald-400" :
                          log.type === 'error' ? "text-red-400" :
                          "text-zinc-400"
                        )}>
                          {log.message}
                        </span>
                      </div>
                    ))}
                    <div ref={logsEndRef} />
                  </div>
                </div>
              </div>
            ) : workspaceMode === 'preview' ? (
              /* 预览状态 */
              <div className="p-6 overflow-auto max-h-[calc(100vh-80px)]">
                {previewType === 'markdown' && previewContent && (
                  <div className={cn("bg-zinc-800 rounded-xl border border-zinc-700 p-6", slideUp)}>
                    <pre className="text-sm text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed max-h-[calc(100vh-200px)] overflow-auto">
                      {previewContent}
                    </pre>
                  </div>
                )}
                
                {/* 任务完成 - 跳转到完整课件页面 */}
                {manuscriptId && (
                  <div className={cn("text-center py-12", slideUp)}>
                    <div className="w-20 h-20 bg-gradient-to-br from-emerald-500 to-green-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-emerald-500/30">
                      <CheckCircle2 className="w-10 h-10 text-white" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">🎉 课件生成完成！</h3>
                    <p className="text-zinc-400 mb-8">点击下方按钮查看完整课件，支持演示、AI讲解、导出等功能</p>
                    <Button
                      size="lg"
                      className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white gap-2 px-8"
                      onClick={() => router.push(`/dashboard/teaching/${kbId}/manuscript/${manuscriptId}/preview`)}
                    >
                      <Presentation className="w-5 h-5" />
                      查看完整课件
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  </div>
                )}
                
                {previewType === 'plan' && currentPlan && (
                  <div className={cn("bg-zinc-800 rounded-xl border border-zinc-700 p-6 space-y-4", slideUp)}>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-400" />
                      任务规划
                    </h3>
                    <div className="space-y-3">
                      {currentPlan.tasks.map((task, idx) => (
                        <div key={task.id} className="flex items-center gap-3 p-3 bg-zinc-900/50 rounded-lg">
                          <span className="w-6 h-6 bg-zinc-700 rounded-full flex items-center justify-center text-xs font-bold text-zinc-400">
                            {idx + 1}
                          </span>
                          <span className="flex-1 text-sm text-zinc-300">{task.title}</span>
                          {getTaskIcon(task.status)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>

    </div>
  );
}

