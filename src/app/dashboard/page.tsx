'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';

// 自定义登出函数，确保跳转到当前环境的登录页
const handleSignOut = async () => {
  await signOut({ redirect: false });
  window.location.replace('/login'); // 使用 replace 不留历史记录
};
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { 
  LogOut, Plus, Trash2, FileText, 
  Clock, Sparkles, Cpu, FileCheck, ArrowRight, Scale, GraduationCap, BookOpen
} from 'lucide-react';
import { formatDate } from '@/lib/utils';

type ScenarioType = 'tech' | 'legal' | 'storytelling';
type SourceModeType = 'book' | 'docs' | 'fragments' | 'paper';

interface SourceModeConfig {
  id: SourceModeType;
  name: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}

const sourceModes: SourceModeConfig[] = [
  {
    id: 'book',
    name: '书籍',
    desc: '一本完整的书籍或教材',
    icon: FileText,
  },
  {
    id: 'docs',
    name: '文档集',
    desc: '多个独立的技术文档',
    icon: FileCheck,
  },
  {
    id: 'fragments',
    name: '碎片资料',
    desc: '零散的笔记、文章等',
    icon: Sparkles,
  },
  {
    id: 'paper',
    name: '论文',
    desc: '学术论文或技术报告',
    icon: GraduationCap,
  },
];

interface ScenarioConfig {
  id: ScenarioType;
  name: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string; // 点缀色
  accentBg: string;    // 点缀背景
  accentBorder: string; // 点缀边框
  examples: string[];
  placeholder: string; // 项目名称示例
}

const scenarios: ScenarioConfig[] = [
  {
    id: 'tech',
    name: '技术培训',
    desc: '技术手册快速转化为 AI 课程',
    icon: Cpu,
    accentColor: 'text-zinc-600',
    accentBg: 'bg-zinc-100/50',
    accentBorder: 'group-hover:border-zinc-500',
    examples: ['技术入门', '产品功能', '接口讲解'],
    placeholder: '例如：Python 入门教程',
  },
  {
    id: 'legal',
    name: '普法讲座',
    desc: '法律条文转化为通俗易懂的科普讲座',
    icon: Scale,
    accentColor: 'text-zinc-600',
    accentBg: 'bg-zinc-50',
    accentBorder: 'group-hover:border-zinc-400',
    examples: ['劳动法', '民法典', '消费维权'],
    placeholder: '例如：劳动者权益保护',
  },
  {
    id: 'storytelling',
    name: '讲书',
    desc: '书籍转有声评书，像单田芳一样讲故事',
    icon: BookOpen,
    accentColor: 'text-amber-600',
    accentBg: 'bg-amber-50',
    accentBorder: 'group-hover:border-amber-400',
    examples: ['历史书', '古典小说', '名人传记'],
    placeholder: '例如：明朝那些事儿',
  },
];

const getScenarioConfig = (type: string): ScenarioConfig => {
  const normalizedType = type === 'teaching' || type === 'k12' ? 'tech' : type;
  return scenarios.find(s => s.id === normalizedType) || scenarios[0];
};

interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  type: string;
  sourceMode?: string;
  createdAt: string;
  _count: {
    documents: number;
    chapters?: number;
  };
}

