'use client';

/**
 * 课程播放页面
 * 
 * 使用 SimpleCoursePlayer 播放课程，支持导出视频（FFmpeg）
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { 
  ArrowLeft, Loader2, Film, Music, Volume2, Download, CheckCircle, Globe, ChevronDown, ExternalLink
} from 'lucide-react';
import { MusicSelectorModal } from '@/components/teaching/MusicSelectorModal';
import { SimpleCoursePlayer, type CourseFrame } from '@/components/teaching/SimpleCoursePlayer';
import { type HtmlSlide } from '@/components/teaching/HtmlSlideRenderer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { BackgroundMusicConfig } from '@/lib/teaching/music/types';

interface CourseData {
  id: string;
  title: string;
  manuscriptId?: string;
  slideCount: number;
  duration: number;
  slides: HtmlSlide[];
  frames: CourseFrame[];
  audioData: { [key: number]: string };
  content?: string;
  sceneType?: string;
  backgroundMusic?: BackgroundMusicConfig;
}

export default function CoursePlayerPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = params.courseId as string;
  const kbId = params.id as string;

  // 状态
  const [loading, setLoading] = useState(true);
  const [courseData, setCourseData] = useState<CourseData | null>(null);
  const [musicModalOpen, setMusicModalOpen] = useState(false);
  const [backgroundMusic, setBackgroundMusic] = useState<BackgroundMusicConfig | null>(null);
  
  // 导出状态
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ percent: number; message: string } | null>(null);
  const [exportComplete, setExportComplete] = useState(false);
  
  // 英文版状态
  const [hasEnglishVersion, setHasEnglishVersion] = useState(false);
  const [englishCourseId, setEnglishCourseId] = useState<string | null>(null);
  const [creatingEnglish, setCreatingEnglish] = useState(false);
  const [englishProgress, setEnglishProgress] = useState<{ percent: number; message: string } | null>(null);
  const [exportingEnglish, setExportingEnglish] = useState(false);
  const [englishExportProgress, setEnglishExportProgress] = useState<{ percent: number; message: string } | null>(null);

  // 加载课程数据
  const loadCourseData = useCallback(async () => {
    try {
      const res = await fetch(`/api/remotion/course/${courseId}`);
      if (!res.ok) throw new Error('无法加载课程数据');
      
      const data = await res.json();
      setCourseData({
        id: data.id,
        title: data.title,
        manuscriptId: data.manuscriptId,
        slideCount: data.slideCount,
        duration: data.duration,
        slides: data.slides || [],
        frames: data.frames || [],
        audioData: data.audioData || {},
        content: data.content,
        sceneType: data.sceneType,
        backgroundMusic: data.backgroundMusic,
      });

      if (data.backgroundMusic) {
        setBackgroundMusic(data.backgroundMusic);
      }

      // 同时准备 FFmpeg 导出数据
      await fetch('/api/remotion/prepare-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId }),
      });

    } catch (err: any) {
      console.error('加载课程数据失败:', err);
    }
  }, [courseId]);

  // 检查是否有英文版
  const checkEnglishVersion = useCallback(async () => {
    try {
      const res = await fetch(`/api/teaching/course/${courseId}/translate`);
      if (res.ok) {
        const data = await res.json();
        setHasEnglishVersion(data.hasEnglishVersion);
        if (data.englishCourse) {
          setEnglishCourseId(data.englishCourse.id);
        }
      }
    } catch (err) {
      console.error('检查英文版失败:', err);
    }
  }, [courseId]);

  // 创建英文版
  const handleCreateEnglishVersion = async () => {
    if (creatingEnglish || hasEnglishVersion) return;
    
    setCreatingEnglish(true);
    setEnglishProgress({ percent: 0, message: '准备翻译...' });
    
    try {
      const response = await fetch(`/api/teaching/course/${courseId}/translate`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '创建失败');
      }
      
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const text = decoder.decode(value);
          const lines = text.split('\n').filter(line => line.startsWith('data: '));
          
          for (const line of lines) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.percent !== undefined) {
                setEnglishProgress({ percent: data.percent, message: data.message || '' });
              }
              if (data.complete) {
                setHasEnglishVersion(true);
                setEnglishCourseId(data.courseId);
                setEnglishProgress({ percent: 100, message: '英文版创建完成！' });
              }
              if (data.error) {
                throw new Error(data.error);
              }
            } catch (e: any) {
              if (e.message && !e.message.includes('JSON')) {
                throw e;
              }
            }
          }
        }
      }
    } catch (error: any) {
      console.error('创建英文版失败:', error);
      setEnglishProgress({ percent: 0, message: `失败: ${error.message}` });
    } finally {
      setCreatingEnglish(false);
    }
  };

  // 查看英文版
  const handleViewEnglishVersion = () => {
    if (englishCourseId) {
      router.push(`/dashboard/teaching/${kbId}/course/${englishCourseId}`);
    }
  };

  // 导出英文版视频
  const handleExportEnglishVideo = async () => {
    if (exportingEnglish || !englishCourseId) return;
    
    setExportingEnglish(true);
    setEnglishExportProgress({ percent: 0, message: '准备导出英文版...' });
    
    try {
      await fetch('/api/remotion/prepare-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId: englishCourseId }),
      });

      const response = await fetch('/api/remotion/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId: englishCourseId }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '导出失败');
      }
      
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const text = decoder.decode(value);
          const lines = text.split('\n').filter(line => line.startsWith('data: '));
          
          for (const line of lines) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.percent !== undefined) {
                setEnglishExportProgress({ percent: data.percent, message: data.message || '' });
              }
              if (data.complete) {
                setEnglishExportProgress({ percent: 100, message: '英文版导出完成！' });
                
                if (data.downloadUrl) {
                  const a = document.createElement('a');
                  a.href = data.downloadUrl;
                  a.download = `${courseData?.title || 'course'}_English.mp4`;
                  a.click();
                }
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }
    } catch (error: any) {
      console.error('Export English failed:', error);
      setEnglishExportProgress({ percent: 0, message: `失败: ${error.message}` });
    } finally {
      setExportingEnglish(false);
    }
  };

  // 处理音乐选择
  const handleMusicSelect = async (config: BackgroundMusicConfig) => {
    setBackgroundMusic(config);
    
    try {
      await fetch(`/api/teaching/course/${courseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backgroundMusic: config }),
      });
      
      await fetch('/api/remotion/prepare-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId }),
      });
    } catch (err) {
      console.error('Failed to save music config:', err);
    }
  };

  // 初始化
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([
        loadCourseData(),
        checkEnglishVersion(),
      ]);
      setLoading(false);
    };
    
    init();
  }, [loadCourseData, checkEnglishVersion]);

  // 格式化时长
  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // 导出视频 (FFmpeg)
  const handleExportVideo = async () => {
    if (exporting || !courseId) return;
    
    setExporting(true);
    setExportProgress({ percent: 0, message: '准备导出...' });
    setExportComplete(false);
    
    try {
      const response = await fetch('/api/remotion/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '导出失败');
      }
      
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const text = decoder.decode(value);
          const lines = text.split('\n').filter(line => line.startsWith('data: '));
          
          for (const line of lines) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.percent !== undefined) {
                setExportProgress({ percent: data.percent, message: data.message || '' });
              }
              if (data.complete) {
                setExportComplete(true);
                setExportProgress({ percent: 100, message: '导出完成！' });
                
                if (data.downloadUrl) {
                  const a = document.createElement('a');
                  a.href = data.downloadUrl;
                  a.download = `${courseData?.title || 'course'}.mp4`;
                  a.click();
                }
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }
    } catch (error: any) {
      console.error('Export failed:', error);
      setExportProgress({ percent: 0, message: `失败: ${error.message}` });
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-purple-400 mx-auto mb-4" />
          <p className="text-zinc-400">加载课程...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-zinc-950 flex flex-col overflow-hidden">
      {/* 顶部控制栏 */}
      <header className="bg-zinc-900 border-b border-zinc-800 px-4 py-2 flex items-center gap-3 h-14 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/dashboard/teaching/${kbId}`)}
          className="text-zinc-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          返回
        </Button>
        
        <div className="flex-1 flex items-center gap-3">
          <Film className="h-5 w-5 text-purple-400" />
          <div>
            <h1 className="text-lg font-semibold text-white">
              {courseData?.title || '课程播放'}
            </h1>
            {courseData && (
              <p className="text-xs text-zinc-500">
                {courseData.slideCount} 页 · {formatDuration(courseData.duration)}
              </p>
            )}
          </div>
        </div>
        
        {/* 背景音乐按钮 */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setMusicModalOpen(true)}
          className={backgroundMusic?.enabled 
            ? 'text-purple-400 hover:text-purple-300' 
            : 'text-zinc-400 hover:text-white'
          }
        >
          {backgroundMusic?.enabled ? (
            <>
              <Volume2 className="h-4 w-4 mr-2" />
              {backgroundMusic.trackName}
            </>
          ) : (
            <>
              <Music className="h-4 w-4 mr-2" />
              添加音乐
            </>
          )}
        </Button>
        
        {/* 英文版按钮 */}
        {hasEnglishVersion ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                disabled={exportingEnglish}
                className="border-green-500/50 text-green-400 hover:bg-green-500/10"
              >
                {exportingEnglish ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {englishExportProgress?.percent || 0}%
                  </>
                ) : (
                  <>
                    <Globe className="h-4 w-4 mr-2" />
                    英文版
                    <ChevronDown className="h-3 w-3 ml-1" />
                  </>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800">
              <DropdownMenuItem 
                onClick={handleViewEnglishVersion}
                className="text-zinc-300 hover:text-white hover:bg-zinc-800 cursor-pointer"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                查看英文版
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={handleExportEnglishVideo}
                disabled={exportingEnglish}
                className="text-zinc-300 hover:text-white hover:bg-zinc-800 cursor-pointer"
              >
                <Download className="h-4 w-4 mr-2" />
                导出英文版视频
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={handleCreateEnglishVersion}
            disabled={creatingEnglish || !courseData}
            className="border-blue-500/50 text-blue-400 hover:bg-blue-500/10"
          >
            {creatingEnglish ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {englishProgress?.percent || 0}%
              </>
            ) : (
              <>
                <Globe className="h-4 w-4 mr-2" />
                生成英文版
              </>
            )}
          </Button>
        )}
        
        {/* 导出视频按钮 */}
        <Button
          size="sm"
          onClick={handleExportVideo}
          disabled={exporting || !courseData}
          className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white border-0"
        >
          {exporting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {exportProgress?.percent || 0}%
            </>
          ) : exportComplete ? (
            <>
              <CheckCircle className="h-4 w-4 mr-2" />
              已完成
            </>
          ) : (
            <>
              <Download className="h-4 w-4 mr-2" />
              导出视频
            </>
          )}
        </Button>
      </header>
              
      {/* 课程播放器 - 占满剩余空间 */}
      <div className="flex-1 min-h-0">
        {courseData && courseData.slides.length > 0 ? (
          <SimpleCoursePlayer
            slides={courseData.slides}
            frames={courseData.frames}
            audioData={courseData.audioData}
            className="h-full"
            manuscriptId={courseData.manuscriptId}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-zinc-400">
            暂无课程内容
          </div>
        )}
      </div>
        
      {/* 背景音乐选择弹窗 */}
      <MusicSelectorModal
        isOpen={musicModalOpen}
        onClose={() => setMusicModalOpen(false)}
        onSelect={handleMusicSelect}
        courseContent={courseData?.content || courseData?.title || ''}
        sceneType={courseData?.sceneType}
        currentConfig={backgroundMusic}
      />
    </div>
  );
}
