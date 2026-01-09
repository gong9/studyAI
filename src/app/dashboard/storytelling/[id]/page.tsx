'use client';

import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { 
  BookOpen, FileText, Brain, ListTree, Mic2, 
  ZoomIn, ZoomOut, Maximize2, ArrowLeft, Sparkles,
  Loader2, CheckCircle2, Play, ChevronRight
} from 'lucide-react';

// ==================== 类型定义 ====================

interface NodePosition {
  x: number;
  y: number;
}

interface Status {
  status: string;
  phase: string;
  total_chapters: number;
  processed_chapters: number;
  total_episodes: number;
  ready_episodes: number;
  message: string;
}

interface Episode {
  episode_number: number;
  title: string;
  summary: string;
  status: 'pending' | 'ready';
}

// ==================== 节点位置配置 ====================

const NODE_POSITIONS: Record<string, NodePosition> = {
  input: { x: 100, y: 80 },
  extract: { x: 480, y: 20 },
  synthesize: { x: 480, y: 240 },
  plan: { x: 860, y: 80 },
  generate: { x: 1240, y: 20 },
  output: { x: 1240, y: 300 },
  terminal: { x: 100, y: 520 },  // AI 活动终端 - 底部靠左
};

const NODE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  input: { width: 300, height: 220 },
  extract: { width: 280, height: 200 },
  synthesize: { width: 280, height: 200 },
  plan: { width: 300, height: 320 },
  generate: { width: 320, height: 260 },
  output: { width: 420, height: 320 },
  terminal: { width: 1100, height: 180 },  // AI 活动终端 - 更宽更矮
};

const CONNECTIONS = [
  { from: 'input', to: 'extract' },
  { from: 'input', to: 'synthesize' },
  { from: 'extract', to: 'plan' },
  { from: 'synthesize', to: 'plan' },
  { from: 'plan', to: 'generate' },
  { from: 'generate', to: 'output' },
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
      
      {isActive && (
        <motion.circle
          r={5}
          fill="#f59e0b"
          initial={{ offsetDistance: '0%' }}
          animate={{ offsetDistance: '100%' }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: 'linear',
          }}
          style={{
            offsetPath: `path("${path}")`,
          }}
        />
      )}
    </g>
  );
}

// ==================== 基础节点组件 ====================

function BaseNode({
  title,
  status,
  icon: Icon,
  children,
  progress,
}: {
  title: string;
  status: 'pending' | 'processing' | 'completed';
  icon: React.ElementType;
  children: React.ReactNode;
  progress?: number;
}) {
  const borderColor = {
    pending: 'border-zinc-700',
    processing: 'border-amber-500',
    completed: 'border-emerald-500',
  }[status];

  const glowColor = {
    pending: '',
    processing: 'shadow-amber-500/30 shadow-xl',
    completed: 'shadow-emerald-500/20',
  }[status];

  return (
    <div
      className={`
        rounded-2xl border-2 bg-zinc-900/95 backdrop-blur-xl
        shadow-2xl transition-all duration-300 h-full flex flex-col
        ${borderColor} ${glowColor}
      `}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className={`
            w-8 h-8 rounded-lg flex items-center justify-center
            ${status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' : ''}
            ${status === 'processing' ? 'bg-amber-500/20 text-amber-400' : ''}
            ${status === 'pending' ? 'bg-zinc-700/50 text-zinc-500' : ''}
          `}>
            <Icon className="w-4 h-4" />
          </div>
          <span className="text-sm font-bold text-zinc-300 uppercase tracking-wider">{title}</span>
        </div>
        
        {status === 'processing' && (
          <motion.span
            className="text-[9px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold"
            animate={{ opacity: [1, 0.5, 1] }}
            transition={{ duration: 0.8, repeat: Infinity }}
          >
            处理中
          </motion.span>
        )}
        {status === 'completed' && (
          <span className="text-[9px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">
            完成
          </span>
        )}
      </div>

      {status === 'processing' && progress !== undefined && (
        <div className="mx-4 mt-3 flex-shrink-0">
          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-amber-500 to-orange-500"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
          <p className="text-xs text-amber-400 mt-1 text-right">{progress}%</p>
        </div>
      )}

      <div className="p-4 flex-1 overflow-hidden" data-scrollable>
        {children}
      </div>
    </div>
  );
}

// ==================== 输入节点 ====================