// 分页已移除，显示所有项目

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [legalManuscripts, setLegalManuscripts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState<ScenarioType>('tech');
  const [activeFilter, setActiveFilter] = useState<ScenarioType | 'all'>('all');
  const [newKB, setNewKB] = useState({ name: '', description: '', type: 'tech' as ScenarioType, sourceMode: 'book' as SourceModeType });

  // 检测未登录状态，重定向到登录页
  useEffect(() => {
    if (status === 'unauthenticated') {
      window.location.replace('/login');
    }
  }, [status]);

  useEffect(() => {
    fetchKnowledgeBases();
    fetchLegalManuscripts();
  }, []);

  const fetchKnowledgeBases = async () => {
    try {
      const response = await fetch('/api/knowledge-bases');
      if (response.ok) {
        const data = await response.json();
        const scenarioKBs = data.filter((kb: any) => 
          ['tech', 'legal', 'teaching', 'k12'].includes(kb.type)
        );
        setKnowledgeBases(scenarioKBs);
      }
    } catch (error) {
      console.error('获取失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLegalManuscripts = async () => {
    try {
      const response = await fetch('/api/legal/manuscripts');
      if (response.ok) {
        const data = await response.json();
        setLegalManuscripts(data.manuscripts || []);
      }
    } catch (error) {
      console.error('获取普法讲稿失败:', error);
    }
  };

  const handleCreate = async (e: any) => {
    e.preventDefault();
    setCreating(true);
    try {
      const response = await fetch('/api/knowledge-bases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newKB),
      });
      if (response.ok) {
        const kb = await response.json();
        setShowCreateForm(false);
        setNewKB({ name: '', description: '', type: 'tech', sourceMode: 'book' });
        router.push(`/dashboard/teaching/${kb.id}`);
      } else {
        const error = await response.json();
        alert(`创建失败: ${error.message || '请稍后重试'}`);
      }
    } catch (error) {
      console.error('创建失败:', error);
      alert('创建失败，请检查网络连接');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, e: any) => {
    e.stopPropagation();
    if (!confirm('确定要删除这个项目吗？')) return;
    try {
      const response = await fetch(`/api/knowledge-bases/${id}`, { method: 'DELETE' });
      if (response.ok) fetchKnowledgeBases();
    } catch (error) {}
  };

  const getScenarioCount = (scenarioId: ScenarioType) => {
    if (scenarioId === 'legal') {
      return legalManuscripts.length;
    }
    return knowledgeBases.filter(kb => (kb.type === 'teaching' || kb.type === 'k12' ? 'tech' : kb.type) === scenarioId).length;
  };

  // 将普法讲稿转换为统一的项目格式
  const legalProjects = legalManuscripts.map(m => ({
    id: m.id,
    name: m.title,
    description: `${m.metadata?.lawName || '法律讲座'} · ${m.metadata?.audience || '普通群众'}`,
    type: 'legal' as const,
    createdAt: m.createdAt,
    _count: { documents: 0 },
    _isManuscript: true,
    _kbId: m.kbId,
  }));

  const allProjects = [...knowledgeBases, ...legalProjects];

  const filteredKBs = activeFilter === 'all' 
    ? allProjects 
    : allProjects.filter(kb => (kb.type === 'teaching' || kb.type === 'k12' ? 'tech' : kb.type) === activeFilter);

  const sortedKBs = [...filteredKBs].sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );


  return (
    <div className="h-screen bg-[#fafafa] text-zinc-900 flex flex-col overflow-hidden font-sans">
      {/* 顶部导航 - 精简高度 */}
      <nav className="flex-none bg-white border-b border-zinc-100 z-50">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5 group cursor-pointer">
            <div className="relative w-8 h-8 flex items-center justify-center">
              <div className="absolute inset-0 bg-zinc-900 rounded-lg transform rotate-3 transition-transform group-hover:rotate-6"></div>
              <Sparkles className="relative w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight">StudyAI</span>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5 px-3 py-1 bg-zinc-50 rounded-full border border-zinc-100">
              <div className="w-5 h-5 rounded-full bg-zinc-900 flex items-center justify-center text-[10px] font-bold text-white">
                {session?.user?.name?.[0]?.toUpperCase()}
              </div>
              <span className="text-sm font-semibold text-zinc-700">{session?.user?.name}</span>
            </div>
            <button onClick={handleSignOut} className="text-zinc-400 hover:text-zinc-900 p-1 rounded-lg transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-6 flex flex-col min-h-0 space-y-6">
        
        {/* 标题区 */}
        <div className="flex-none flex flex-col">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">工作台</h1>
          <p className="text-zinc-400 text-sm font-medium">选择一个应用场景，开始您的 AI 数字化创作</p>
        </div>

        {/* 场景入口卡片 */}
        <div className="flex-none grid grid-cols-1 md:grid-cols-3 gap-5">
          {scenarios.map((scenario) => {
            const count = getScenarioCount(scenario.id);
            return (
              <div 
                key={scenario.id}
                onClick={() => {
                  // 普法讲座跳转到专门入口页
                  if (scenario.id === 'legal') {
                    router.push('/dashboard/legal');
                    return;
                  }
                  // 讲书场景跳转到专门入口页
                  if (scenario.id === 'storytelling') {
                    router.push('/dashboard/storytelling');
                    return;
                  }
                  setSelectedScenario(scenario.id);
                  setNewKB({ ...newKB, type: scenario.id, sourceMode: 'book' });
                  setShowCreateForm(true);
                }}
                className={`group relative bg-white border border-zinc-200 rounded-xl px-5 py-5 transition-all duration-300 cursor-pointer hover:shadow-lg ${scenario.accentBorder}`}
              >
                {/* 顶部彩色指示条 */}
                <div className={`absolute top-0 left-0 right-0 h-1 rounded-t-xl opacity-0 group-hover:opacity-100 transition-opacity ${scenario.accentColor.replace('text', 'bg')}`} />
                
                {/* 顶部：图标 + 项目数 */}
                <div className="flex items-start justify-between mb-4">
                  <div className="relative group/icon w-11 h-11 flex items-center justify-center">
                    {/* 背景：极其微弱的磨砂感 */}
                    <div className="absolute inset-0 bg-white border border-zinc-200 rounded-xl shadow-sm transform rotate-3 group-hover/icon:rotate-6 transition-transform duration-500" />
                    
                    {/* 极其细微的彩色点缀：仅在左上角一个圆点 */}
                    <div className={`absolute -top-0.5 -left-0.5 w-2.5 h-2.5 rounded-full border-2 border-white shadow-sm ${scenario.accentColor.replace('text', 'bg')} z-20`} />
                    
                    {/* 主色图标 */}
                    <div className="relative z-10 transform -rotate-3 group-hover/icon:-rotate-6 transition-transform duration-500">
                      <scenario.icon className={`w-5 h-5 text-zinc-900`} />
                    </div>
                  </div>
                  
                  <div className={`flex items-center gap-1.5 px-2 py-1 bg-zinc-50 rounded-lg border border-zinc-100 group-hover:border-zinc-300 transition-all`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${scenario.accentColor.replace('text', 'bg')}`} />
                    <span className="text-[10px] font-bold text-zinc-600">{count} 项目</span>
                  </div>
                </div>
                
                {/* 中部：标题 + 描述 */}
                <div className="mb-4">
                  <h3 className="text-lg font-bold text-zinc-900 mb-1.5">{scenario.name}</h3>
                  <p className="text-xs font-medium text-zinc-500 leading-relaxed line-clamp-2 h-8">{scenario.desc}</p>
                </div>

                {/* 底部：标签 + 箭头 */}
                <div className="flex items-center justify-between pt-4 border-t border-zinc-100">
                  <div className="flex gap-1.5">
                    {scenario.examples.slice(0, 2).map((ex, i) => (
                      <span key={i} className={`text-[10px] font-medium px-2 py-0.5 rounded-lg border border-zinc-100 bg-zinc-50 text-zinc-500`}>
                        {ex}
                      </span>
                    ))}
                  </div>
                  <ArrowRight className={`w-4 h-4 text-zinc-300 group-hover:translate-x-1 transition-all ${scenario.accentColor}`} />
                </div>
              </div>
            );
          })}
        </div>

        {/* 最近项目区域 - 可滚动列表区 */}
        <div className="flex-1 flex flex-col space-y-4" style={{ minHeight: 0, overflow: 'hidden' }}>
          <div className="flex-none flex items-center justify-between border-b border-zinc-100 pb-2">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-zinc-900" />
              <h2 className="text-base font-bold text-zinc-900">最近项目</h2>
            </div>
            
            {/* 过滤器 */}
            <div className="flex gap-1">
              <button 
                onClick={() => setActiveFilter('all')}
                className={`text-[11px] font-bold px-4 py-1 rounded-lg transition-all ${activeFilter === 'all' ? 'bg-zinc-900 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-600'}`}
              >
                全部
              </button>
              {scenarios.map(s => (
                <button 
                  key={s.id}
                  onClick={() => setActiveFilter(s.id)}
                  className={`text-[11px] font-bold px-4 py-1 rounded-lg transition-all ${activeFilter === s.id ? 'bg-zinc-900 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-600'}`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>

          {/* 滚动网格列表 */}
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar" style={{ minHeight: 0 }}>
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-32 bg-zinc-100 animate-pulse rounded-xl" />)}
              </div>
            ) : sortedKBs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center bg-zinc-50/50 rounded-xl border border-dashed border-zinc-200 py-10">
                <p className="text-sm font-bold text-zinc-300">暂无项目，点击上方卡片创建</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 pb-6">
                {sortedKBs.map((kb) => {
                  const config = getScenarioConfig(kb.type);
                  return (
                    <div 
                      key={kb.id}
                      onClick={() => {
                        // 普法讲稿直接跳转到讲稿编辑页面
                        if ((kb as any)._isManuscript) {
                          router.push(`/dashboard/teaching/${(kb as any)._kbId}/manuscript/${kb.id}`);
                        } else if (kb.type === 'legal') {
                          router.push('/dashboard/legal');
                        } else {
                          router.push(`/dashboard/teaching/${kb.id}`);
                        }
                      }}
                      className="group bg-white border border-zinc-200 rounded-xl p-5 hover:border-zinc-900 transition-all duration-300 cursor-pointer flex flex-col h-full hover:shadow-md"
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div className={`flex items-center gap-1.5 px-2 py-1 bg-zinc-50 border border-zinc-100 rounded-md group-hover:border-zinc-300 transition-all`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${config.accentColor.replace('text', 'bg')}`} />
                          <span className="text-[10px] font-bold text-zinc-600">
                            {(kb as any)._isManuscript ? '普法讲稿' : config.name}
                          </span>
                        </div>
                        {/* 普法讲稿暂不支持删除 */}
                        {!(kb as any)._isManuscript && (
                          <button
                            onClick={(e) => handleDelete(kb.id, e)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-300 hover:bg-red-50 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <h4 className="text-base font-bold text-zinc-900 mb-1 truncate group-hover:text-zinc-700">{kb.name}</h4>
                      <p className="text-xs font-medium text-zinc-400 line-clamp-1 mb-4">{kb.description || '暂无描述内容'}</p>
                      
                      <div className="mt-auto flex items-center justify-between pt-4 border-t border-zinc-50">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-400">
                          <FileText className="w-3.5 h-3.5" />
                          <span>{(kb as any)._isManuscript ? '讲稿' : `${kb._count.documents} 文档`}</span>
                        </div>
                        <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-tighter">{formatDate(kb.createdAt)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* 创建项目弹窗 */}
      {showCreateForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/30 backdrop-blur-sm p-4">
          <Card className="w-full max-w-xl shadow-2xl border-0 bg-white rounded-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-8">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 bg-zinc-900 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0">
                  {React.createElement(scenarios.find(s => s.id === selectedScenario)?.icon || Plus, { className: "w-6 h-6 text-white" })}
                </div>
                <div>
                  <h3 className="text-xl font-bold tracking-tight text-zinc-900">新建{scenarios.find(s => s.id === selectedScenario)?.name}项目</h3>
                  <p className="text-sm text-zinc-400 mt-0.5">填写项目信息，选择内容来源类型</p>
                </div>
              </div>
              <form onSubmit={handleCreate} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">项目名称</label>
                    <Input
                      value={newKB.name}
                      onChange={(e) => setNewKB({ ...newKB, name: e.target.value })}
                      placeholder={scenarios.find(s => s.id === selectedScenario)?.placeholder || '输入项目名称'}
                      required
                      className="h-11 bg-zinc-50 border-zinc-200 rounded-xl font-medium focus:bg-white focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-400 transition-all text-sm px-4"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">简短描述</label>
                    <Input
                      value={newKB.description}
                      onChange={(e) => setNewKB({ ...newKB, description: e.target.value })}
                      placeholder="描述一下这个项目..."
                      className="h-11 bg-zinc-50 border-zinc-200 rounded-xl font-medium focus:bg-white focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-400 transition-all text-sm px-4"
                    />
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">内容来源</label>
                  <div className="grid grid-cols-4 gap-3">
                    {sourceModes.map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => setNewKB({ ...newKB, sourceMode: mode.id })}
                        className={`flex flex-col items-center p-4 rounded-xl border-2 transition-all hover:shadow-md ${
                          newKB.sourceMode === mode.id 
                            ? 'border-zinc-900 bg-zinc-50 shadow-sm' 
                            : 'border-zinc-200 hover:border-zinc-400 bg-white'
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-2 ${
                          newKB.sourceMode === mode.id ? 'bg-zinc-900' : 'bg-zinc-100'
                        }`}>
                          <mode.icon className={`w-5 h-5 ${newKB.sourceMode === mode.id ? 'text-white' : 'text-zinc-500'}`} />
                        </div>
                        <span className={`text-sm font-bold ${newKB.sourceMode === mode.id ? 'text-zinc-900' : 'text-zinc-600'}`}>
                          {mode.name}
                        </span>
                        <span className="text-[11px] text-zinc-400 text-center mt-1 leading-snug">
                          {mode.desc}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3 pt-4 border-t border-zinc-100">
                  <Button type="button" variant="ghost" className="flex-1 h-12 font-bold rounded-xl text-zinc-600 hover:bg-zinc-100" onClick={() => setShowCreateForm(false)}>取消</Button>
                  <Button type="submit" className="flex-[2] h-12 bg-zinc-900 hover:bg-zinc-800 text-white font-bold rounded-xl shadow-lg transition-all" disabled={creating}>
                    {creating ? '稍等...' : '开始创作'}
                  </Button>
                </div>
              </form>
            </div>
          </Card>
        </div>
      )}

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e4e4e7;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #d4d4d8;
        }
      `}</style>
    </div>
  );
}
