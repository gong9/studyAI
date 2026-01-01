'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
  ArrowLeft, Upload, FileText, ChevronRight, ChevronDown, 
  Sparkles, Loader2, CheckCircle, 
  BookOpen, ListTree, Play, Eye, Plus, LayoutGrid, Clock,
  Target, Book, Settings2, Zap, Cpu, FileCheck, Scale, X, Network, Edit3
} from 'lucide-react';
// BookUnderstandingPanel 已简化，使用左侧智能扫描按钮
import BookKnowledgeGraph from '@/components/teaching/BookKnowledgeGraph';
import { OutlineAdjustModal } from '@/components/teaching/OutlineAdjustModal';
import type { ChapterDAG, BookThesis } from '@/lib/book-understanding/types';
import { cn } from '@/lib/utils';

// 根据项目类型配置不同的文案和图标
type ProjectType = 'tech' | 'policy' | 'legal' | 'teaching' | 'k12';

interface TypeConfig {
  icon: React.ComponentType<{ className?: string }>;
  docLibTitle: string;
  addDocText: string;
  emptyDocText: string;
  indexTitle: string;
  emptyIndexText: string;
  workbenchTitle: string;
  generateBtnText: string;
  generatingText: string;
  selectHint: string;
  headerSubtitle: string;
}

const TYPE_CONFIGS: Record<ProjectType, TypeConfig> = {
  tech: {
    icon: Cpu,
    docLibTitle: '技术文档库',
    addDocText: '添加文档',
    emptyDocText: '暂无文档，请先上传',
    indexTitle: '内容章节索引',
    emptyIndexText: '请上传文档后点击"智能扫描"',
    workbenchTitle: '培训工作台',
    generateBtnText: '生成培训内容',
    generatingText: '正在生成培训讲稿...',
    selectHint: '请在左侧选择章节开始创作',
    headerSubtitle: '技术培训',
  },
  policy: {
    icon: FileCheck,
    docLibTitle: '制度文档',
    addDocText: '添加制度',
    emptyDocText: '暂无制度文档，请先上传',
    indexTitle: '制度条款索引',
    emptyIndexText: '请上传制度文档后点击"智能扫描"',
    workbenchTitle: '培训工作台',
    generateBtnText: '生成培训内容',
    generatingText: '正在生成培训讲稿...',
    selectHint: '请在左侧选择条款开始创作',
    headerSubtitle: '制度培训',
  },
  legal: {
    icon: Scale,
    docLibTitle: '法律文档',
    addDocText: '添加法律',
    emptyDocText: '暂无法律文档，请先上传',
    indexTitle: '法律条文索引',
    emptyIndexText: '请上传法律文档后点击"智能扫描"',
    workbenchTitle: '普法工作台',
    generateBtnText: '生成普法讲座',
    generatingText: '正在生成普法讲稿...',
    selectHint: '请在左侧选择法律条文开始创作',
    headerSubtitle: '普法讲座',
  },
  // 兼容旧数据 k12 和 teaching，映射到 tech
  teaching: {
    icon: Cpu,
    docLibTitle: '技术文档库',
    addDocText: '添加文档',
    emptyDocText: '暂无文档，请先上传',
    indexTitle: '内容章节索引',
    emptyIndexText: '请上传文档后点击"智能扫描"',
    workbenchTitle: '培训工作台',
    generateBtnText: '生成培训内容',
    generatingText: '正在生成培训讲稿...',
    selectHint: '请在左侧选择章节开始创作',
    headerSubtitle: '技术培训',
  },
  k12: {
    icon: Cpu,
    docLibTitle: '技术文档库',
    addDocText: '添加文档',
    emptyDocText: '暂无文档，请先上传',
    indexTitle: '内容章节索引',
    emptyIndexText: '请上传文档后点击"智能扫描"',
    workbenchTitle: '培训工作台',
    generateBtnText: '生成培训内容',
    generatingText: '正在生成培训讲稿...',
    selectHint: '请在左侧选择章节开始创作',
    headerSubtitle: '技术培训',
  },
};