function InputNode({ data }: { data: any }) {
  return (
    <div style={{ width: NODE_DIMENSIONS.input.width, height: NODE_DIMENSIONS.input.height }}>
      <BaseNode title="书籍输入" status="completed" icon={BookOpen}>
        <div className="space-y-3">
          <div className="p-3 rounded-xl bg-zinc-800/50 border border-zinc-700">
            <p className="text-xs text-zinc-500 mb-1">书名</p>
            <p className="text-sm text-zinc-100 font-medium truncate">
              {data?.title || '加载中...'}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-zinc-800/50 border border-zinc-700">
            <p className="text-xs text-zinc-500 mb-1">章节数</p>
            <p className="text-lg text-amber-400 font-bold">
              {data?.chapters || 0} <span className="text-sm text-zinc-500">章</span>
            </p>
          </div>
        </div>
      </BaseNode>
    </div>
  );
}

// ==================== 提取节点 ====================

function ExtractNode({ 
  status, 
  progress, 
  data 
}: { 
  status: 'pending' | 'processing' | 'completed';
  progress: number;
  data: any;
}) {
  return (
    <div style={{ width: NODE_DIMENSIONS.extract.width, height: NODE_DIMENSIONS.extract.height }}>
      <BaseNode title="故事提取" status={status} icon={FileText} progress={progress}>
        <div 
          className="max-h-[120px] overflow-y-auto space-y-2 scrollbar-thin scrollbar-thumb-zinc-700"
          onWheel={(e) => e.stopPropagation()}
        >
          {data?.summaries?.slice(0, 5).map((s: any, i: number) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-xs p-2 rounded-lg bg-zinc-800/50 border border-zinc-700"
            >
              <p className="text-amber-400 truncate">{s.chapter_title}</p>
            </motion.div>
          ))}
          {(!data?.summaries || data.summaries.length === 0) && status === 'pending' && (
            <p className="text-xs text-zinc-500 italic text-center py-4">等待提取...</p>
          )}
          {status === 'processing' && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
            </div>
          )}
        </div>
      </BaseNode>
    </div>
  );
}

// ==================== 综合节点 ====================

function SynthesizeNode({ 
  status, 
  data 
}: { 
  status: 'pending' | 'processing' | 'completed';
  data: any;
}) {
  return (
    <div style={{ width: NODE_DIMENSIONS.synthesize.width, height: NODE_DIMENSIONS.synthesize.height }}>
      <BaseNode title="全书综合" status={status} icon={Brain}>
        <div className="space-y-3">
          {data?.overall_perspective?.theme && (
            <div className="p-3 rounded-xl bg-zinc-800/50 border border-zinc-700">
              <p className="text-xs text-zinc-500 mb-1">核心主旨</p>
              <p className="text-sm text-zinc-100 line-clamp-2">
                {data.overall_perspective.theme}
              </p>
            </div>
          )}
          {data?.overall_perspective?.main_characters && (
            <div className="flex flex-wrap gap-1.5">
              {data.overall_perspective.main_characters.slice(0, 6).map((c: string, i: number) => (
                <span key={i} className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-xs">
                  {c}
                </span>
              ))}
            </div>
          )}
          {!data?.overall_perspective && status === 'pending' && (
            <p className="text-xs text-zinc-500 italic text-center py-4">等待综合...</p>
          )}
          {status === 'processing' && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
            </div>
          )}
        </div>
      </BaseNode>
    </div>
  );
}

// ==================== 规划节点 ====================

function PlanNode({ 
  status, 
  data,
  onSelectEpisode
}: { 
  status: 'pending' | 'processing' | 'completed';
  data: any;
  onSelectEpisode: (ep: Episode) => void;
}) {
  return (
    <div style={{ width: NODE_DIMENSIONS.plan.width, height: NODE_DIMENSIONS.plan.height }}>
      <BaseNode title="分集规划" status={status} icon={ListTree}>
        <div 
          className="max-h-[240px] overflow-y-auto space-y-2 scrollbar-thin scrollbar-thumb-zinc-700"
          onWheel={(e) => e.stopPropagation()}
        >
          {data?.episodes?.slice(0, 10).map((ep: Episode, i: number) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              onClick={() => onSelectEpisode(ep)}
              className="flex items-center gap-2 p-2 rounded-lg bg-zinc-800/50 border border-zinc-700 hover:border-amber-500/50 hover:bg-zinc-800 cursor-pointer transition-all group"
            >
              <span className={`
                w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0
                ${ep.status === 'ready' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}
              `}>
                {ep.episode_number}
              </span>
              <p className="text-xs text-zinc-300 truncate flex-1">{ep.title}</p>
              <ChevronRight className="w-3 h-3 text-zinc-600 group-hover:text-amber-400 transition-colors" />
            </motion.div>
          ))}
          {data?.episodes?.length > 10 && (
            <p className="text-xs text-zinc-500 text-center py-2">
              共 {data.episodes.length} 回
            </p>
          )}
          {(!data?.episodes || data.episodes.length === 0) && status === 'pending' && (
            <p className="text-xs text-zinc-500 italic text-center py-4">等待规划...</p>
          )}
          {status === 'processing' && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
            </div>
          )}
        </div>
      </BaseNode>
    </div>
  );
}

