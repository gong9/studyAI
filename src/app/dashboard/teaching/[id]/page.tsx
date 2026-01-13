'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { 
  ArrowLeft, Loader2, ZoomIn, ZoomOut, Maximize2,
  Cpu, FileCheck, Scale, X, Network, Edit3, Terminal, ChevronUp, ChevronDown
} from 'lucide-react';
import BookKnowledgeGraph from '@/components/teaching/BookKnowledgeGraph';
import { OutlineAdjustModal } from '@/components/teaching/OutlineAdjustModal';
import type { ChapterDAG, BookThesis } from '@/lib/book-understanding/types';
import { cn } from '@/lib/utils';

// 工作流组件
import {
  BaseNode,
  ConnectionLine,
  ConnectionLineDefs,
  ModeNode,
  InputNode,
  ParseNode,
  SelectNode,
  ScriptNode,
  PPTNode,
  CourseNode,
  DocumentsModal,
  ChaptersModal,
  ManuscriptModal,
  ManuscriptEditorModal,
  PPTPreviewModal,
  type NodeStatus,
  type NodePosition,
  type SourceMode,
} from '@/components/teaching/workflow';

// ==================== 类型定义 ====================

// 日志条目类型 - 支持 AI Agent 完整思考过程
interface LogEntry {
  id: string;
  timestamp: Date;
  level: 'info' | 'success' | 'warning' | 'error' | 'thinking' | 'planning' | 'executing' | 'step';
  message: string;
  details?: string;
  // AI 思考过程扩展字段
  reasoning?: string;      // AI 推理过程
  decision?: string;       // AI 决策
  progress?: number;       // 进度百分比
  phase?: string;          // 当前阶段
  subSteps?: string[];     // 子步骤列表
}

type ProjectType = 'tech' | 'policy' | 'legal' | 'teaching' | 'k12';

interface TypeConfig {
  icon: React.ComponentType<{ className?: string }>;
  headerSubtitle: string;
}

const TYPE_CONFIGS: Record<ProjectType, TypeConfig> = {
  tech: { icon: Cpu, headerSubtitle: '技术培训' },
  policy: { icon: FileCheck, headerSubtitle: '制度培训' },
  legal: { icon: Scale, headerSubtitle: '普法讲座' },
  teaching: { icon: Cpu, headerSubtitle: '技术培训' },
  k12: { icon: Cpu, headerSubtitle: '技术培训' },
};

interface ChapterNode {
  id: string;
  title: string;
  level: number;
  orderIndex: number;
  contentPreview?: string;
  metadata?: any;
  children: ChapterNode[];
}

interface Manuscript {
  id: string;
  status: string;
  chapterId: string;
  chapterTitle: string;
  teachingPlan?: any;
  hasEnriched: boolean;
  hasSlidev: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Course {
  id: string;
  title: string;
  duration?: number;
}

// ==================== 节点位置配置 ====================
// 采用两行交错布局：上下波浪形，更美观
// 第一行(上): 输入、选择、PPT
// 第二行(下): 模式、解析、手稿、课程

const NODE_POSITIONS: Record<string, NodePosition> = {
  mode: { x: 60, y: 200 },       // 下
  input: { x: 320, y: 60 },      // 上
  parse: { x: 580, y: 240 },     // 下
  select: { x: 880, y: 60 },     // 上
  script: { x: 1160, y: 240 },   // 下
  ppt: { x: 1420, y: 60 },       // 上
  course: { x: 1680, y: 200 },   // 下
};

const NODE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  mode: { width: 200, height: 160 },
  input: { width: 260, height: 180 },
  parse: { width: 260, height: 180 },
  select: { width: 240, height: 180 },
  script: { width: 280, height: 200 },
  ppt: { width: 240, height: 160 },
  course: { width: 260, height: 200 },
};

// 连接配置 - 线性流程，波浪形连接
const CONNECTIONS = [
  { from: 'mode', to: 'input' },
  { from: 'input', to: 'parse' },
  { from: 'parse', to: 'select' },
  { from: 'select', to: 'script' },
  { from: 'script', to: 'ppt' },
  { from: 'ppt', to: 'course' },
];

// 碎片模式跳过连接
const SKIP_CONNECTION = { from: 'input', to: 'script', label: '直接创作' };

// ==================== 画布控制组件 ====================

function CanvasControls({ 
  zoom, 
  onZoomIn, 
  onZoomOut, 
  onReset 
}: {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}) {
  return (
    <div className="absolute bottom-6 right-6 flex items-center gap-2 z-20">
      <div className="flex items-center bg-white/90 backdrop-blur border border-zinc-200 rounded-xl overflow-hidden shadow-lg">
        <button
          onClick={onZoomOut}
          className="p-2 hover:bg-zinc-100 text-zinc-500 hover:text-zinc-900 transition-colors"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="px-3 text-xs text-zinc-600 font-mono border-x border-zinc-200">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={onZoomIn}
          className="p-2 hover:bg-zinc-100 text-zinc-500 hover:text-zinc-900 transition-colors"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
      </div>
      <button
        onClick={onReset}
        className="p-2 bg-white/90 backdrop-blur border border-zinc-200 rounded-xl hover:bg-zinc-100 text-zinc-500 hover:text-zinc-900 transition-colors shadow-lg"
      >
        <Maximize2 className="w-4 h-4" />
      </button>
    </div>
  );
}

// ==================== 终端日志面板（简洁版） ====================

