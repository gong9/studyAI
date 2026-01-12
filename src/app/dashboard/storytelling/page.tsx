'use client';

import React, { useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { 
  BookOpen, FileText, Brain, ListTree, Mic2, 
  Upload, X, Sparkles, ZoomIn, ZoomOut, Maximize2,
  ArrowLeft, Loader2
} from 'lucide-react';

// ==================== 类型定义 ====================

interface NodePosition {
  x: number;
  y: number;
}

// ==================== 节点位置配置 ====================

const NODE_POSITIONS: Record<string, NodePosition> = {
  input: { x: 100, y: 80 },
  extract: { x: 500, y: 20 },
  synthesize: { x: 500, y: 220 },
  plan: { x: 900, y: 80 },
  generate: { x: 1300, y: 80 },
  terminal: { x: 100, y: 520 },  // AI 活动终端 - 往下移，靠左
};

const NODE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  input: { width: 320, height: 360 },
  extract: { width: 280, height: 180 },
  synthesize: { width: 280, height: 180 },
  plan: { width: 300, height: 280 },
  generate: { width: 300, height: 280 },
  terminal: { width: 1100, height: 180 },  // AI 活动终端 - 更宽更矮
};

const CONNECTIONS = [
  { from: 'input', to: 'extract' },
  { from: 'input', to: 'synthesize' },
  { from: 'extract', to: 'plan' },
  { from: 'synthesize', to: 'plan' },
  { from: 'plan', to: 'generate' },
];

// ==================== 连接线组件 ====================