// ==================== 生成节点 ====================

function GenerateNode({ 
  status, 
  data,
  episodes,
  onSelectEpisode,
  onGenerate
}: { 
  status: 'pending' | 'processing' | 'completed';
  data: any;
  episodes: Episode[];
  onSelectEpisode: (ep: Episode) => void;
  onGenerate: (epNum: number) => void;
}) {
  const readyEpisodes = episodes.filter(e => e.status === 'ready');
  
  return (
    <div style={{ width: NODE_DIMENSIONS.generate.width, height: NODE_DIMENSIONS.generate.height }}>
      <BaseNode title="讲稿生成" status={status} icon={Mic2}>
        <div className="space-y-3">
          {/* 进度统计 */}
          <div className="p-3 rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/30">
            <p className="text-xs text-zinc-500 mb-1">生成进度</p>
            <div className="flex items-end gap-2">
              <span className="text-2xl font-bold text-amber-400">{data?.ready || 0}</span>
              <span className="text-zinc-500 mb-0.5">/ {data?.total || 0} 回</span>
            </div>
          </div>
          
          {/* 已生成列表 */}
          <div 
            className="max-h-[140px] overflow-y-auto space-y-2 scrollbar-thin scrollbar-thumb-zinc-700"
            onWheel={(e) => e.stopPropagation()}
          >
            {readyEpisodes.slice(0, 5).map((ep, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={() => onSelectEpisode(ep)}
                className="flex items-center gap-2 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 cursor-pointer transition-all"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <p className="text-xs text-zinc-300 truncate flex-1">{ep.title}</p>
                <Play className="w-3 h-3 text-emerald-400" />
              </motion.div>
            ))}
          </div>
          
          {status === 'pending' && data?.total === 0 && (
            <p className="text-xs text-zinc-500 italic text-center">等待规划完成...</p>
          )}
        </div>
      </BaseNode>
    </div>
  );
}

// ==================== 讲稿输出节点 ====================

