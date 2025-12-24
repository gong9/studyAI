'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { 
  ArrowLeft, Scale, Loader2, AlertCircle,
  BookOpen, Sparkles, ChevronRight, Database
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface LawDocument {
  id: string;
  name: string;
  status: string;
}

interface LawChapter {
  id: string;
  title: string;
  contentPreview?: string;
}

interface LawManuscript {
  id: string;
  status: string;
  createdAt: string;
  chapter: {
    title: string;
    metadata?: string;
  };
}

interface PresetKBInfo {
  exists: boolean;
  id?: string;
  name?: string;
  documents?: LawDocument[];
  chapters?: LawChapter[];
  manuscripts?: LawManuscript[];
  counts?: { documents: number; chapters: number; manuscripts: number };
  message?: string;
  indexReady?: boolean;
  processingCount?: number;
}

export default function LegalEntryPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [initializing, setInitializing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [presetInfo, setPresetInfo] = useState<PresetKBInfo | null>(null);
  const [selectedLaw, setSelectedLaw] = useState<string>('');
  const [topic, setTopic] = useState('');
  const [audience, setAudience] = useState('普通群众');
  const [recommending, setRecommending] = useState(false);
  const [recommendedTopics, setRecommendedTopics] = useState<string[]>([]);

  useEffect(() => {
    fetchPresetInfo();
  }, []);

  const fetchPresetInfo = async () => {
    try {
      const res = await fetch('/api/legal/preset');
      if (res.ok) {
        const data = await res.json();
        setPresetInfo(data);
      }
    } catch (error) {
      console.error('获取预置法律库失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInitialize = async () => {
    setInitializing(true);
    try {
      const res = await fetch('/api/legal/preset', { method: 'POST' });
      const data = await res.json();
      
      if (res.ok && data.success) {
        await fetchPresetInfo();
      } else if (res.ok && data.indexReady) {
        await fetchPresetInfo();
      } else {
        alert('初始化失败: ' + (data.error || data.message || '未知错误'));
      }
    } catch (error) {
      console.error('初始化失败:', error);
      alert('初始化失败，请检查网络');
    } finally {
      setInitializing(false);
    }
  };

  const handleCreate = async () => {
    if (!selectedLaw || !topic.trim()) return;
    if (!presetInfo?.id) return;

    setCreating(true);
    try {
      const chapterRes = await fetch('/api/legal/chapter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          presetKbId: presetInfo.id,
          lawName: selectedLaw,
          topic: topic.trim(),
          audience,
        }),
      });

      if (!chapterRes.ok) {
        const error = await chapterRes.json();
        alert('创建失败: ' + (error.error || '未知错误'));
        return;
      }

      const { manuscriptId } = await chapterRes.json();
      router.push(`/dashboard/teaching/${presetInfo.id}/manuscript/${manuscriptId}`);
    } catch (error) {
      console.error('创建失败:', error);
      alert('创建失败，请检查网络');
    } finally {
      setCreating(false);
    }
  };

  const getLawName = (fileName: string) => {
    return fileName.replace(/_\d+\.docx$/, '').replace('.docx', '');
  };

  const handleRecommend = async () => {
    if (!selectedLaw) return;
    
    setRecommending(true);
    setRecommendedTopics([]);
    try {
      const res = await fetch('/api/legal/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lawName: selectedLaw, audience }),
      });
      
      if (res.ok) {
        const data = await res.json();
        setRecommendedTopics(data.topics || []);
      }
    } catch (error) {
      console.error('推荐失败:', error);
    } finally {
      setRecommending(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-300" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafafa] font-sans text-zinc-900">
      {/* 顶部导航 - StudyAI 风格 */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-zinc-100">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => router.push('/dashboard')}
              className="p-2 hover:bg-zinc-100 rounded-xl transition-all text-zinc-500 hover:text-zinc-900"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="h-4 w-px bg-zinc-200" />
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-zinc-900 rounded-lg flex items-center justify-center shadow-lg shadow-zinc-900/20">
                <Scale className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-lg tracking-tight">普法讲座创作</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-12">
        {/* 未初始化状态 */}
        {!presetInfo?.exists && (
          <Card className="border-0 shadow-2xl shadow-zinc-200/50 rounded-xl overflow-hidden bg-white">
            <div className="p-12 flex flex-col items-center text-center">
              <div className="relative w-20 h-20 flex items-center justify-center mb-8">
                <div className="absolute inset-0 bg-zinc-50 rounded-xl transform rotate-6" />
                <div className="absolute inset-0 bg-zinc-100/50 rounded-xl transform -rotate-3" />
                <Database className="relative w-10 h-10 text-zinc-600" />
              </div>
              <h2 className="text-2xl font-bold text-zinc-900 mb-4">初始化普法知识库</h2>
              <p className="text-zinc-500 mb-10 max-w-md leading-relaxed">
                欢迎使用普法讲座场景。首次使用需要同步国家法律法规条文，并为您构建智能 RAG 索引。
              </p>
              <Button
                onClick={handleInitialize}
                disabled={initializing}
                className="h-14 px-10 text-lg bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg shadow-xl shadow-zinc-900/20 transition-all hover:scale-[1.02]"
              >
                {initializing ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-3 animate-spin" />
                    正在同步并索引...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5 mr-3" />
                    一键开启创作
                  </>
                )}
              </Button>
            </div>
          </Card>
        )}

        {/* 已初始化状态 */}
        {presetInfo?.exists && (
          <div className="space-y-12">
            {/* 索引状态提示 */}
            {!presetInfo.indexReady && (
              <div className="flex items-center justify-between p-4 bg-zinc-50 border border-zinc-100 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
                    <AlertCircle className="w-5 h-5 text-zinc-600" />
                  </div>
                  <div>
                    <p className="font-bold text-zinc-900 text-sm">索引需要维护</p>
                    <p className="text-zinc-500 text-xs">检测到有新文档或索引失效，建议重新构建</p>
                  </div>
                </div>
                <Button
                  onClick={handleInitialize}
                  disabled={initializing}
                  size="sm"
                  className="bg-zinc-900 hover:bg-zinc-800 text-white shadow-md shadow-zinc-900/10 rounded-lg"
                >
                  {initializing ? <Loader2 className="w-4 h-4 animate-spin" /> : '立即维护'}
                </Button>
              </div>
            )}

            {/* 步骤 1：选择法律 */}
            <section>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-7 h-7 rounded-full bg-zinc-900 text-white flex items-center justify-center font-bold text-xs">1</div>
                <h2 className="text-xl font-bold tracking-tight">选择法律法规</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {presetInfo.documents?.map((doc) => {
                  const lawName = getLawName(doc.name);
                  const isSelected = selectedLaw === lawName;
                  return (
                    <div
                      key={doc.id}
                      onClick={() => setSelectedLaw(lawName)}
                      className={cn(
                        'group relative bg-white border rounded-xl p-6 transition-all duration-300 cursor-pointer',
                        isSelected 
                          ? 'border-zinc-900 shadow-xl shadow-zinc-900/5 ring-1 ring-zinc-900' 
                          : 'border-zinc-200 hover:border-zinc-400 hover:shadow-lg'
                      )}
                    >
                      {/* 彩色点缀原点 */}
                      {isSelected && (
                        <div className="absolute -top-1 -left-1 w-2.5 h-2.5 rounded-full border-2 border-white shadow-sm bg-zinc-900 z-20" />
                      )}
                      
                      <div className="flex flex-col items-center text-center">
                        <div className={cn(
                          'w-14 h-14 rounded-lg flex items-center justify-center mb-4 transition-transform duration-500 group-hover:rotate-6',
                          isSelected ? 'bg-zinc-900 text-white shadow-lg shadow-zinc-900/20' : 'bg-zinc-50 border border-zinc-100 text-zinc-400'
                        )}>
                          <BookOpen className="w-7 h-7" />
                        </div>
                        <h3 className="font-bold text-zinc-900 mb-1 leading-tight line-clamp-2 h-10 flex items-center">{lawName}</h3>
                        <div className="flex items-center gap-1.5 mt-2">
                          <div className={cn('w-1.5 h-1.5 rounded-full', doc.status === 'completed' ? 'bg-green-500' : 'bg-zinc-300')} />
                          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-tighter">
                            {doc.status === 'completed' ? '索引就绪' : '处理中'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* 步骤 2：输入主题 */}
            <section className="bg-white border border-zinc-100 rounded-xl p-8 shadow-sm">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-7 h-7 rounded-full bg-zinc-900 text-white flex items-center justify-center font-bold text-xs">2</div>
                <h2 className="text-xl font-bold tracking-tight">设定讲座主题</h2>
              </div>
              <div className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest ml-1">主题内容</label>
                    <button
                      onClick={handleRecommend}
                      disabled={!selectedLaw || recommending}
                      className="flex items-center gap-1.5 text-xs font-bold text-zinc-500 hover:text-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {recommending ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          AI 思考中...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          AI 推荐主题
                        </>
                      )}
                    </button>
                  </div>
                  <Input
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder={selectedLaw ? `例如：${selectedLaw}下的试用期避坑指南` : '请先在上方选择法律'}
                    disabled={!selectedLaw}
                    className="h-14 text-lg border-zinc-200 bg-zinc-50/50 focus:bg-white focus:ring-2 focus:ring-zinc-900/10 rounded-lg transition-all"
                  />
                  
                  {/* AI 推荐的主题列表 */}
                  {recommendedTopics.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <p className="text-xs font-medium text-zinc-400 ml-1">点击选用推荐主题：</p>
                      <div className="flex flex-wrap gap-2">
                        {recommendedTopics.map((t, i) => (
                          <button
                            key={i}
                            onClick={() => {
                              setTopic(t);
                              setRecommendedTopics([]);
                            }}
                            className="px-3 py-2 text-sm bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 hover:border-zinc-300 rounded-lg text-zinc-700 transition-all text-left"
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-zinc-50">
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-4 ml-1">讲座受众</label>
                  <div className="flex flex-wrap gap-3">
                    {['普通群众', '企业员工', '大中学生', '中老年人'].map((aud) => (
                      <button
                        key={aud}
                        onClick={() => setAudience(aud)}
                        className={cn(
                          'px-6 py-2.5 rounded-lg text-sm font-bold transition-all border',
                          audience === aud 
                            ? 'bg-zinc-900 text-white border-zinc-900 shadow-lg shadow-zinc-900/10' 
                            : 'bg-white text-zinc-500 border-zinc-200 hover:border-zinc-400'
                        )}
                      >
                        {aud}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* 步骤 3：生成按钮 */}
            <div className="pt-4">
              <Button
                onClick={handleCreate}
                disabled={!selectedLaw || !topic.trim() || creating}
                className="w-full h-16 text-xl bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl shadow-2xl shadow-zinc-900/20 transition-all active:scale-[0.98] disabled:opacity-50 disabled:grayscale"
              >
                {creating ? (
                  <>
                    <Loader2 className="w-6 h-6 mr-3 animate-spin" />
                    AI 正在研读法条并构思讲稿...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-6 h-6 mr-3" />
                    开启 AI 普法创作
                    <ChevronRight className="w-6 h-6 ml-2" />
                  </>
                )}
              </Button>
              <p className="text-center text-zinc-400 text-xs mt-6 font-medium">
                AI 将根据您的主题从《{selectedLaw || '选定法律'}》中检索核心条款，生成通俗易懂的普法手稿
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