function LogPanel({ 
  logs, 
  isExpanded, 
  onToggle,
  onClear 
}: { 
  logs: LogEntry[];
  isExpanded: boolean;
  onToggle: () => void;
  onClear: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current && isExpanded) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, isExpanded]);
  
  const getLevelInfo = (level: LogEntry['level']) => {
    switch (level) {
      case 'success': return { color: 'text-emerald-400', label: '完成' };
      case 'warning': return { color: 'text-amber-400', label: '警告' };
      case 'error': return { color: 'text-red-400', label: '错误' };
      case 'thinking': return { color: 'text-purple-400', label: '推理' };
      case 'planning': return { color: 'text-blue-400', label: '决策' };
      case 'executing': return { color: 'text-cyan-400', label: '执行' };
      case 'step': return { color: 'text-zinc-400', label: '步骤' };
      default: return { color: 'text-zinc-400', label: '' };
    }
  };
  
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('zh-CN', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  };

  // 获取显示内容（优先显示 reasoning/decision，否则显示 message）
  const getDisplayContent = (log: LogEntry) => {
    if (log.reasoning) return log.reasoning;
    if (log.decision) return log.decision;
    // 移除消息中的重复 emoji
    return log.message.replace(/^[🧠📋⚡→✓✗⚠🚀]\s*/, '');
  };

  // 渲染单条日志 - Grid 布局确保完美对齐
  const renderLogEntry = (log: LogEntry) => {
    const { color, label } = getLevelInfo(log.level);
    const content = getDisplayContent(log);
    
    return (
      <div key={log.id} className="py-1 font-mono text-sm leading-relaxed">
        <div 
          className="grid items-start gap-x-3"
          style={{ gridTemplateColumns: '70px 36px 1fr auto' }}
        >
          {/* 时间戳 */}
          <span className="text-zinc-600 text-xs">
            {formatTime(log.timestamp)}
          </span>
          
          {/* 中文类型标签 */}
          <span className={cn("text-xs", color)}>
            {label}
          </span>
          
          {/* 内容 */}
          <span className={cn("whitespace-pre-wrap", color)}>
            {content}
          </span>
          
          {/* 进度 */}
          <span className="text-zinc-500 text-xs">
            {log.progress !== undefined && log.progress < 100 ? `${log.progress}%` : ''}
          </span>
        </div>
        
        {/* 详情 */}
        {log.details && (
          <div 
            className="text-xs text-zinc-500 mt-0.5"
            style={{ marginLeft: '118px' }}
          >
            {log.details}
          </div>
        )}
        
        {/* 子步骤 */}
        {log.subSteps && log.subSteps.length > 0 && (
          <div className="mt-1 space-y-0.5" style={{ marginLeft: '118px' }}>
            {log.subSteps.map((step, i) => (
              <div key={i} className="text-xs text-zinc-500">
                - {step}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={cn(
      "bg-gradient-to-b from-zinc-800 to-zinc-900 border-t border-zinc-700/50 transition-all duration-300 ease-out flex flex-col shadow-2xl",
      isExpanded ? "h-[280px]" : "h-10"
    )}>
      {/* 标题栏 - Agent 控制台风格 */}
      <div 
        className="h-10 px-4 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors flex-shrink-0 border-b border-zinc-700/30"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          {/* macOS 风格的红绿灯按钮 */}
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/80 hover:bg-red-500 transition-colors" />
            <div className="w-3 h-3 rounded-full bg-amber-500/80 hover:bg-amber-500 transition-colors" />
            <div className="w-3 h-3 rounded-full bg-emerald-500/80 hover:bg-emerald-500 transition-colors" />
          </div>
          <div className="w-px h-4 bg-zinc-700/50 mx-1" />
          <Terminal className="w-3.5 h-3.5 text-zinc-500" />
          <span className="text-xs font-medium text-zinc-400 tracking-wide">AI Agent 控制台</span>
          {logs.length > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] font-mono bg-emerald-500/20 text-emerald-400 rounded">
              {logs.length}
            </span>
          )}
          {/* 正在执行指示器 */}
          {logs.some(l => l.level === 'executing' || l.level === 'thinking') && (
            <span className="flex items-center gap-1.5 px-2 py-0.5 text-[10px] bg-purple-500/20 text-purple-400 rounded">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
              Agent 运行中
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isExpanded && logs.length > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); onClear(); }}
              className="text-[10px] text-zinc-500 hover:text-zinc-300 px-2 py-0.5 rounded hover:bg-white/10 transition-colors font-mono"
            >
              clear
            </button>
          )}
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-zinc-600" />
          ) : (
            <ChevronUp className="w-4 h-4 text-zinc-600" />
          )}
        </div>
      </div>
      
      {/* 日志内容 - AI Agent 风格 */}
      {isExpanded && (
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto font-mono text-[12px] p-3 space-y-0.5"
          style={{ 
            background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.2) 100%)'
          }}
        >
          {logs.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="text-4xl mb-3 opacity-20">🤖</div>
                <div className="text-zinc-500 mb-1">AI Agent 待命中</div>
                <div className="text-zinc-600 text-xs">执行操作时将显示 AI 思考过程和执行日志</div>
              </div>
            </div>
          ) : (
            logs.map(renderLogEntry)
          )}
          {/* 光标闪烁效果 */}
          <div className="flex items-center gap-2 pt-2 pl-3">
            <span className="text-emerald-500">$</span>
            <span className="w-2 h-4 bg-emerald-500/70 animate-pulse" />
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== 主页面 ====================