function OutputNode({
  episode,
  script,
  loading,
  onGenerate
}: {
  episode: Episode | null;
  script: string | null;
  loading: boolean;
  onGenerate: () => void;
}) {
  return (
    <div style={{ width: NODE_DIMENSIONS.output.width, height: NODE_DIMENSIONS.output.height }}>
      <div
        className={`
          rounded-2xl border-2 bg-zinc-900/95 backdrop-blur-xl h-full flex flex-col
          shadow-2xl transition-all duration-300
          ${script ? 'border-emerald-500 shadow-emerald-500/20' : episode ? 'border-amber-500 shadow-amber-500/20' : 'border-zinc-700'}
        `}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className={`
              w-8 h-8 rounded-lg flex items-center justify-center
              ${script ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}
            `}>
              <FileText className="w-4 h-4" />
            </div>
            <span className="text-sm font-bold text-zinc-300 uppercase tracking-wider">讲稿输出</span>
          </div>
          {episode && (
            <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-400">
              第{episode.episode_number}回
            </span>
          )}
        </div>

        {/* 内容 */}
        <div 
          className="flex-1 p-4 overflow-y-auto"
          data-scrollable
          onWheel={(e) => e.stopPropagation()}
        >
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full">
              <Loader2 className="w-8 h-8 text-amber-400 animate-spin mb-3" />
              <p className="text-sm text-zinc-400">正在生成讲稿...</p>
            </div>
          ) : script ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-medium text-emerald-400">{episode?.title}</span>
              </div>
              <div className="text-xs text-zinc-400 leading-relaxed whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                {script.slice(0, 500)}
                {script.length > 500 && <span className="text-zinc-600">...</span>}
              </div>
            </div>
          ) : episode ? (
            <div className="flex flex-col items-center justify-center h-full">
              <p className="text-sm text-zinc-400 mb-3">{episode.title}</p>
              <button
                onClick={onGenerate}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold text-sm hover:from-amber-400 hover:to-orange-500 transition-colors flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                生成讲稿
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center mb-3">
                <FileText className="w-6 h-6 text-zinc-600" />
              </div>
              <p className="text-xs text-zinc-600">选择左侧回目查看或生成讲稿</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ==================== AI 活动终端节点 ====================

interface LogEntry {
  id: string;
  time: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'agent';
  agent?: string;
  message: string;
}

function TerminalNode({ logs }: { logs: LogEntry[] }) {
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
      default: return 'text-green-400';
    }
  };

  const getLogPrefix = (type: LogEntry['type'], agent?: string) => {
    if (agent) return `[${agent}]`;
    switch (type) {
      case 'success': return '[✓]';
      case 'warning': return '[!]';
      case 'error': return '[✗]';
      default: return '[>]';
    }
  };

  return (
    <div style={{ width: NODE_DIMENSIONS.terminal.width, height: NODE_DIMENSIONS.terminal.height }}>
      <div
        className="rounded-2xl border-2 border-green-500/30 bg-black/90 backdrop-blur-xl h-full flex flex-col shadow-2xl shadow-green-500/10"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* 终端头部 */}
        <div className="px-4 py-2 border-b border-green-500/20 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            {/* 交通灯按钮 */}
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <div className="w-3 h-3 rounded-full bg-green-500" />
            </div>
            <span className="text-xs font-mono text-green-400">AI_AGENT_TERMINAL</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[10px] font-mono text-green-400/60">LIVE</span>
          </div>
        </div>

        {/* 终端内容 */}
        <div 
          ref={scrollRef}
          className="flex-1 p-3 overflow-y-auto font-mono text-xs leading-relaxed"
          data-scrollable
          onWheel={(e) => e.stopPropagation()}
          style={{
            background: 'linear-gradient(180deg, rgba(0,0,0,0.9) 0%, rgba(0,20,0,0.95) 100%)',
          }}
        >
          {logs.length === 0 ? (
            <div className="text-green-500/50 animate-pulse">
              <span className="text-green-400">$</span> Waiting for agent activity...
              <span className="inline-block w-2 h-4 bg-green-400 ml-1 animate-pulse" />
            </div>
          ) : (
            logs.map((log) => (
              <motion.div
                key={log.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="mb-1"
              >
                <span className="text-green-600">{log.time}</span>
                {' '}
                <span className={getLogColor(log.type)}>
                  {getLogPrefix(log.type, log.agent)}
                </span>
                {' '}
                <span className={log.type === 'agent' ? 'text-cyan-300' : 'text-green-300'}>
                  {log.message}
                </span>
              </motion.div>
            ))
          )}
          {/* 光标 */}
          <div className="mt-2 text-green-400">
            <span>$</span>
            <span className="inline-block w-2 h-4 bg-green-400 ml-1 animate-pulse" />
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

export default function StorytellingWorkflowPage() {
  const params = useParams();
  const router = useRouter();
  const bookId = params.id as string;
  const containerRef = useRef<HTMLDivElement>(null);

  // 画布状态
  const [zoom, setZoom] = useState(0.9);  // 初始缩放
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [canvasReady, setCanvasReady] = useState(false);

  // 数据状态
  const [status, setStatus] = useState<Status | null>(null);
  const [nodeData, setNodeData] = useState<Record<string, any>>({});
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  
  // 讲稿面板
  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);
  const [script, setScript] = useState<string | null>(null);
  const [scriptLoading, setScriptLoading] = useState(false);

  // AI 活动日志
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logIdRef = useRef(0);

  const addLog = useCallback((type: LogEntry['type'], message: string, agent?: string) => {
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    const id = `log-${logIdRef.current++}`;
    setLogs(prev => [...prev.slice(-50), { id, time, type, agent, message }]);  // 保留最近 50 条
  }, []);

  // 获取静态数据（只在初始化时调用一次）
  const fetchStaticData = useCallback(async () => {
    try {
      const [metaRes, summariesRes, overviewRes, planRes, episodesRes] = await Promise.all([
        fetch(`/api/storytelling/${bookId}/meta`),
        fetch(`/api/storytelling/${bookId}/summaries`),
        fetch(`/api/storytelling/${bookId}/overview`),
        fetch(`/api/storytelling/${bookId}/plan`),
        fetch(`/api/storytelling/${bookId}/episodes`),
      ]);

      const [metaData, summariesData, overviewData, planData, episodesData] = await Promise.all([
        metaRes.ok ? metaRes.json() : null,
        summariesRes.ok ? summariesRes.json() : null,
        overviewRes.ok ? overviewRes.json() : null,
        planRes.ok ? planRes.json() : null,
        episodesRes.ok ? episodesRes.json() : null,
      ]);

      if (metaData) setNodeData(prev => ({ ...prev, input: metaData }));
      if (summariesData) setNodeData(prev => ({ ...prev, extract: { summaries: summariesData } }));
      if (overviewData) setNodeData(prev => ({ ...prev, synthesize: overviewData }));
      if (planData) setNodeData(prev => ({ ...prev, plan: planData }));
      if (episodesData) {
        setEpisodes(episodesData.episodes || []);
      }
    } catch (error) {
      console.error('Fetch static data failed:', error);
    }
  }, [bookId]);

  // SSE 实时状态监听
  useEffect(() => {
    let lastPhase: string | undefined;
    let lastReadyEpisodes = 0;

    // 先获取静态数据
    fetchStaticData();
    addLog('info', 'Connecting to AI agent stream...');

    // 建立 SSE 连接
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

        // 更新状态
        setStatus({
          status: data.status,
          phase: data.phase,
          total_chapters: data.total_chapters,
          processed_chapters: data.processed_chapters,
          total_episodes: data.total_episodes,
          ready_episodes: data.ready_episodes,
          message: data.message,
        });

        // 更新 generate 节点数据
        setNodeData(prev => ({
          ...prev,
          generate: {
            ready: data.ready_episodes,
            total: data.total_episodes,
          }
        }));

        // 更新 episodes 状态
        if (data.ready_episode_numbers) {
          setEpisodes(prev => prev.map(ep => ({
            ...ep,
            status: data.ready_episode_numbers.includes(ep.episode_number) ? 'ready' : 'pending'
          })));
        }

        // 处理后端推送的日志
        if (data.logs && Array.isArray(data.logs)) {
          data.logs.forEach((logLine: string) => {
            // 解析日志格式: [HH:MM:SS] [AgentName] Message
            const match = logLine.match(/^\[(\d{2}:\d{2}:\d{2})\]\s*\[([^\]]+)\]\s*(.+)$/);
            if (match) {
              const [, , agent, message] = match;
              // 根据内容判断类型
              let type: 'info' | 'success' | 'warning' | 'error' | 'agent' = 'agent';
              if (message.startsWith('✓') || message.includes('完成')) type = 'success';
              else if (message.startsWith('⚠') || message.includes('失败')) type = 'warning';
              addLog(type, message, agent);
            } else {
              addLog('info', logLine);
            }
          });
        }

        // 阶段变化时重新获取静态数据
        if (data.phase && data.phase !== lastPhase) {
          lastPhase = data.phase;
          fetchStaticData();
        }

        // 追踪 ready_episodes 变化
        if (data.ready_episodes > lastReadyEpisodes) {
          lastReadyEpisodes = data.ready_episodes;
        }
      } catch (error) {
        // 忽略心跳
      }
    };

    eventSource.onerror = () => {
      addLog('warning', 'Connection lost, reconnecting...');
    };

    return () => {
      eventSource.close();
    };
  }, [bookId, fetchStaticData, addLog]);

  // 初始化画布位置 - 使用 useLayoutEffect 避免闪烁
  useLayoutEffect(() => {
    if (containerRef.current) {
      const { width, height } = containerRef.current.getBoundingClientRect();
      // 内容区域：1700 x 800（包含终端节点）
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

  // 选择回目
  const handleSelectEpisode = async (ep: Episode) => {
    setSelectedEpisode(ep);
    setScript(null);
    
    if (ep.status === 'ready') {
      try {
        const res = await fetch(`/api/storytelling/${bookId}/episode/${ep.episode_number}`);
        if (res.ok) {
          const data = await res.json();
          setScript(data.script);
        }
      } catch (error) {
        console.error('Fetch script failed:', error);
      }
    }
  };

  // 生成讲稿
  const handleGenerate = async () => {
    if (!selectedEpisode) return;
    
    setScriptLoading(true);
    try {
      const res = await fetch(`/api/storytelling/${bookId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episodeNumber: selectedEpisode.episode_number }),
      });
      
      if (res.ok) {
        const data = await res.json();
        setScript(data.script);
        fetchData(); // 刷新状态
      }
    } catch (error) {
      console.error('Generate failed:', error);
    } finally {
      setScriptLoading(false);
    }
  };

  // 计算节点状态
  const getNodeStatus = (nodeId: string): 'pending' | 'processing' | 'completed' => {
    if (!status) return 'pending';
    const { phase, processed_chapters, total_chapters } = status;
    
    switch (nodeId) {
      case 'input':
        return 'completed';
      case 'extract':
        if (phase === 'story_extraction') return 'processing';
        if (processed_chapters === total_chapters && total_chapters > 0) return 'completed';
        return 'pending';
      case 'synthesize':
        if (phase === 'synthesizing') return 'processing';
        if (['planning', 'prepared', 'generating', 'done'].includes(phase)) return 'completed';
        return 'pending';
      case 'plan':
        if (phase === 'planning') return 'processing';
        if (['prepared', 'generating', 'done'].includes(phase)) return 'completed';
        return 'pending';
      case 'generate':
        if (phase === 'generating') return 'processing';
        if (phase === 'done') return 'completed';
        if (['prepared'].includes(phase)) return 'completed';
        return 'pending';
      default:
        return 'pending';
    }
  };

  const isConnectionActive = (from: string): boolean => {
    const fromStatus = getNodeStatus(from);
    return fromStatus === 'completed' || fromStatus === 'processing';
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* 顶部导航 */}
      <nav className="relative z-20 border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-xl">
        <div className="max-w-full px-6 h-14 flex items-center justify-between">
          <button 
            onClick={() => router.push('/dashboard/storytelling')}
            className="flex items-center gap-2 text-zinc-400 hover:text-zinc-100 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">返回</span>
          </button>
          
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-zinc-100">{nodeData.input?.title || '讲书工作流'}</h1>
              <p className="text-[10px] text-zinc-500">{status?.message || '处理中...'}</p>
            </div>
          </div>

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
                isActive={isConnectionActive(conn.from)}
              />
            ))}
          </svg>

          {/* 节点 */}
          <div className="absolute" style={{ left: NODE_POSITIONS.input.x, top: NODE_POSITIONS.input.y }}>
            <InputNode data={nodeData.input} />
          </div>

          <div className="absolute" style={{ left: NODE_POSITIONS.extract.x, top: NODE_POSITIONS.extract.y }}>
            <ExtractNode 
              status={getNodeStatus('extract')}
              progress={status ? Math.round((status.processed_chapters / Math.max(status.total_chapters, 1)) * 100) : 0}
              data={nodeData.extract}
            />
          </div>

          <div className="absolute" style={{ left: NODE_POSITIONS.synthesize.x, top: NODE_POSITIONS.synthesize.y }}>
            <SynthesizeNode 
              status={getNodeStatus('synthesize')}
              data={nodeData.synthesize}
            />
          </div>

          <div className="absolute" style={{ left: NODE_POSITIONS.plan.x, top: NODE_POSITIONS.plan.y }}>
            <PlanNode 
              status={getNodeStatus('plan')}
              data={nodeData.plan}
              onSelectEpisode={handleSelectEpisode}
            />
          </div>

          <div className="absolute" style={{ left: NODE_POSITIONS.generate.x, top: NODE_POSITIONS.generate.y }}>
            <GenerateNode 
              status={getNodeStatus('generate')}
              data={nodeData.generate}
              episodes={episodes}
              onSelectEpisode={handleSelectEpisode}
              onGenerate={() => {}}
            />
          </div>

          {/* 讲稿输出节点 */}
          <div className="absolute" style={{ left: NODE_POSITIONS.output.x, top: NODE_POSITIONS.output.y }}>
            <OutputNode 
              episode={selectedEpisode}
              script={script}
              loading={scriptLoading}
              onGenerate={handleGenerate}
            />
          </div>

          {/* AI 活动终端 */}
          <div className="absolute" style={{ left: NODE_POSITIONS.terminal.x, top: NODE_POSITIONS.terminal.y }}>
            <TerminalNode logs={logs} />
          </div>
        </motion.div>
      </div>

      {/* 画布控制 */}
      <CanvasControls
        zoom={zoom}
        onZoomIn={() => setZoom(z => Math.min(z * 1.2, 2))}
        onZoomOut={() => setZoom(z => Math.max(z * 0.8, 0.3))}
        onReset={() => {
          setZoom(0.7);
          if (containerRef.current) {
            const { width, height } = containerRef.current.getBoundingClientRect();
            setPanX((width - 1700 * 0.7) / 2);
            setPanY((height - 600 * 0.7) / 2);
          }
        }}
      />
    </div>
  );
}