function ConnectionLine({ 
  from, 
  to, 
  fromId,
  toId,
  isActive 
}: { 
  from: NodePosition; 
  to: NodePosition;
  fromId: string;
  toId: string;
  isActive: boolean;
}) {
  const fromDim = NODE_DIMENSIONS[fromId];
  const toDim = NODE_DIMENSIONS[toId];
  
  const startX = from.x + fromDim.width;
  const startY = from.y + fromDim.height / 2;
  const endX = to.x;
  const endY = to.y + toDim.height / 2;
  
  const midX = (startX + endX) / 2;
  const path = `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;

  return (
    <g>
      {isActive && (
        <motion.path
          d={path}
          fill="none"
          stroke="#f59e0b"
          strokeWidth={8}
          strokeOpacity={0.2}
          filter="url(#glow)"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.5 }}
        />
      )}
      
      <motion.path
        d={path}
        fill="none"
        stroke={isActive ? '#f59e0b' : '#3f3f46'}
        strokeWidth={2}
        strokeDasharray={isActive ? 'none' : '6 6'}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.5 }}
      />
    </g>
  );
}

// ==================== 基础节点组件 ====================

function BaseNode({
  title,
  status,
  icon: Icon,
  children,
}: {
  title: string;
  status: 'pending' | 'active' | 'completed';
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  const borderColor = {
    pending: 'border-zinc-700',
    active: 'border-amber-500',
    completed: 'border-emerald-500',
  }[status];

  const glowColor = {
    pending: '',
    active: 'shadow-amber-500/30 shadow-xl',
    completed: 'shadow-emerald-500/20',
  }[status];

  return (
    <div
      className={`
        rounded-2xl border-2 bg-zinc-900/95 backdrop-blur-xl
        shadow-2xl transition-all duration-300
        ${borderColor} ${glowColor}
      `}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`
            w-8 h-8 rounded-lg flex items-center justify-center
            ${status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' : ''}
            ${status === 'active' ? 'bg-amber-500/20 text-amber-400' : ''}
            ${status === 'pending' ? 'bg-zinc-700/50 text-zinc-500' : ''}
          `}>
            <Icon className="w-4 h-4" />
          </div>
          <span className="text-sm font-bold text-zinc-300 uppercase tracking-wider">{title}</span>
        </div>
        
        {status === 'active' && (
          <motion.span
            className="text-[9px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold"
            animate={{ opacity: [1, 0.5, 1] }}
            transition={{ duration: 0.8, repeat: Infinity }}
          >
            可交互
          </motion.span>
        )}
      </div>

      <div className="p-4">
        {children}
      </div>
    </div>
  );
}

// ==================== 输入节点（带上传功能）====================

function InputNode({ 
  onUpload 
}: { 
  onUpload: (file: File, title: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile?.type === 'application/pdf') {
      setFile(droppedFile);
      if (!title) {
        setTitle(droppedFile.name.replace(/\.pdf$/i, ''));
      }
    }
  }, [title]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile?.type === 'application/pdf') {
      setFile(selectedFile);
      if (!title) {
        setTitle(selectedFile.name.replace(/\.pdf$/i, ''));
      }
    }
  };

  const handleSubmit = async () => {
    if (!file) return;
    setUploading(true);
    onUpload(file, title || file.name.replace(/\.pdf$/i, ''));
  };

  return (
    <div style={{ width: NODE_DIMENSIONS.input.width, height: NODE_DIMENSIONS.input.height }}>
      <BaseNode title="书籍输入" status="active" icon={BookOpen}>
        <div className="space-y-4">
          {/* 书名输入 */}
          <div>
            <label className="text-xs text-zinc-500 mb-1.5 block">书名</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="如：明朝那些事儿"
              className="w-full h-10 px-3 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-100 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          {/* 上传区域 */}
          <div
            className={`
              relative rounded-xl border-2 border-dashed p-4 text-center transition-all
              ${dragActive ? 'border-amber-500 bg-amber-500/10' : 'border-zinc-700 hover:border-zinc-600'}
              ${file ? 'border-amber-500/50 bg-amber-500/5' : ''}
            `}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            {file ? (
              <div className="space-y-2">
                <div className="flex items-center justify-center gap-2">
                  <FileText className="w-5 h-5 text-amber-400" />
                  <span className="text-sm text-zinc-300 truncate max-w-[180px]">{file.name}</span>
                  {!uploading && (
                    <button 
                      onClick={() => setFile(null)}
                      className="p-1 rounded-full hover:bg-zinc-700 text-zinc-500"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <p className="text-xs text-zinc-500">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
              </div>
            ) : (
              <>
                <Upload className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                <p className="text-xs text-zinc-500 mb-2">拖拽 PDF 到这里</p>
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <span className="inline-block px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 text-xs hover:bg-zinc-700 transition-colors">
                    选择文件
                  </span>
                </label>
              </>
            )}
          </div>

          {/* 开始按钮 */}
          <button
            onClick={handleSubmit}
            disabled={!file || uploading}
            className={`
              w-full h-11 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2
              ${file && !uploading
                ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:from-amber-400 hover:to-orange-500 shadow-lg shadow-amber-500/30'
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
              }
            `}
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                处理中...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                开始生成
              </>
            )}
          </button>
        </div>
      </BaseNode>
    </div>
  );
}

// ==================== 占位节点 ====================

function PlaceholderNode({ 
  id, 
  title, 
  icon: Icon,
  description 
}: { 
  id: string;
  title: string;
  icon: React.ElementType;
  description: string;
}) {
  const dim = NODE_DIMENSIONS[id];
  
  return (
    <div style={{ width: dim.width, height: dim.height }}>
      <BaseNode title={title} status="pending" icon={Icon}>
        <div className="flex flex-col items-center justify-center h-full py-6 text-center">
          <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center mb-3">
            <Icon className="w-6 h-6 text-zinc-600" />
          </div>
          <p className="text-xs text-zinc-600 max-w-[200px]">{description}</p>
        </div>
      </BaseNode>
    </div>
  );
}

// ==================== 日志类型 ====================

interface LogEntry {
  id: string;
  time: Date;
  type: 'info' | 'success' | 'warning' | 'error' | 'agent' | 'system';
  agent?: string;
  message: string;
}

// ==================== AI 活动终端 ====================

function TerminalNode({ logs, isActive }: { logs: LogEntry[]; isActive: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const getLogColor = (type: LogEntry['type']) => {
    switch (type) {
      case 'success': return 'text-emerald-400';
      case 'warning': return 'text-amber-400';
      case 'error': return 'text-red-400';
      case 'agent': return 'text-cyan-400';
      case 'system': return 'text-green-500/50';
      default: return 'text-green-400';
    }
  };

  const getLogPrefix = (type: LogEntry['type'], agent?: string) => {
    if (agent) return `[${agent}]`;
    switch (type) {
      case 'success': return '[✓]';
      case 'warning': return '[!]';
      case 'error': return '[✗]';
      case 'system': return '$';
      default: return '[>]';
    }
  };

  return (
    <div style={{ width: NODE_DIMENSIONS.terminal.width, height: NODE_DIMENSIONS.terminal.height }}>
      <div
        className={`rounded-2xl border-2 ${isActive ? 'border-green-500/30' : 'border-green-500/20'} bg-black/90 backdrop-blur-xl h-full flex flex-col shadow-2xl ${isActive ? 'shadow-green-500/10' : ''}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* 终端头部 */}
        <div className="px-4 py-2 border-b border-green-500/20 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            {/* 交通灯按钮 */}
            <div className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded-full ${isActive ? 'bg-red-500' : 'bg-red-500/50'}`} />
              <div className={`w-3 h-3 rounded-full ${isActive ? 'bg-yellow-500' : 'bg-yellow-500/50'}`} />
              <div className={`w-3 h-3 rounded-full ${isActive ? 'bg-green-500' : 'bg-green-500/50'}`} />
            </div>
            <span className={`text-xs font-mono ${isActive ? 'text-green-400' : 'text-green-400/50'}`}>AI_AGENT_TERMINAL</span>
          </div>
          <div className="flex items-center gap-2">
            {isActive ? (
              <>
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[10px] font-mono text-green-400/60">LIVE</span>
              </>
            ) : (
              <>
                <div className="w-2 h-2 rounded-full bg-zinc-600" />
                <span className="text-[10px] font-mono text-zinc-600">IDLE</span>
              </>
            )}
          </div>
        </div>

        {/* 终端内容 */}
        <div 
          ref={scrollRef}
          className="flex-1 p-4 font-mono text-xs leading-relaxed overflow-y-auto scrollbar-thin scrollbar-thumb-green-500/20"
          style={{
            background: 'linear-gradient(180deg, rgba(0,0,0,0.9) 0%, rgba(0,10,0,0.95) 100%)',
          }}
        >
          {logs.map((log) => (
            <div key={log.id} className={`mb-1.5 ${getLogColor(log.type)}`}>
              <span className="opacity-60">{getLogPrefix(log.type, log.agent)}</span>{' '}
              {log.message}
            </div>
          ))}
          <div className="mt-2 text-green-400/40">
            <span>$</span>
            <span className="inline-block w-2 h-4 bg-green-400/50 ml-1 animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== 画布控制 ====================

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
      <div className="flex items-center bg-zinc-900/90 backdrop-blur border border-zinc-700 rounded-xl overflow-hidden">
        <button
          onClick={onZoomOut}
          className="p-2 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="px-3 text-xs text-zinc-400 font-mono border-x border-zinc-700">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={onZoomIn}
          className="p-2 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
      </div>
      <button
        onClick={onReset}
        className="p-2 bg-zinc-900/90 backdrop-blur border border-zinc-700 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors"
      >
        <Maximize2 className="w-4 h-4" />
      </button>
    </div>
  );
}

// ==================== 主页面 ====================

export default function StorytellingCanvasPage() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  // 画布状态
  const [zoom, setZoom] = useState(1.08);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [canvasReady, setCanvasReady] = useState(false);

  // 日志状态
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [bookId, setBookId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // 添加日志
  const addLog = useCallback((type: LogEntry['type'], message: string, agent?: string) => {
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      time: new Date(),
      type,
      agent,
      message,
    };
    setLogs(prev => [...prev, entry]);
  }, []);

  // 初始化日志
  useEffect(() => {
    addLog('system', 'System initialized');
    addLog('system', 'Waiting for book input...');
    addLog('system', 'Available agents: StoryExtractor, BookSynthesizer, EpisodePlanner, Storyteller');
  }, [addLog]);

  // 初始化画布位置 - 使用 useLayoutEffect 避免闪烁
  useLayoutEffect(() => {
    if (containerRef.current) {
      const { width, height } = containerRef.current.getBoundingClientRect();
      // 内容区域 1700 x 800（包含终端节点）
      setPanX((width - 1700 * zoom) / 2);
      setPanY((height - 800 * zoom) / 2);
      setCanvasReady(true);
    }
  }, []);

  // 画布交互
  const handleWheel = useCallback((e: WheelEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-scrollable]')) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.min(Math.max(z * delta, 0.3), 2));
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

  // 建立 SSE 连接
  useEffect(() => {
    if (!bookId) return;

    addLog('info', `Connecting to backend... (book: ${bookId.slice(0, 8)}...)`);
    
    const eventSource = new EventSource(`/api/storytelling/${bookId}/watch`);
    
    eventSource.onopen = () => {
      addLog('success', 'Connected to AI agent stream');
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.error) {
          addLog('error', `Error: ${data.error}`);
          return;
        }

        // 处理日志
        if (data.log) {
          addLog(data.log.type || 'info', data.log.message, data.log.agent);
        }

        // 处理状态更新
        if (data.status) {
          const s = data.status;
          if (s.stage === 'extracting') {
            addLog('agent', `Extracting chapter ${s.current_chapter}/${s.total_chapters}`, 'StoryExtractor');
          } else if (s.stage === 'synthesizing') {
            addLog('agent', 'Synthesizing book overview...', 'BookSynthesizer');
          } else if (s.stage === 'planning') {
            addLog('agent', 'Planning episodes...', 'EpisodePlanner');
          } else if (s.stage === 'ready') {
            addLog('success', 'Preparation complete! Ready to generate scripts.');
            setIsProcessing(false);
            // 跳转到详情页
            router.push(`/dashboard/storytelling/${bookId}`);
          }
        }
      } catch {
        // 忽略心跳
      }
    };

    eventSource.onerror = () => {
      addLog('warning', 'Connection interrupted, retrying...');
    };

    return () => {
      eventSource.close();
    };
  }, [bookId, addLog, router]);

  // 处理上传
  const handleUpload = async (file: File, title: string) => {
    try {
      setIsProcessing(true);
      addLog('info', `Uploading: ${title}`);
      addLog('info', `File size: ${(file.size / 1024 / 1024).toFixed(2)} MB`);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('config', JSON.stringify({
        title,
        targetDurationMinutes: 10,
      }));

      const response = await fetch('/api/storytelling/create', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        addLog('success', `Book created: ${data.bookId.slice(0, 8)}...`);
        setBookId(data.bookId);  // 触发 SSE 连接
      } else {
        const error = await response.json();
        addLog('error', `Creation failed: ${error.error || 'Unknown error'}`);
        setIsProcessing(false);
      }
    } catch (error) {
      console.error('Upload failed:', error);
      addLog('error', 'Upload failed: Network error');
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* 顶部导航 */}
      <nav className="relative z-20 border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-xl">
        <div className="max-w-full px-6 h-14 flex items-center justify-between">
          <button 
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 text-zinc-400 hover:text-zinc-100 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">返回工作台</span>
          </button>
          
          <div className="w-24" />
        </div>
      </nav>

      {/* 画布 */}
      <div
        ref={containerRef}
        className="absolute inset-0 top-14 overflow-hidden cursor-grab active:cursor-grabbing"
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
              linear-gradient(to right, #27272a 1px, transparent 1px),
              linear-gradient(to bottom, #27272a 1px, transparent 1px)
            `,
            backgroundSize: '24px 24px',
            opacity: 0.3,
          }}
        />

        {/* 渐变光晕 */}
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-amber-900/5 via-transparent to-transparent" />

        {/* 画布内容 */}
        <motion.div
          className="absolute"
          style={{
            width: '2000px',
            height: '1000px',
            transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
            transformOrigin: '0 0',
            opacity: canvasReady ? 1 : 0,
            transition: 'opacity 0.15s ease-out',
          }}
        >
          {/* SVG 连接线 */}
          <svg className="absolute inset-0 pointer-events-none" style={{ width: '2000px', height: '1000px' }}>
            <defs>
              <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            
            {CONNECTIONS.map((conn) => (
              <ConnectionLine
                key={`${conn.from}-${conn.to}`}
                from={NODE_POSITIONS[conn.from]}
                to={NODE_POSITIONS[conn.to]}
                fromId={conn.from}
                toId={conn.to}
                isActive={false}
              />
            ))}
          </svg>

          {/* 输入节点（可交互）*/}
          <div className="absolute" style={{ left: NODE_POSITIONS.input.x, top: NODE_POSITIONS.input.y }}>
            <InputNode onUpload={handleUpload} />
          </div>

          {/* 占位节点 */}
          <div className="absolute" style={{ left: NODE_POSITIONS.extract.x, top: NODE_POSITIONS.extract.y }}>
            <PlaceholderNode 
              id="extract"
              title="故事提取" 
              icon={FileText}
              description="上传书籍后，自动提取章节故事要素"
            />
          </div>

          <div className="absolute" style={{ left: NODE_POSITIONS.synthesize.x, top: NODE_POSITIONS.synthesize.y }}>
            <PlaceholderNode 
              id="synthesize"
              title="全书综合" 
              icon={Brain}
              description="综合分析人物关系与故事主线"
            />
          </div>

          <div className="absolute" style={{ left: NODE_POSITIONS.plan.x, top: NODE_POSITIONS.plan.y }}>
            <PlaceholderNode 
              id="plan"
              title="分集规划" 
              icon={ListTree}
              description="智能规划回目结构与悬念设计"
            />
          </div>

          <div className="absolute" style={{ left: NODE_POSITIONS.generate.x, top: NODE_POSITIONS.generate.y }}>
            <PlaceholderNode 
              id="generate"
              title="讲稿生成" 
              icon={Mic2}
              description="生成评书风格讲稿，一回回精彩呈现"
            />
          </div>

          {/* AI 活动终端 */}
          <div className="absolute" style={{ left: NODE_POSITIONS.terminal.x, top: NODE_POSITIONS.terminal.y }}>
            <TerminalNode logs={logs} isActive={isProcessing} />
          </div>
        </motion.div>
      </div>

      {/* 画布控制 */}
      <CanvasControls
        zoom={zoom}
        onZoomIn={() => setZoom(z => Math.min(z * 1.2, 2))}
        onZoomOut={() => setZoom(z => Math.max(z * 0.8, 0.3))}
        onReset={() => {
          setZoom(1.08);
          if (containerRef.current) {
            const { width, height } = containerRef.current.getBoundingClientRect();
            setPanX((width - 1700 * 1.08) / 2);
            setPanY((height - 800 * 1.08) / 2);
          }
        }}
      />
    </div>
  );
}