export default function TeachingWorkflowPage() {
  const params = useParams();
  const router = useRouter();
  const kbId = params.id as string;
  const containerRef = useRef<HTMLDivElement>(null);

  // 画布状态
  const [zoom, setZoom] = useState(0.8);
  const [panX, setPanX] = useState(100);
  const [panY, setPanY] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [canvasReady, setCanvasReady] = useState(true);

  // 数据状态
  const [kb, setKb] = useState<any>(null);
  const [chapters, setChapters] = useState<ChapterNode[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [manuscripts, setManuscripts] = useState<Manuscript[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  // 操作状态
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatingPPT, setGeneratingPPT] = useState(false);
  const [publishingCourse, setPublishingCourse] = useState(false);
  const [extractProgress, setExtractProgress] = useState(0);
  const [generateProgress, setGenerateProgress] = useState(0);

  // 选中状态
  const [selectedChapter, setSelectedChapter] = useState<ChapterNode | null>(null);
  const [selectedManuscript, setSelectedManuscript] = useState<Manuscript | null>(null);

  // 弹窗状态
  const [showDocumentsModal, setShowDocumentsModal] = useState(false);
  const [showChaptersModal, setShowChaptersModal] = useState(false);
  const [showManuscriptModal, setShowManuscriptModal] = useState(false);
  const [showManuscriptEditor, setShowManuscriptEditor] = useState(false);
  const [editingManuscriptId, setEditingManuscriptId] = useState<string | null>(null);
  const [showKnowledgeGraph, setShowKnowledgeGraph] = useState(false);
  const [showOutlineAdjust, setShowOutlineAdjust] = useState(false);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [showPPTPreview, setShowPPTPreview] = useState(false);

  // 知识图谱
  const [chapterDAG, setChapterDAG] = useState<ChapterDAG | null>(null);
  const [bookThesis, setBookThesis] = useState<BookThesis | null>(null);

  // 粘贴手稿
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteContent, setPasteContent] = useState('');
  const [pasting, setPasting] = useState(false);
  
  // 日志面板
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logPanelExpanded, setLogPanelExpanded] = useState(true);
  
  // 添加日志的辅助函数 - 支持 AI Agent 完整思考过程
  const addLog = useCallback((
    level: LogEntry['level'], 
    message: string, 
    options?: {
      details?: string;
      reasoning?: string;
      decision?: string;
      progress?: number;
      phase?: string;
      subSteps?: string[];
    }
  ) => {
    const newLog: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      level,
      message,
      details: options?.details,
      reasoning: options?.reasoning,
      decision: options?.decision,
      progress: options?.progress,
      phase: options?.phase,
      subSteps: options?.subSteps,
    };
    setLogs(prev => [...prev, newLog]);
  }, []);
  
  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);
  
  // 配置
  const sourceMode = (kb?.sourceMode || 'book') as SourceMode;
  const typeConfig = TYPE_CONFIGS[(kb?.type || 'tech') as ProjectType] || TYPE_CONFIGS.tech;
  const TypeIcon = typeConfig.icon;

  // ==================== 数据获取 ====================

  const fetchKnowledgeBase = useCallback(async () => {
    try {
      const res = await fetch(`/api/knowledge-bases/${kbId}`);
      if (res.ok) {
        const data = await res.json();
        setKb(data);
        setDocuments(data.documents || []);
      }
    } catch (error) {
      console.error('获取知识库失败:', error);
    }
  }, [kbId]);

  const fetchChapters = useCallback(async () => {
    try {
      const res = await fetch(`/api/teaching/chapters/${kbId}`);
      if (res.ok) {
        const data = await res.json();
        setChapters(data.chapters || []);
        if (data.chapters?.length > 0) {
          buildDAGFromChapters(data.chapters);
        }
      }
    } catch (error) {
      console.error('获取章节失败:', error);
    }
  }, [kbId]);

  const fetchManuscripts = useCallback(async () => {
    try {
      const res = await fetch(`/api/teaching/manuscripts/${kbId}`);
      if (res.ok) {
        const data = await res.json();
        setManuscripts(data.manuscripts || []);
      }
    } catch (error) {
      console.error('获取手稿列表失败:', error);
    }
  }, [kbId]);

  const fetchCourses = useCallback(async () => {
    try {
      const res = await fetch(`/api/teaching/courses/${kbId}`);
      if (res.ok) {
        const data = await res.json();
        setCourses(data.courses || []);
      }
    } catch (error) {
      // 课程API可能不存在，忽略错误
    }
  }, [kbId]);

  useEffect(() => {
    Promise.all([
      fetchKnowledgeBase(),
      fetchChapters(),
      fetchManuscripts(),
      fetchCourses(),
    ]).finally(() => setLoading(false));
  }, [fetchKnowledgeBase, fetchChapters, fetchManuscripts, fetchCourses]);

  // ==================== 知识图谱构建 ====================

  const buildDAGFromChapters = (chaptersData: ChapterNode[]) => {
    const flattenChapters = (nodes: ChapterNode[]): ChapterNode[] => {
      const result: ChapterNode[] = [];
      for (const node of nodes) {
        result.push(node);
        if (node.children?.length > 0) {
          result.push(...flattenChapters(node.children));
        }
      }
      return result;
    };

    const allChapters = flattenChapters(chaptersData);
    if (allChapters.length === 0) return;
    
    const nodes = allChapters.map((ch) => ({
      id: ch.id,
      title: ch.title,
      role: (ch.metadata?.role || 'core') as 'core' | 'foundation' | 'extension' | 'reference',
      weight: ch.metadata?.role === 'core' ? 1 : ch.metadata?.role === 'foundation' ? 0.8 : 0.6,
    }));

    const edges: Array<{ from: string; to: string; type: 'prerequisite' | 'parallel' | 'supplement' }> = [];
      for (let i = 1; i < allChapters.length; i++) {
      edges.push({ from: allChapters[i - 1].id, to: allChapters[i].id, type: 'prerequisite' });
    }

    setChapterDAG({ nodes, edges });
  };

  // ==================== 操作处理 ====================

  const handleFileUpload = async (files: FileList) => {
    if (sourceMode === 'book' && documents.length > 0) {
      alert('书籍模式只支持一本书，请先删除现有文档');
        return;
    }

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('knowledgeBaseId', kbId);
        const res = await fetch('/api/documents/upload', { method: 'POST', body: formData });
        if (!res.ok) throw new Error('上传失败');
        const doc = await res.json();
        
        // 使用 SSE 监听文档处理进度
        startDocumentProcessingSSE(doc.id);
      }
      await fetchKnowledgeBase();
      setShowDocumentsModal(false);
    } catch (error) {
      console.error('上传失败:', error);
      alert('上传失败，请重试');
    } finally {
      setUploading(false);
    }
  };

  // SSE 监听文档处理进度
  const startDocumentProcessingSSE = (docId: string) => {
    const eventSource = new EventSource(`/api/documents/${docId}/process`);
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[SSE] Document processing:', data);
        
        // 更新文档状态
        if (data.status === 'completed' || data.type === 'complete') {
          // 处理完成，更新文档列表
          setDocuments(prev => prev.map(d => 
            d.id === docId ? { ...d, status: 'completed' } : d
          ));
          eventSource.close();
        } else if (data.status === 'processing') {
          // 处理中，更新进度（可选）
          setDocuments(prev => prev.map(d => 
            d.id === docId ? { ...d, status: 'processing', progress: data.progress } : d
          ));
        } else if (data.status === 'error' || data.type === 'error') {
          // 处理失败
          setDocuments(prev => prev.map(d => 
            d.id === docId ? { ...d, status: 'error' } : d
          ));
          eventSource.close();
        }
      } catch (e) {
        console.error('[SSE] Parse error:', e);
      }
    };
    
    eventSource.onerror = (error) => {
      console.error('[SSE] Connection error:', error);
      eventSource.close();
      // 连接错误时刷新状态
      fetchKnowledgeBase();
    };
  };

  const handleExtractChapters = async () => {
    setExtracting(true);
    setExtractProgress(10);

    try {
      const endpoint = sourceMode === 'book' 
        ? '/api/book-understanding/skim'
        : '/api/teaching/extract-chapters';
      
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ knowledgeBaseId: kbId }),
      });

      setExtractProgress(80);
        const data = await res.json();

      if (res.ok && data.success) {
        if (data.chapterDAG) setChapterDAG(data.chapterDAG);
        if (data.thesis) setBookThesis(data.thesis);
      await fetchChapters();
        setExtractProgress(100);
      } else {
        throw new Error(data.error || '解析失败');
      }
    } catch (error: any) {
      console.error('解析失败:', error);
      alert(error.message || '解析失败');
    } finally {
      setExtracting(false);
      setExtractProgress(0);
    }
  };

  const handleSelectChapter = (chapter: ChapterNode) => {
    setSelectedChapter(chapter);
    setShowChaptersModal(false);
  };

  const getSceneType = () => {
    const kbType = kb?.type || 'tech';
    if (kbType === 'policy') return 'company_training';
    if (kbType === 'legal') return 'legal_training';
    return 'tech_training';
  };

  const handleGenerate = async () => {
    if (!selectedChapter) {
      alert('请先选择章节');
        return;
      }
      
    setGenerating(true);
    setGenerateProgress(10);
    setLogPanelExpanded(true);
    
    // Phase 1: 启动
    addLog('executing', '📝 启动 TeachingAgent 手稿生成', {
      details: `章节: ${selectedChapter.title}`,
      progress: 10,
      phase: 'initialization'
    });

    try {
      // Phase 2: 规划阶段
      addLog('thinking', '分析章节内容...', {
        reasoning: '识别核心知识点、教学目标、内容难度',
        subSteps: [
          '提取章节关键概念',
          '分析知识点依赖关系',
          '评估内容复杂度'
        ],
        phase: 'content_analysis'
      });
      
      addLog('planning', '制定教学规划', {
        reasoning: '基于内容分析，规划手稿结构和讲解策略',
        phase: 'teaching_plan'
      });
      
      const planRes = await fetch('/api/teaching/manuscript/plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterId: selectedChapter.id, sceneType: getSceneType() }),
      });
      if (!planRes.ok) throw new Error('规划失败');
      const planData = await planRes.json();
      setGenerateProgress(40);

      addLog('step', '教学规划完成', {
        progress: 40,
        decision: `将生成 ${planData.pageCount || '?'} 页幻灯片手稿`,
        phase: 'plan_complete'
      });

      // Phase 3: 内容生成
      addLog('executing', '生成手稿内容', {
        reasoning: '根据教学规划，逐页生成 Slidev 格式的手稿内容',
        progress: 50,
        phase: 'content_generation'
      });
      
      const draftRes = await fetch('/api/teaching/manuscript/draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manuscriptId: planData.manuscriptId }),
      });
      if (!draftRes.ok) throw new Error('生成失败');
      setGenerateProgress(100);
      
      addLog('success', '✨ 手稿生成完成', {
        progress: 100,
        subSteps: [
          '教学结构规划完成',
          '内容生成完成',
          '可进入编辑器进行调整'
        ],
        phase: 'completed'
      });

      await fetchManuscripts();
      setEditingManuscriptId(planData.manuscriptId);
      setShowManuscriptEditor(true);
      } catch (error: any) {
      console.error('生成失败:', error);
      addLog('error', '手稿生成失败', { details: error.message });
      alert(error.message || '生成失败');
      } finally {
      setGenerating(false);
      setGenerateProgress(0);
      }
  };
    
  const handleCreateBlank = async () => {
      try {
      const res = await fetch('/api/teaching/manuscript/create-blank', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ knowledgeBaseId: kbId }),
        });
      if (!res.ok) throw new Error('创建失败');
        const data = await res.json();
      await fetchManuscripts();
      // 打开编辑器弹窗而不是跳转页面
      setEditingManuscriptId(data.manuscriptId);
      setShowManuscriptEditor(true);
      } catch (error: any) {
      console.error('创建失败:', error);
      alert(error.message || '创建失败');
    }
  };

  const handlePasteSubmit = async () => {
    if (!pasteContent.trim()) {
      alert('请输入内容');
      return;
    }
    
    setPasting(true);
    try {
      const title = pasteTitle.trim() || `手稿_${new Date().toLocaleDateString()}`;
      const res = await fetch('/api/documents/paste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ knowledgeBaseId: kbId, title, content: pasteContent }),
      });
      if (!res.ok) throw new Error('保存失败');
      
      await fetchKnowledgeBase();
      setShowPasteModal(false);
      setPasteTitle('');
      setPasteContent('');
    } catch (error: any) {
      console.error('保存失败:', error);
      alert(error.message || '保存失败');
    } finally {
      setPasting(false);
    }
  };

  // ==================== 节点状态计算 ====================

  // 检查所有文档是否都已处理完成
  const allDocumentsReady = documents.length > 0 && documents.every(d => d.status === 'completed');
  const hasDocumentsProcessing = documents.some(d => d.status !== 'completed');

  const getNodeStatus = (nodeId: string): NodeStatus => {
    switch (nodeId) {
      case 'mode':
        return 'completed';
      case 'input':
        if (uploading) return 'processing';
        if (documents.length === 0) return 'ready';
        // 有文档但未全部就绪 = processing，全部就绪 = completed
        return hasDocumentsProcessing ? 'processing' : 'completed';
      case 'parse':
        if (extracting) return 'processing';
        if (chapters.length > 0) return 'completed';
        // 只有当所有文档都就绪后才可以解析
        return allDocumentsReady ? 'ready' : 'pending';
      case 'select':
        // 有手稿说明章节已经选过了
        if (manuscripts.length > 0) return 'completed';
        if (selectedChapter) return 'completed';
        return chapters.length > 0 ? 'ready' : 'pending';
      case 'script':
        if (generating) return 'processing';
        // 有手稿就显示为 completed，用户可以选择
        if (manuscripts.length > 0) return 'completed';
        return chapters.length > 0 ? 'ready' : 'pending';
      case 'ppt':
        // 基于选择的手稿判断状态
        if (generatingPPT) return 'processing';
        if (selectedManuscript?.hasSlidev) return 'completed';
        return selectedManuscript ? 'ready' : 'pending';
      case 'course':
        if (publishingCourse) return 'processing';
        if (courses.length > 0) return 'completed';
        return selectedManuscript?.hasSlidev ? 'ready' : 'pending';
      default:
        return 'pending';
    }
  };

  // ==================== 画布交互 ====================

  useEffect(() => {
    // 延迟计算画布位置，确保容器已挂载
    const timer = setTimeout(() => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        setPanX(Math.max(20, (width - 2000 * zoom) / 2));
        setPanY(Math.max(20, (height - 500 * zoom) / 2));
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [zoom]);

  const handleWheel = useCallback((e: WheelEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-scrollable]')) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.min(Math.max(z * delta, 0.3), 1.5));
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
      return () => container.removeEventListener('wheel', handleWheel);
    }
  }, [handleWheel]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - panX, y: e.clientY - panY });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPanX(e.clientX - dragStart.x);
      setPanY(e.clientY - dragStart.y);
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  // ==================== 渲染 ====================

  if (loading) {
      return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
        </div>
      );
  }

  return (
    <div className="h-screen flex flex-col bg-zinc-100 text-zinc-900 overflow-hidden">
      {/* 顶部导航 - 简洁版 */}
      <nav className="relative z-20 border-b border-zinc-200 bg-white/80 backdrop-blur-xl flex-shrink-0">
        <div className="max-w-full px-6 h-14 flex items-center">
          <button 
              onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 text-zinc-500 hover:text-zinc-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">返回</span>
          </button>
          
          {/* 居中标题 */}
          <div className="flex-1 flex items-center justify-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-zinc-900 flex items-center justify-center">
              <TypeIcon className="w-4 h-4 text-white" />
              </div>
            <div>
              <h1 className="text-sm font-bold text-zinc-900">{kb?.name || '项目详情'}</h1>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{typeConfig.headerSubtitle}</p>
            </div>
          </div>
          
          {/* 右侧占位保持平衡 */}
          <div className="w-16" />
          </div>
      </nav>

      {/* 主内容区域 - 画布 + 终端 */}
      <div className="flex-1 flex flex-col overflow-hidden">
      {/* 画布 */}
      <div
        ref={containerRef}
          className="flex-1 relative overflow-hidden cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* 网格背景 */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(to right, #e4e4e7 1px, transparent 1px),
              linear-gradient(to bottom, #e4e4e7 1px, transparent 1px)
            `,
            backgroundSize: '24px 24px',
            opacity: 0.5,
          }}
        />

        {/* 画布内容 */}
        <motion.div
          className="absolute"
          style={{
            width: '2100px',
            height: '520px',
            transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
            transformOrigin: '0 0',
            opacity: canvasReady ? 1 : 0,
            transition: 'opacity 0.15s ease-out',
          }}
        >
          {/* SVG 连接线 */}
          <svg className="absolute inset-0 pointer-events-none" style={{ width: '2100px', height: '520px' }}>
            <ConnectionLineDefs />
            
            {/* 主连接线 */}
            {CONNECTIONS.map((conn) => (
              <ConnectionLine
                key={`${conn.from}-${conn.to}`}
                from={NODE_POSITIONS[conn.from]}
                to={NODE_POSITIONS[conn.to]}
                fromDimensions={NODE_DIMENSIONS[conn.from]}
                toDimensions={NODE_DIMENSIONS[conn.to]}
                fromStatus={getNodeStatus(conn.from)}
                toStatus={getNodeStatus(conn.to)}
              />
            ))}

            {/* 碎片模式跳过连接 */}
            {sourceMode === 'fragments' && (
              <ConnectionLine
                from={NODE_POSITIONS[SKIP_CONNECTION.from]}
                to={NODE_POSITIONS[SKIP_CONNECTION.to]}
                fromDimensions={NODE_DIMENSIONS[SKIP_CONNECTION.from]}
                toDimensions={NODE_DIMENSIONS[SKIP_CONNECTION.to]}
                fromStatus={getNodeStatus(SKIP_CONNECTION.from)}
                toStatus={getNodeStatus(SKIP_CONNECTION.to)}
                isDashed
                label={SKIP_CONNECTION.label}
              />
            )}
          </svg>

          {/* 节点 */}
          <div className="absolute" style={{ left: NODE_POSITIONS.mode.x, top: NODE_POSITIONS.mode.y }}>
            <ModeNode sourceMode={sourceMode} dimensions={NODE_DIMENSIONS.mode} />
            </div>

          <div className="absolute" style={{ left: NODE_POSITIONS.input.x, top: NODE_POSITIONS.input.y }}>
            <InputNode
              status={getNodeStatus('input')}
              documents={documents}
              sourceMode={sourceMode}
              onUpload={() => setShowDocumentsModal(true)}
              onPaste={() => setShowPasteModal(true)}
              onClick={() => setShowDocumentsModal(true)}
              dimensions={NODE_DIMENSIONS.input}
            />
                </div>

          <div className="absolute" style={{ left: NODE_POSITIONS.parse.x, top: NODE_POSITIONS.parse.y }}>
            <ParseNode
              status={getNodeStatus('parse')}
              sourceMode={sourceMode}
              chapterCount={chapters.length}
              progress={extractProgress}
              onParse={handleExtractChapters}
              onSkip={handleCreateBlank}
              onViewGraph={() => setShowKnowledgeGraph(true)}
              onAdjust={() => setShowOutlineAdjust(true)}
              onClick={() => chapterDAG && setShowKnowledgeGraph(true)}
              dimensions={NODE_DIMENSIONS.parse}
            />
                            </div>

          <div className="absolute" style={{ left: NODE_POSITIONS.select.x, top: NODE_POSITIONS.select.y }}>
            <SelectNode
              status={getNodeStatus('select')}
              chapters={chapters}
              selectedChapter={selectedChapter}
              onClick={() => setShowChaptersModal(true)}
              dimensions={NODE_DIMENSIONS.select}
            />
                            </div>

          <div className="absolute" style={{ left: NODE_POSITIONS.script.x, top: NODE_POSITIONS.script.y }}>
            <ScriptNode
              status={getNodeStatus('script')}
              manuscripts={manuscripts}
              selectedManuscript={selectedManuscript}
              selectedChapterTitle={selectedChapter?.title}
              progress={generateProgress}
              onSelect={(m) => setSelectedManuscript(m)}
              onEdit={(m) => {
                setEditingManuscriptId(m.id);
                setShowManuscriptEditor(true);
              }}
              onGenerate={handleGenerate}
              onClick={() => setShowManuscriptModal(true)}
              dimensions={NODE_DIMENSIONS.script}
            />
                                  </div>

          <div className="absolute" style={{ left: NODE_POSITIONS.ppt.x, top: NODE_POSITIONS.ppt.y }}>
            <PPTNode
              status={getNodeStatus('ppt')}
              hasSlidev={selectedManuscript?.hasSlidev || false}
              onGenerate={async () => {
                if (!selectedManuscript) {
                  alert('请先选择一份手稿');
                  return;
                }
                setGeneratingPPT(true);
                setLogPanelExpanded(true);
                clearLogs();
                
                try {
                  // 使用流式 API 获取真实的 AI 思考过程
                  const response = await fetch(`/api/teaching/manuscript/${selectedManuscript.id}/render-stream`, {
                    method: 'POST',
                  });
                  
                  if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error || 'PPT 生成失败');
                  }
                  
                  const reader = response.body?.getReader();
                  if (!reader) throw new Error('无法读取响应流');
                  
                  const decoder = new TextDecoder();
                  let buffer = '';
                  
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n\n');
                    buffer = lines.pop() || '';
                    
                    for (const line of lines) {
                      if (line.startsWith('data: ')) {
                        try {
                          const event = JSON.parse(line.slice(6));
                          
                          // 根据事件类型添加日志（简洁中文风格）
                          switch (event.type) {
                            case 'start':
                              addLog('executing', event.message || event.content, {
                                details: event.manuscriptTitle,
                              });
                              break;
                            case 'thinking':
                              // 直接显示推理内容
                              addLog('thinking', event.content || event.reasoning || event.message);
                              break;
                            case 'planning':
                              // 直接显示决策内容
                              addLog('planning', event.content || event.decision || event.message);
                              break;
                            case 'executing':
                              addLog('executing', event.content || event.message, {
                                progress: event.progress,
                              });
                              break;
                            case 'step':
                              addLog('step', event.content || event.message, {
                                details: event.details,
                              });
                              break;
                            case 'warning':
                              addLog('warning', event.message, {
                                details: event.error,
                              });
                              break;
                            case 'complete':
                              addLog('success', event.message, {
                                details: `${event.total_count || event.slideCount} 页幻灯片，${event.decorated_count || event.decoratedCount || 0} 个信息图`,
                              });
                              break;
                            case 'error':
                              addLog('error', event.message, { details: event.error });
                              break;
                          }
                        } catch (e) {
                          // 解析失败忽略
                        }
                      }
                    }
                  }
                  
                    await fetchManuscripts();
                    const updated = manuscripts.find(m => m.id === selectedManuscript.id);
                    if (updated) setSelectedManuscript({ ...updated, hasSlidev: true });
                  
                } catch (error: any) {
                  addLog('error', 'PPT 生成失败', { details: error.message });
                } finally {
                  setGeneratingPPT(false);
                }
              }}
              onPreview={() => {
                if (selectedManuscript) {
                  setShowPPTPreview(true);
                }
              }}
              onCreateCourse={async () => {
                if (!selectedManuscript) {
                  alert('请先选择手稿');
                  return;
                }
                if (!selectedManuscript.hasSlidev) {
                  alert('请先生成PPT');
                  return;
                }
                
                setPublishingCourse(true);
                setLogPanelExpanded(true);
                clearLogs();
                
                try {
                  // 使用流式 API 获取真实进度
                  const response = await fetch(`/api/teaching/manuscript/${selectedManuscript.id}/publish-stream`, {
                    method: 'POST',
                  });
                  
                  if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error || '课程生成失败');
                  }
                  
                  const reader = response.body?.getReader();
                  if (!reader) throw new Error('无法读取响应流');
                  
                  const decoder = new TextDecoder();
                  let buffer = '';
                  
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n\n');
                    buffer = lines.pop() || '';
                    
                    for (const line of lines) {
                      if (line.startsWith('data: ')) {
                        try {
                          const event = JSON.parse(line.slice(6));
                          
                          switch (event.type) {
                            case 'start':
                              addLog('executing', event.message, {
                                details: event.manuscriptTitle,
                                phase: event.phase
                              });
                              break;
                            case 'thinking':
                              addLog('thinking', event.message, {
                                reasoning: event.reasoning,
                                phase: event.phase
                              });
                              break;
                            case 'planning':
                              addLog('planning', event.message, {
                                reasoning: event.reasoning,
                                phase: event.phase
                              });
                              break;
                            case 'executing':
                              addLog('executing', event.message, {
                                reasoning: event.reasoning,
                                progress: event.progress,
                                phase: event.phase
                              });
                              break;
                            case 'step':
                              addLog('step', event.message, {
                                details: event.details,
                                phase: event.phase
                              });
                              break;
                            case 'warning':
                              addLog('warning', event.message, {
                                details: event.details
                              });
                              break;
                            case 'complete':
                              if (event.isExisting) {
                                addLog('success', event.message, { details: '可直接播放' });
                              } else {
                                addLog('success', event.message, {
                                  details: `${event.audioCount} 段语音，总时长约 ${event.durationText}`,
                                  phase: event.phase
                                });
                              }
                              await fetchCourses();
                              break;
                            case 'error':
                              addLog('error', event.message, { details: event.error });
                              break;
                          }
                        } catch (e) {
                          // 解析失败忽略
                        }
                      }
                    }
                  }
                  
                } catch (error: any) {
                  addLog('error', '生成课程失败', { details: error.message });
                } finally {
                  setPublishingCourse(false);
                }
              }}
              dimensions={NODE_DIMENSIONS.ppt}
            />
                            </div>

          <div className="absolute" style={{ left: NODE_POSITIONS.course.x, top: NODE_POSITIONS.course.y }}>
            <CourseNode
              status={getNodeStatus('course')}
              courses={courses}
              progress={publishingCourse ? 50 : undefined}
              onGenerate={async () => {
                if (!selectedManuscript) {
                  alert('请先选择手稿');
                  return;
                }
                if (!selectedManuscript.hasSlidev) {
                  alert('请先生成PPT');
                  return;
                }
                
                setPublishingCourse(true);
                setLogPanelExpanded(true);
                clearLogs();
                
                try {
                  // 使用流式 API 获取真实进度
                  const response = await fetch(`/api/teaching/manuscript/${selectedManuscript.id}/publish-stream`, {
                    method: 'POST',
                  });
                  
                  if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error || '课程生成失败');
                  }
                  
                  const reader = response.body?.getReader();
                  if (!reader) throw new Error('无法读取响应流');
                  
                  const decoder = new TextDecoder();
                  let buffer = '';
                  
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n\n');
                    buffer = lines.pop() || '';
                    
                    for (const line of lines) {
                      if (line.startsWith('data: ')) {
                        try {
                          const event = JSON.parse(line.slice(6));
                          
                          switch (event.type) {
                            case 'start':
                              addLog('executing', event.message, {
                                details: event.manuscriptTitle,
                                phase: event.phase
                              });
                              break;
                            case 'thinking':
                              addLog('thinking', event.message, {
                                reasoning: event.reasoning,
                                phase: event.phase
                              });
                              break;
                            case 'planning':
                              addLog('planning', event.message, {
                                reasoning: event.reasoning,
                                phase: event.phase
                              });
                              break;
                            case 'executing':
                              addLog('executing', event.message, {
                                reasoning: event.reasoning,
                                progress: event.progress,
                                phase: event.phase
                              });
                              break;
                            case 'step':
                              addLog('step', event.message, {
                                details: event.details,
                                phase: event.phase
                              });
                              break;
                            case 'warning':
                              addLog('warning', event.message, {
                                details: event.details
                              });
                              break;
                            case 'complete':
                              if (event.isExisting) {
                                addLog('success', event.message, { details: '可直接播放' });
                              } else {
                                addLog('success', event.message, {
                                  details: `${event.audioCount} 段语音，总时长约 ${event.durationText}`,
                                  phase: event.phase
                                });
                              }
                              await fetchCourses();
                              break;
                            case 'error':
                              addLog('error', event.message, { details: event.error });
                              break;
                          }
                        } catch (e) {
                          // 解析失败忽略
                        }
                      }
                    }
                  }
                  
                } catch (error: any) {
                  addLog('error', '生成课程失败', { details: error.message });
                } finally {
                  setPublishingCourse(false);
                }
              }}
              onPlay={(id) => router.push(`/dashboard/teaching/${kbId}/course/${id}`)}
              dimensions={NODE_DIMENSIONS.course}
            />
                                        </div>
        </motion.div>
                            
      {/* 画布控制 */}
      <CanvasControls
        zoom={zoom}
        onZoomIn={() => setZoom(z => Math.min(z * 1.2, 1.5))}
        onZoomOut={() => setZoom(z => Math.max(z * 0.8, 0.3))}
        onReset={() => {
          setZoom(0.85);
          if (containerRef.current) {
            const { width, height } = containerRef.current.getBoundingClientRect();
            setPanX(Math.max(20, (width - 2000 * 0.85) / 2));
            setPanY(Math.max(20, (height - 500 * 0.85) / 2));
          }
        }}
      />
        </div>
        
        {/* 终端日志面板 */}
        <LogPanel 
          logs={logs}
          isExpanded={logPanelExpanded}
          onToggle={() => setLogPanelExpanded(!logPanelExpanded)}
          onClear={clearLogs}
        />
      </div>

      {/* 文档管理弹窗 */}
      <DocumentsModal
        open={showDocumentsModal}
        onOpenChange={setShowDocumentsModal}
        documents={documents}
        sourceMode={sourceMode}
        uploading={uploading}
        onUpload={handleFileUpload}
        onPaste={() => {
          setShowDocumentsModal(false);
          setShowPasteModal(true);
        }}
      />

      {/* 章节选择弹窗 */}
      <ChaptersModal
        open={showChaptersModal}
        onOpenChange={setShowChaptersModal}
        chapters={chapters}
        selectedChapter={selectedChapter}
        onSelect={handleSelectChapter}
      />

      {/* 手稿管理弹窗 */}
      <ManuscriptModal
        open={showManuscriptModal}
        onOpenChange={setShowManuscriptModal}
        manuscripts={manuscripts}
        selectedManuscript={selectedManuscript}
        generating={generating}
        progress={generateProgress}
        onSelect={(m) => setSelectedManuscript(m)}
        onEdit={(id) => {
          setShowManuscriptModal(false);
          setEditingManuscriptId(id);
          setShowManuscriptEditor(true);
        }}
      />

      {/* 手稿编辑器弹窗 */}
      <ManuscriptEditorModal
        open={showManuscriptEditor}
        onOpenChange={setShowManuscriptEditor}
        manuscriptId={editingManuscriptId}
        kbId={kbId}
        onSuccess={() => {
          fetchManuscripts();
        }}
      />

      {/* PPT预览弹窗 */}
      <PPTPreviewModal
        open={showPPTPreview}
        onOpenChange={setShowPPTPreview}
        manuscriptId={selectedManuscript?.id || null}
        title={selectedManuscript?.chapterTitle}
      />
      
      {/* 知识图谱弹窗 */}
      {showKnowledgeGraph && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-[90vw] max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 bg-zinc-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center shadow-sm">
                  <Network className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-zinc-900">知识图谱</h2>
                  {bookThesis && <p className="text-xs text-zinc-500 mt-0.5">{bookThesis.title || bookThesis.topic}</p>}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowKnowledgeGraph(false)} className="h-8 w-8 p-0">
                <X className="w-5 h-5" />
              </Button>
            </div>
            <div className="flex-1 p-6 overflow-auto">
              {chapterDAG ? (
                <BookKnowledgeGraph
                  chapterDAG={chapterDAG}
                  viewMode="chapters"
                  height={500}
                  onNodeClick={(node) => {
                    if (node.type === 'chapter') {
                      const chapterId = node.id.replace('ch_', '');
                      const chapter = chapters.find(c => c.id === chapterId);
                      if (chapter) {
                        handleSelectChapter(chapter);
                        setShowKnowledgeGraph(false);
                      }
                    }
                  }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-64 text-zinc-400">
                  <Network className="w-12 h-12 mb-4 opacity-20" />
                  <p className="text-sm">请先进行大纲解析</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 大纲调整弹窗 */}
      <OutlineAdjustModal
        open={showOutlineAdjust}
        onOpenChange={setShowOutlineAdjust}
        knowledgeBaseId={kbId}
        onSuccess={fetchChapters}
      />

      {/* 粘贴手稿弹窗 */}
      {showPasteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-[90vw] max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 bg-zinc-50/50">
                  <h2 className="text-lg font-bold text-zinc-900">粘贴手稿</h2>
              <button onClick={() => { setShowPasteModal(false); setPasteTitle(''); setPasteContent(''); }} className="text-zinc-400 hover:text-zinc-900">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 p-6 overflow-auto space-y-4">
              <div>
                <label className="text-xs font-bold text-zinc-500 mb-1.5 block">标题（可选）</label>
                <input
                  type="text"
                  value={pasteTitle}
                  onChange={(e) => setPasteTitle(e.target.value)}
                  placeholder="给这份手稿起个名字..."
                  className="w-full h-10 px-4 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-zinc-500 mb-1.5 block">内容</label>
                <textarea
                  value={pasteContent}
                  onChange={(e) => setPasteContent(e.target.value)}
                  placeholder="在这里粘贴内容..."
                  className="w-full h-[300px] px-4 py-3 border border-zinc-200 rounded-lg text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-zinc-100 flex justify-end gap-3">
              <Button variant="outline" onClick={() => { setShowPasteModal(false); setPasteTitle(''); setPasteContent(''); }}>取消</Button>
              <Button onClick={handlePasteSubmit} disabled={pasting || !pasteContent.trim()}>
                {pasting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />保存中...</> : '保存手稿'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

