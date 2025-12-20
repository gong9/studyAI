'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { 
  LogOut, Plus, Trash2, FileText, ChevronRight, ChevronLeft, 
  Clock, GraduationCap, Sparkles 
} from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface TeachingKB {
  id: string;
  name: string;
  description: string;
  type: string;
  createdAt: string;
  _count: {
    documents: number;
    chapters?: number;
  };
}

const PAGE_SIZE = 6;

export default function DashboardPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [knowledgeBases, setKnowledgeBases] = useState<TeachingKB[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newKB, setNewKB] = useState({ name: '', description: '' });
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    fetchTeachingKBs();
  }, []);

  const fetchTeachingKBs = async () => {
    try {
      const response = await fetch('/api/knowledge-bases');
      if (response.ok) {
        const data = await response.json();
        // 只显示教研库类型
        const teachingKBs = data.filter((kb: any) => kb.type === 'teaching');
        setKnowledgeBases(teachingKBs);
      }
    } catch (error) {
      console.error('获取教研库失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: any) => {
    e.preventDefault();
    setCreating(true);

    try {
      const response = await fetch('/api/knowledge-bases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newKB, type: 'teaching' }),
      });

      if (response.ok) {
        const kb = await response.json();
        setNewKB({ name: '', description: '' });
        setShowCreateForm(false);
        router.push(`/dashboard/teaching/${kb.id}`);
      }
    } catch (error) {
      console.error('创建教研库失败:', error);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, e: any) => {
    e.stopPropagation();
    if (!confirm('确定要删除这个教研库吗？')) {
      return;
    }

    try {
      const response = await fetch(`/api/knowledge-bases/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchTeachingKBs();
      }
    } catch (error) {
      console.error('删除教研库失败:', error);
    }
  };

  const totalKBs = knowledgeBases.length;
  const totalPages = Math.ceil(totalKBs / PAGE_SIZE);
  const currentKBs = knowledgeBases.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  return (
    <div className="min-h-screen bg-zinc-50/30 relative overflow-hidden">
      {/* 动态背景 */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern opacity-[0.4]" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-gradient-to-tr from-zinc-200/40 to-zinc-100/40 blur-[100px] rounded-full animate-pulse duration-[5000ms]" />
      </div>

      {/* Navbar */}
      <header className="sticky top-0 z-30 w-full border-b border-zinc-200 bg-white/80 backdrop-blur-xl">
        <div className="container mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-2.5">
            <div className="relative w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center">
              <div className="absolute inset-0 bg-zinc-900 rounded-lg"></div>
              <GraduationCap className="relative w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <span className="font-bold text-base sm:text-lg tracking-tight text-zinc-900">
              智研课堂
            </span>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-2.5 px-2 sm:px-3 py-1.5 bg-white border border-zinc-200 rounded-full shadow-sm">
              <div className="w-5 h-5 rounded-full bg-zinc-900 flex items-center justify-center text-[10px] font-bold text-white">
                {session?.user?.name?.[0]?.toUpperCase()}
              </div>
              <span className="hidden sm:inline text-sm font-medium text-zinc-600">
                {session?.user?.name}
              </span>
            </div>
            <Button variant="ghost" size="icon" onClick={() => signOut()} className="text-zinc-400 hover:text-zinc-900">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6 sm:space-y-10">
        
        {/* Header */}
        <div className="flex flex-col gap-4 sm:gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 flex items-center gap-3">
              <GraduationCap className="w-8 h-8 text-zinc-700" />
              教研库
            </h1>
            <p className="text-zinc-500 mt-1 sm:mt-2 text-sm sm:text-base">
              上传教材，AI 自动生成结构化课件
            </p>
          </div>
          
          {/* Stats and Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
            <div className="flex gap-2 sm:gap-3">
              <Card className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 border border-zinc-200 shadow-sm bg-white">
                <GraduationCap className="w-4 h-4 text-zinc-500" />
                <div className="flex gap-1.5 sm:gap-2 text-sm">
                  <span className="text-zinc-500">教研库</span>
                  <span className="font-semibold text-zinc-900">{totalKBs}</span>
                </div>
              </Card>
            </div>
            
            <Button 
              onClick={() => setShowCreateForm(true)} 
              className="bg-zinc-900 hover:bg-zinc-800 text-white shadow-lg transition-all hover:-translate-y-0.5"
            >
              <Plus className="w-4 h-4 mr-1.5 sm:mr-2" />
              新建教研库
            </Button>
          </div>
        </div>

        {/* Knowledge Bases Grid */}
        <div className="space-y-4 sm:space-y-6">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="h-44 sm:h-48 animate-pulse bg-white border border-zinc-100" />
              ))}
            </div>
          ) : knowledgeBases.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 sm:py-24 bg-white rounded-xl border border-dashed border-zinc-200">
              <div className="w-14 h-14 sm:w-16 sm:h-16 bg-zinc-50 rounded-full flex items-center justify-center mb-3 sm:mb-4">
                <Sparkles className="w-7 h-7 sm:w-8 sm:h-8 text-zinc-300" />
              </div>
              <h3 className="text-base sm:text-lg font-medium text-zinc-900">开始您的教研之旅</h3>
              <p className="text-zinc-500 mt-1 mb-4 sm:mb-6 text-sm text-center max-w-md">
                上传教材 PDF，AI 将自动分析章节结构，生成可编辑的课件
              </p>
              <Button onClick={() => setShowCreateForm(true)} className="bg-zinc-900 hover:bg-zinc-800 text-white">
                创建第一个教研库
              </Button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {currentKBs.map((kb, index) => (
                  <Card 
                    key={kb.id} 
                    className="group relative overflow-hidden transition-all duration-300 hover:shadow-xl hover:shadow-zinc-200/50 sm:hover:-translate-y-1 border-zinc-200 bg-white cursor-pointer"
                    style={{ animationDelay: `${index * 50}ms` }}
                    onClick={() => router.push(`/dashboard/teaching/${kb.id}`)}
                  >
                    <CardHeader className="pb-3 sm:pb-4 pt-4 sm:pt-6 px-4 sm:px-6">
                      <div className="flex justify-between items-start mb-3 sm:mb-4">
                        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg border border-zinc-100 bg-zinc-50 flex items-center justify-center text-zinc-600 group-hover:bg-zinc-900 group-hover:text-white group-hover:border-zinc-900 transition-all duration-300 shadow-sm">
                          <GraduationCap className="w-4 h-4 sm:w-5 sm:h-5" />
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-zinc-400 hover:text-red-600 hover:bg-red-50 sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-300"
                          onClick={(e) => handleDelete(kb.id, e)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                      <CardTitle className="text-base sm:text-lg font-semibold text-zinc-900 group-hover:text-zinc-700 transition-colors line-clamp-1">
                        {kb.name}
                      </CardTitle>
                      <CardDescription className="line-clamp-2 mt-1 sm:mt-1.5 text-sm text-zinc-500 h-10">
                        {kb.description || '暂无描述...'}
                      </CardDescription>
                    </CardHeader>
                    
                    <CardContent className="pb-3 sm:pb-4 px-4 sm:px-6">
                      <div className="flex items-center gap-3 sm:gap-4 text-xs text-zinc-500 font-medium">
                        <div className="flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5" />
                          {kb._count.documents} 教材
                        </div>
                        <div className="w-1 h-1 bg-zinc-300 rounded-full" />
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" />
                          {formatDate(kb.createdAt)}
                        </div>
                      </div>
                    </CardContent>

                    <CardFooter className="pt-0 pb-4 sm:pb-5 px-4 sm:px-6">
                      <div className="w-full flex items-center text-sm font-medium text-zinc-400 group-hover:text-zinc-900 transition-colors gap-1 group-hover:gap-2 duration-300">
                        <span>生成课件</span>
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </CardFooter>
                  </Card>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 sm:pt-6">
                  <span className="text-sm text-zinc-500">共 {totalKBs} 个教研库</span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="h-8 w-8 p-0"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="text-sm text-zinc-600 min-w-[80px] text-center">
                      {currentPage} / {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="h-8 w-8 p-0"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* Create Form Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/20 backdrop-blur-sm p-0 sm:p-4">
          <Card className="w-full sm:max-w-md shadow-xl border-0 bg-white rounded-t-2xl sm:rounded-xl">
            <CardHeader className="px-4 sm:px-6 pt-4 sm:pt-6">
              <CardTitle className="text-lg flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-zinc-700" />
                新建教研库
              </CardTitle>
              <CardDescription>上传教材后可自动提取章节结构</CardDescription>
            </CardHeader>
            <CardContent className="px-4 sm:px-6 pb-6">
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">名称</label>
                  <Input
                    value={newKB.name}
                    onChange={(e) => setNewKB({ ...newKB, name: e.target.value })}
                    placeholder="例如：七年级数学上册"
                    required
                    className="bg-white h-11"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">描述</label>
                  <Input
                    value={newKB.description}
                    onChange={(e) => setNewKB({ ...newKB, description: e.target.value })}
                    placeholder="简要描述教材内容..."
                    className="bg-white h-11"
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <Button type="button" variant="outline" className="flex-1 h-11" onClick={() => setShowCreateForm(false)}>
                    取消
                  </Button>
                  <Button type="submit" className="flex-1 h-11 bg-zinc-900 hover:bg-zinc-800 text-white" disabled={creating}>
                    {creating ? '创建中...' : '下一步：上传教材'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