const getTypeConfig = (type: string): TypeConfig => {
  return TYPE_CONFIGS[type as ProjectType] || TYPE_CONFIGS.tech;
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

export default function TeachingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const kbId = params.id as string;

  const [kb, setKb] = useState<any>(null);
  const [chapters, setChapters] = useState<ChapterNode[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selectedChapter, setSelectedChapter] = useState<ChapterNode | null>(null);
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
  const [manuscripts, setManuscripts] = useState<Manuscript[]>([]);
  const [progress, setProgress] = useState({ status: '', message: '', percent: 0 });
  const [activeTab, setActiveTab] = useState<'workbench' | 'records'>('workbench');
  
  // 知识图谱相关状态
  const [chapterDAG, setChapterDAG] = useState<ChapterDAG | null>(null);
  const [bookThesis, setBookThesis] = useState<BookThesis | null>(null);
  const [showKnowledgeGraph, setShowKnowledgeGraph] = useState(false);
  
  // 大纲调整弹窗
  const [showOutlineAdjust, setShowOutlineAdjust] = useState(false);

  // 获取当前项目类型的配置
  const typeConfig = getTypeConfig(kb?.type || 'tech');
  const TypeIcon = typeConfig.icon;

  // 根据项目类型自动确定场景类型
  const getSceneTypeFromKbType = (kbType: string): string => {
    switch (kbType) {
      case 'tech':
      case 'k12':
      case 'teaching':
        return 'tech_training';
      case 'policy':
        return 'company_training';
      case 'legal':
        return 'legal_training';
      default:
        return 'general';
    }
  };

  const sceneType = getSceneTypeFromKbType(kb?.type || 'tech');

  useEffect(() => {
    fetchKnowledgeBase();
    fetchChapters();
    fetchDocuments();
    fetchManuscripts();
  }, [kbId]);

  const fetchKnowledgeBase = async () => {
    try {
      const res = await fetch(`/api/knowledge-bases/${kbId}`);
      if (res.ok) {
        const data = await res.json();
        setKb(data);
      }
    } catch (error) {
      console.error('获取知识库失败:', error);
    }
  };

  const fetchChapters = async () => {
    try {
      const res = await fetch(`/api/teaching/chapters/${kbId}`);
      if (res.ok) {
        const data = await res.json();
        const chaptersData = data.chapters || [];
        setChapters(chaptersData);
        
        // 如果有章节且包含角色信息，自动构建 DAG 用于知识图谱展示
        if (chaptersData.length > 0) {
          fetchDocuments();
          buildDAGFromChapters(chaptersData);
        }
      }
    } catch (error) {
      console.error('获取章节失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 从章节数据构建知识图谱 DAG
  const buildDAGFromChapters = (chaptersData: ChapterNode[]) => {
    // 展平章节树
    const flattenChapters = (nodes: ChapterNode[]): ChapterNode[] => {
      const result: ChapterNode[] = [];
      for (const node of nodes) {
        result.push(node);
        if (node.children && node.children.length > 0) {
          result.push(...flattenChapters(node.children));
        }
      }
      return result;
    };

    const allChapters = flattenChapters(chaptersData);
    
    if (allChapters.length === 0) return;
    
    // 构建 DAG nodes（即使没有角色信息也构建，使用默认值）
    const nodes = allChapters.map((ch, idx) => ({
      id: ch.id,
      title: ch.title,
      role: (ch.metadata?.role || 'core') as 'core' | 'foundation' | 'extension' | 'reference',
      weight: ch.metadata?.role === 'core' ? 1 : 
              ch.metadata?.role === 'foundation' ? 0.8 : 
              ch.metadata?.role === 'extension' ? 0.6 : 0.5,
    }));

    // 构建 DAG edges（从 dependencies，或按顺序连接）
    const edges: Array<{ from: string; to: string; type: 'prerequisite' | 'parallel' | 'supplement' }> = [];
    
    // 先检查是否有任何依赖信息
    const hasDependencyInfo = allChapters.some(ch => 
      ch.metadata?.dependencies && ch.metadata.dependencies.length > 0
    );
    
    if (hasDependencyInfo) {
      // 使用显式的依赖关系
      for (const ch of allChapters) {
        const deps = ch.metadata?.dependencies || [];
        for (const depId of deps) {
          if (allChapters.some(c => c.id === depId)) {
            edges.push({
              from: depId,
              to: ch.id,
              type: 'prerequisite',
            });
          }
        }
      }
    } else {
      // 没有依赖信息时，按阅读顺序连接（前后章节相连）
      for (let i = 1; i < allChapters.length; i++) {
        const prevCh = allChapters[i - 1];
        const currCh = allChapters[i];
        edges.push({
          from: prevCh.id,
          to: currCh.id,
          type: 'prerequisite',
        });
      }
    }

    setChapterDAG({ nodes, edges });
  };

  const fetchDocuments = async () => {
    try {
      const res = await fetch(`/api/knowledge-bases/${kbId}`);
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents || []);
      }
    } catch (error) {
      console.error('获取文档失败:', error);
    }
  };

  const fetchManuscripts = async () => {
    try {
      const res = await fetch(`/api/teaching/manuscripts/${kbId}`);
      if (res.ok) {
        const data = await res.json();
        setManuscripts(data.manuscripts || []);
      }
    } catch (error) {
      console.error('获取手稿列表失败:', error);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const uploadedDocs: any[] = [];
      
      // 1. 上传所有文件
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('knowledgeBaseId', kbId);
        const res = await fetch('/api/documents/upload', {
          method: 'POST',
          body: formData,
        });
        if (!res.ok) throw new Error('上传失败');
        const doc = await res.json();
        uploadedDocs.push(doc);
      }
      
      // 2. 为每个文档建立索引（后台执行，不阻塞用户）
      for (const doc of uploadedDocs) {
        processDocumentIndex(doc.id);
      }
      
      fetchDocuments();
      
      // 3. 根据项目类型决定后续操作
      const currentType = kb?.type || 'tech';
      if (currentType === 'policy') {
        // 制度培训：直接为每个文档创建一个"章节"条目
        await createChaptersFromDocuments(uploadedDocs);
      }
                      // 技术培训：不自动扫描，等用户手动点击"智能扫描"按钮
      // 因为索引还在后台创建中，需要等索引完成后才能扫描
    } catch (error) {
      console.error('上传失败:', error);
      alert('上传失败，请重试');
    } finally {
      setUploading(false);
    }
  };

  // 制度培训专用：直接将文档作为章节
  const createChaptersFromDocuments = async (docs: any[]) => {
    try {
      const res = await fetch('/api/teaching/chapters/create-from-docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          knowledgeBaseId: kbId, 
          documents: docs.map(d => ({ id: d.id, name: d.name }))
        }),
      });
      if (res.ok) {
        await fetchChapters();
      }
    } catch (error) {
      console.error('创建章节失败:', error);
    }
  };

  // 处理单个文档的索引构建（后台执行）
  const processDocumentIndex = async (documentId: string) => {
    try {
      console.log(`[Teaching] Processing document index: ${documentId}`);
      
      // 调用文档处理 API（会建立向量索引）
      const response = await fetch(`/api/documents/${documentId}/process`);
      
      if (!response.ok) {
        console.error(`[Teaching] Failed to process document ${documentId}`);
        return;
      }
      
      // 读取 SSE 流
      const reader = response.body?.getReader();
      if (!reader) return;
      
      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const text = decoder.decode(value);
        // 解析 SSE 事件
        const lines = text.split('\n');
        for (const line of lines) {
          if (line.startsWith('data:')) {
            try {
              // 去掉 'data:' 前缀和可能的空格
              const jsonStr = line.replace(/^data:\s*/, '');
              if (!jsonStr) continue;
              
              const data = JSON.parse(jsonStr);
              console.log(`[Teaching] Index progress: ${data.message}`);
              
              if (data.status === 'completed') {
                console.log(`[Teaching] Document ${documentId} indexed successfully`);
                fetchDocuments(); // 刷新状态
              }
            } catch (e) {
              // ignore parse errors
            }
          }
        }
      }
    } catch (error) {
      console.error(`[Teaching] Error processing document ${documentId}:`, error);
    }
  };

  const [extractProgress, setExtractProgress] = useState('');
  
  const handleExtractChapters = async () => {
    setExtracting(true);
    setExtractProgress('正在智能扫描...');
    try {
      // 使用新的全书理解 skim API
      const res = await fetch('/api/book-understanding/skim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ knowledgeBaseId: kbId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        // 保存知识图谱数据
        if (data.chapterDAG) {
          setChapterDAG(data.chapterDAG);
        }
        if (data.thesis) {
          setBookThesis(data.thesis);
        }
        // 提取成功后，重新从数据库获取章节
        await fetchChapters();
        await fetchDocuments();
      } else {
        throw new Error(data.error || '智能扫描失败');
      }
    } catch (error: any) {
      console.error('智能扫描失败:', error);
      alert(error.message || '智能扫描失败');
    } finally {
      setExtracting(false);
      setExtractProgress('');
    }
  };

  const handleGenerate = async () => {
    if (!selectedChapter) {
      alert('请先选择章节');
      return;
    }
    setGenerating(true);
    setProgress({ status: 'starting', message: '正在规划教学方案...', percent: 10 });
    try {
      const planRes = await fetch('/api/teaching/manuscript/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterId: selectedChapter.id, sceneType }),
      });
      if (!planRes.ok) throw new Error('规划失败');
      const planData = await planRes.json();
      const manuscriptId = planData.manuscriptId;
      setProgress({ status: 'draft', message: '正在编写教学手稿...', percent: 50 });
      const draftRes = await fetch('/api/teaching/manuscript/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manuscriptId }),
      });
      if (!draftRes.ok) throw new Error('编写失败');
      setProgress({ status: 'completed', message: '生成成功！', percent: 100 });
      fetchManuscripts();
      setTimeout(() => {
        router.push(`/dashboard/teaching/${kbId}/manuscript/${manuscriptId}`);
      }, 800);
    } catch (error: any) {
      console.error('生成失败:', error);
      setProgress({ status: 'failed', message: error.message || '生成失败', percent: 0 });
    } finally {
      setGenerating(false);
    }
  };

  const toggleChapter = (id: string) => {
    setExpandedChapters(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderChapterTree = (nodes: ChapterNode[], depth = 0) => {
    return nodes.map(node => {
      const hasChildren = node.children && node.children.length > 0;
      const isExpanded = expandedChapters.has(node.id);
      const isSelected = selectedChapter?.id === node.id;

      return (
        <div key={node.id} className="select-none">
          <div
            className={cn(
              "flex items-center gap-2.5 px-3 py-2.5 rounded-md cursor-pointer text-sm transition-all relative group",
              isSelected 
                ? "bg-zinc-100 text-zinc-900 font-semibold" 
                : "text-zinc-700 hover:bg-zinc-50",
              node.level === 1 && "font-medium"
            )}
            onClick={() => {
              setSelectedChapter(node);
              if (hasChildren) toggleChapter(node.id);
            }}
            style={{ paddingLeft: `${depth * 16 + 12}px` }}
          >
            {/* 选中指示条 */}
            {isSelected && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-zinc-900 rounded-r" />}
            
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown className="w-4 h-4 text-zinc-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-zinc-400" />
              )
            ) : (
              <div className="w-4" />
            )}
            <BookOpen className={cn("w-4 h-4 transition-colors", isSelected ? "text-zinc-700" : "text-zinc-400 group-hover:text-zinc-500")} />
            <span className="flex-1 truncate leading-tight">
              {node.title}
            </span>
          </div>
          {hasChildren && isExpanded && (
            <div className="mt-0.5">
              {renderChapterTree(node.children, depth + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="h-screen flex flex-col bg-zinc-50/50 overflow-hidden font-sans">
      {/* Header */}
      <header className="flex-shrink-0 z-30 w-full bg-white/80 backdrop-blur-xl border-b border-zinc-200">
        <div className="container mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push('/dashboard')}
              className="text-zinc-500 hover:text-zinc-900 h-9 w-9"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-zinc-900 rounded-lg flex items-center justify-center shadow-sm">
                <TypeIcon className="w-5 h-5 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="text-base font-semibold text-zinc-900 tracking-tight">
                  {kb?.name || '项目详情'}
                </span>
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                  {typeConfig.headerSubtitle}
                </span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-zinc-500 bg-zinc-100 px-3 py-1 rounded-full border border-zinc-200">
              <span className="w-2 h-2 inline-block bg-zinc-900 rounded-full mr-2 animate-pulse" />
              AI 助手就绪
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        <div className="container mx-auto h-full px-6 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
            {/* 左侧：资源与目录 */}
            <div className="lg:col-span-4 flex flex-col gap-6 h-full overflow-hidden">
              <div className="flex-1 bg-white border border-zinc-200 rounded-xl shadow-sm flex flex-col overflow-hidden">
                {/* 顶部：文档库 */}
                <div className="p-5 border-b border-zinc-100 flex-shrink-0 bg-white">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-zinc-600" />
                      {typeConfig.docLibTitle}
                    </h3>
                    <label className="text-xs font-semibold text-zinc-700 hover:text-zinc-900 cursor-pointer flex items-center gap-1 bg-zinc-100 px-2 py-1 rounded border border-zinc-200 transition-colors hover:bg-zinc-200">
                      <Plus className="w-3.5 h-3.5" />
                      {typeConfig.addDocText}
                      <input type="file" className="hidden" accept=".pdf,.docx,.txt" onChange={handleFileUpload} disabled={uploading} />
                    </label>
                  </div>
                  
                  <div className="space-y-2.5 max-h-[140px] overflow-y-auto custom-scrollbar pr-1">
                    {documents.length === 0 ? (
                      <div className="text-center py-6 border border-dashed border-zinc-200 rounded-lg bg-zinc-50">
                        <span className="text-xs text-zinc-400">{typeConfig.emptyDocText}</span>
                      </div>
                    ) : (
                      documents.map((doc: any) => (
                        <div key={doc.id} className="flex items-center gap-3 text-sm text-zinc-900 bg-zinc-50/80 px-3 py-2.5 rounded-lg border border-zinc-200 hover:border-zinc-300 hover:bg-white transition-all">
                          <FileText className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                          <span className="truncate flex-1 font-semibold">{doc.name}</span>
                          <div className={cn(
                            "w-2 h-2 rounded-full",
                            doc.status === 'completed' ? "bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.4)]" : "bg-amber-500 animate-pulse"
                          )} />
                        </div>
                      ))
                    )}
                  </div>
                  {uploading && (
                    <div className="text-xs text-zinc-700 font-bold mt-3 flex items-center gap-2 bg-zinc-100 py-2 px-3 rounded-lg border border-zinc-200">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      正在同步云端...
                    </div>
                  )}
                </div>

                {/* 底部：目录索引 */}
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="px-5 py-4 border-b border-zinc-100 flex justify-between items-center bg-zinc-50/50">
                    <h3 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                      <ListTree className="w-4 h-4 text-zinc-600" />
                      {typeConfig.indexTitle}
                    </h3>
                    {/* 技术培训需要智能扫描按钮 + 知识图谱按钮 */}
                    {documents.length > 0 && kb?.type !== 'policy' && (
                      <div className="flex items-center gap-1">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={handleExtractChapters} 
                          disabled={extracting} 
                          className="h-7 text-xs font-bold text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100"
                        >
                          {extracting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : '智能扫描'}
                        </Button>
                        {/* 知识图谱按钮 - 扫描后可用 */}
                        {chapterDAG && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowKnowledgeGraph(true)}
                            className="h-7 w-7 p-0 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100"
                            title="查看知识图谱"
                          >
                            <Network className="w-4 h-4" />
                          </Button>
                        )}
                        {/* 大纲调整按钮 - 扫描后可用 */}
                        {chapters.length > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowOutlineAdjust(true)}
                            className="h-7 w-7 p-0 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100"
                            title="调整大纲"
                          >
                            <Edit3 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 bg-white custom-scrollbar">
                    {loading ? (
                      <div className="flex flex-col items-center justify-center py-20 gap-3">
                        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
                        <span className="text-xs text-zinc-400 font-medium tracking-wider uppercase">Loading Index</span>
                      </div>
                    ) : chapters.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20 text-zinc-400 text-center px-6">
                        <BookOpen className="w-10 h-10 mb-3 opacity-20" />
                        <p className="text-xs font-medium leading-relaxed">
                          暂无目录数据<br/>
                          {kb?.type === 'policy' 
                            ? '请上传制度文档，系统将自动创建条目' 
                            : typeConfig.emptyIndexText}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-0.5">
                        {renderChapterTree(chapters)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 右侧：工作台 */}
            <div className="lg:col-span-8 flex flex-col h-full overflow-hidden pb-4">
              <div className="bg-white border border-zinc-200 rounded-xl shadow-sm flex-1 flex flex-col overflow-hidden">
                {/* Tabs */}
                <div className="flex border-b border-zinc-200 px-6 pt-4 bg-white flex-shrink-0">
                  <button
                    onClick={() => setActiveTab('workbench')}
                    className={cn(
                      "pb-3.5 px-6 text-sm font-bold transition-all relative flex items-center gap-2 group",
                      activeTab === 'workbench' ? "text-zinc-900" : "text-zinc-500 hover:text-zinc-800"
                    )}
                  >
                    <LayoutGrid className={cn("w-4 h-4", activeTab === 'workbench' ? "text-zinc-700" : "text-zinc-400 group-hover:text-zinc-600")} />
                    {typeConfig.workbenchTitle}
                    {activeTab === 'workbench' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-zinc-900" />}
                  </button>
                  <button
                    onClick={() => setActiveTab('records')}
                    className={cn(
                      "pb-3.5 px-6 text-sm font-bold transition-all relative ml-2 flex items-center gap-2 group",
                      activeTab === 'records' ? "text-zinc-900" : "text-zinc-500 hover:text-zinc-800"
                    )}
                  >
                    <Clock className={cn("w-4 h-4", activeTab === 'records' ? "text-zinc-700" : "text-zinc-400 group-hover:text-zinc-600")} />
                    历史产出
                    {manuscripts.length > 0 && (
                      <span className={cn(
                        "px-1.5 py-0.5 rounded-md text-[10px] ml-1 font-black",
                        activeTab === 'records' ? "bg-zinc-200 text-zinc-800" : "bg-zinc-100 text-zinc-600"
                      )}>
                        {manuscripts.length}
                      </span>
                    )}
                    {activeTab === 'records' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-zinc-900" />}
                  </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto bg-zinc-50/50 custom-scrollbar">
                  {activeTab === 'workbench' ? (
                    selectedChapter ? (
                      <div className="max-w-4xl mx-auto py-16 px-10 h-full flex flex-col">
                        <div className="bg-white rounded-xl border border-zinc-200 shadow-[0_10px_40px_rgba(0,0,0,0.04)] flex flex-col overflow-hidden transition-all duration-500 hover:shadow-[0_15px_50px_rgba(0,0,0,0.06)]">
                          
                          <div className="p-12 flex flex-col flex-1">
                            {/* 顶部指示器 */}
                            <div className="flex items-center gap-3 mb-10">
                              <div className="px-2.5 py-0.5 bg-zinc-100 text-zinc-700 text-[11px] font-bold rounded border border-zinc-200 tracking-wider">
                                第 {selectedChapter.orderIndex + 1} 章节
                              </div>
                              <div className="h-1 w-1 bg-zinc-300 rounded-full" />
                              <div className="text-[11px] font-bold text-zinc-400 tracking-widest uppercase">准备就绪 · 待生成</div>
                            </div>

                            {/* 标题区 - 极简主义排版 */}
                            <div className="mb-12">
                              <h2 className="text-3xl font-bold text-zinc-900 tracking-tight leading-tight mb-6">
                                {selectedChapter.title}
                              </h2>
                              {selectedChapter.contentPreview ? (
                                <p className="text-base text-zinc-500 leading-relaxed font-medium max-w-2xl">
                                  {selectedChapter.contentPreview}
                                </p>
                              ) : (
                                <div className="h-px w-20 bg-zinc-100" />
                              )}
                            </div>

                            {/* 参数信息 - 模块化极简 */}
                            <div className="grid grid-cols-3 gap-12 py-10 border-t border-zinc-100">
                              <div>
                                <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">项目类型</div>
                                <div className="text-base font-bold text-zinc-800">{typeConfig.headerSubtitle}</div>
                              </div>
                              <div>
                                <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">智能等级</div>
                                <div className="text-base font-bold text-zinc-800">Agentic RAG v4</div>
                              </div>
                              <div>
                                <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">预估耗时</div>
                                <div className="text-base font-bold text-zinc-800 tracking-tight">约 45 - 60 秒</div>
                              </div>
                            </div>

                            {/* 核心操作区 - 灵魂按钮 */}
                            <div className="mt-12 flex flex-col items-center pt-10 border-t border-zinc-50/50">
                              <div className="relative group">
                                {/* 按钮背后的柔光层 */}
                                <div className="absolute -inset-1 bg-zinc-900 rounded blur-md opacity-20 group-hover:opacity-30 transition duration-500" />
                                
                                <Button
                                  className={cn(
                                    "relative min-w-[320px] h-14 text-base font-bold rounded transition-all duration-300 active:scale-[0.98] flex items-center justify-center gap-3 shadow-lg shadow-zinc-200",
                                    generating 
                                      ? "bg-white text-zinc-400 border border-zinc-100 shadow-none" 
                                      : "bg-zinc-900 hover:bg-zinc-800 text-white"
                                  )}
                                  onClick={handleGenerate}
                                  disabled={generating}
                                >
                                  {generating ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                  ) : (
                                    <Sparkles className="w-5 h-5" />
                                  )}
                                  <span className="tracking-wider">
                                    {generating ? typeConfig.generatingText : typeConfig.generateBtnText}
                                  </span>
                                </Button>
                              </div>

                              {generating && (
                                <div className="w-full max-w-sm mt-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
                                  <div className="flex justify-between items-center mb-4 px-1">
                                    <div className="flex items-center gap-2">
                                      <div className="w-1.5 h-1.5 bg-zinc-900 rounded-full animate-ping" />
                                      <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">{progress.message}</span>
                                    </div>
                                    <span className="text-xl font-bold text-zinc-900 tabular-nums tracking-tighter">{progress.percent}%</span>
                                  </div>
                                  <div className="h-1 bg-zinc-100 rounded-full overflow-hidden">
                                    <div 
                                      className="h-full bg-zinc-900 transition-all duration-1000 ease-out" 
                                      style={{ width: `${progress.percent}%` }}
                                    />
                                  </div>
                                </div>
                              )}
                              
                              {!generating && (
                                <div className="mt-8 flex items-center gap-2 text-zinc-400">
                                  <CheckCircle className="w-3.5 h-3.5" />
                                  <span className="text-[10px] font-bold uppercase tracking-widest">已通过安全与隐私加密校验</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-zinc-300">
                        <div className="w-16 h-16 rounded bg-white shadow-sm border border-zinc-100 flex items-center justify-center mb-6">
                          <LayoutGrid className="w-8 h-8 opacity-10" />
                        </div>
                        <p className="text-sm font-bold tracking-widest text-zinc-400 uppercase">{typeConfig.selectHint}</p>
                      </div>
                    )
                  ) : (
                    <div className="max-w-4xl mx-auto p-8">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {manuscripts.map(m => (
                          <div 
                            key={m.id} 
                            className="bg-white p-5 rounded-2xl border border-zinc-200 hover:shadow-xl hover:border-zinc-300 transition-all cursor-pointer flex flex-col group relative overflow-hidden" 
                            onClick={() => router.push(`/dashboard/teaching/${kbId}/manuscript/${m.id}`)}
                          >
                            <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity">
                              <FileText className="w-16 h-16" />
                            </div>
                            
                            <div className="flex items-center gap-3 mb-4">
                              <div className="w-10 h-10 bg-zinc-100 text-zinc-700 rounded-xl flex items-center justify-center border border-zinc-200 transition-colors group-hover:bg-zinc-900 group-hover:text-white">
                                <FileText className="w-5 h-5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="text-base font-bold text-zinc-900 truncate group-hover:text-zinc-700 transition-colors">{m.chapterTitle}</h4>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-[10px] font-bold text-zinc-500 uppercase">{new Date(m.createdAt).toLocaleDateString('zh-CN')}</span>
                                  <span className={cn(
                                    "px-2 py-0.5 rounded-full text-[10px] font-bold border",
                                    m.status === 'completed' 
                                      ? "bg-green-50 text-green-700 border-green-200" 
                                      : "bg-zinc-50 text-zinc-600 border-zinc-300"
                                  )}>
                                    {m.status === 'completed' ? '已就绪' : '处理中'}
                                  </span>
                                </div>
                              </div>
                            </div>
                            
                            <div className="mt-auto pt-4 border-t border-zinc-50 flex items-center justify-between">
                              <div className="flex gap-1.5">
                                {m.hasSlidev && <div className="w-6 h-6 bg-zinc-50 rounded flex items-center justify-center"><Eye className="w-3.5 h-3.5 text-zinc-400" /></div>}
                                {m.hasEnriched && <div className="w-6 h-6 bg-zinc-50 rounded flex items-center justify-center"><Sparkles className="w-3.5 h-3.5 text-zinc-400" /></div>}
                              </div>
                              <div className="text-[10px] font-black text-zinc-400 group-hover:text-zinc-900 flex items-center gap-1 uppercase tracking-widest transition-all">
                                进入工作区 <ChevronRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      {manuscripts.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-20 text-zinc-400">
                          <Clock className="w-12 h-12 mb-4 opacity-10" />
                          <p className="text-sm font-medium">暂无产出记录</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      
      {/* 知识图谱弹窗 */}
      {showKnowledgeGraph && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-[90vw] max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
            {/* 弹窗头部 */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 bg-zinc-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center shadow-sm">
                  <Network className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-zinc-900">全书知识图谱</h2>
                  {bookThesis && (
                    <p className="text-xs text-zinc-500 mt-0.5">{bookThesis.title || bookThesis.topic}</p>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowKnowledgeGraph(false)}
                className="h-8 w-8 p-0 text-zinc-400 hover:text-zinc-900"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
            
            {/* 弹窗内容 */}
            <div className="flex-1 p-6 overflow-auto">
              {chapterDAG ? (
                <BookKnowledgeGraph
                  chapterDAG={chapterDAG}
                  viewMode="chapters"
                  height={500}
                  onNodeClick={(node) => {
                    // 点击章节节点，选中对应章节
                    if (node.type === 'chapter') {
                      const chapterId = node.id.replace('ch_', '');
                      const chapter = chapters.find(c => c.id === chapterId);
                      if (chapter) {
                        setSelectedChapter(chapter);
                        setShowKnowledgeGraph(false);
                      }
                    }
                  }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-64 text-zinc-400">
                  <Network className="w-12 h-12 mb-4 opacity-20" />
                  <p className="text-sm">请先进行智能扫描</p>
                </div>
              )}
            </div>
            
            {/* 弹窗底部信息 */}
            {bookThesis && (
              <div className="px-6 py-3 border-t border-zinc-100 bg-zinc-50/50">
                <div className="flex items-center gap-4 text-xs text-zinc-500">
                  <span>📚 {bookThesis.knowledgeType || '知识型'}</span>
                  <span>🎯 {bookThesis.audience || '通用读者'}</span>
                  {chapterDAG && (
                    <span>📖 {chapterDAG.nodes.length} 个章节</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 大纲调整弹窗 */}
      <OutlineAdjustModal
        open={showOutlineAdjust}
        onOpenChange={setShowOutlineAdjust}
        knowledgeBaseId={params.id as string}
        onSuccess={() => {
          // 重新获取章节列表（会自动重建 DAG）
          fetchChapters();
        }}
      />
    </div>
  );
}
