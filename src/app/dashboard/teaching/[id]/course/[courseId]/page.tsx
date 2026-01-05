'use client';

/**
 * 课程视频编辑器页面
 * 
 * 嵌入 Remotion Studio 服务，提供完整的视频编辑功能
 * 
 * 部署时需要同时运行 Remotion Studio 服务
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { 
  ArrowLeft, Loader2, RefreshCw, AlertCircle, Film, Music, Volume2, Download, CheckCircle
} from 'lucide-react';
import { MusicSelectorModal } from '@/components/teaching/MusicSelectorModal';
import type { BackgroundMusicConfig } from '@/lib/teaching/music/types';

// Remotion Studio 服务地址（可通过环境变量配置）
const REMOTION_STUDIO_URL = process.env.NEXT_PUBLIC_REMOTION_STUDIO_URL || 'http://localhost:3002';

interface CourseInfo {
  id: string;
  title: string;
  slideCount: number;
  duration: number;
  content?: string;           // 课程内容（用于音乐推荐）
  sceneType?: string;         // 场景类型
  backgroundMusic?: BackgroundMusicConfig;
}

export default function CourseEditorPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = params.courseId as string;
  const kbId = params.id as string;

  // 状态
  const [loading, setLoading] = useState(true);
  const [studioReady, setStudioReady] = useState(false);
  const [courseInfo, setCourseInfo] = useState<CourseInfo | null>(null);
  const [musicModalOpen, setMusicModalOpen] = useState(false);
  const [backgroundMusic, setBackgroundMusic] = useState<BackgroundMusicConfig | null>(null);
  
  // 导出状态
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ percent: number; message: string } | null>(null);
  const [exportComplete, setExportComplete] = useState(false);
  
  // 检查 Remotion Studio 服务状态
  const checkStudioStatus = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      await fetch(REMOTION_STUDIO_URL, {
        method: 'HEAD',
        mode: 'no-cors',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      setStudioReady(true);
    } catch {
      setStudioReady(false);
    }
  }, []);

  // 加载课程数据
  const prepareCourseData = useCallback(async () => {
    try {
      const infoRes = await fetch(`/api/remotion/course/${courseId}`);
      if (!infoRes.ok) throw new Error('无法加载课程数据');
      
      const data = await infoRes.json();
      setCourseInfo({
        id: data.id,
        title: data.title,
        slideCount: data.slideCount,
        duration: data.duration,
        content: data.content,
        sceneType: data.sceneType,
        backgroundMusic: data.backgroundMusic,
      });

      // 恢复背景音乐配置
      if (data.backgroundMusic) {
        setBackgroundMusic(data.backgroundMusic);
      }

      // 将数据保存到 public 目录供 Remotion Studio 读取
      await fetch('/api/remotion/prepare-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId }),
      });

    } catch (err: any) {
      console.error('准备课程数据失败:', err);
    }
  }, [courseId]);

  // 处理音乐选择
  const handleMusicSelect = async (config: BackgroundMusicConfig) => {
    setBackgroundMusic(config);
    
    // 保存到后端
    try {
      await fetch(`/api/teaching/course/${courseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backgroundMusic: config }),
      });
      
      // 重新准备数据供 Remotion 读取
      await fetch('/api/remotion/prepare-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId }),
      });
      
      console.log('Background music updated:', config);
      
      // 刷新 Remotion Studio iframe 以加载新数据
      const iframe = document.getElementById('remotion-studio-iframe') as HTMLIFrameElement;
      if (iframe) {
        iframe.src = iframe.src; // 刷新 iframe
      }
    } catch (err) {
      console.error('Failed to save music config:', err);
    }
  };

  // 初始化
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([
        checkStudioStatus(),
        prepareCourseData(),
      ]);
      setLoading(false);
    };
    
    init();
    
    const interval = setInterval(checkStudioStatus, 10000);
    return () => clearInterval(interval);
  }, [checkStudioStatus, prepareCourseData]);



  // 格式化时长
  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // 导出视频
  const handleExportVideo = async () => {
    if (exporting || !courseId) return;
    
    setExporting(true);
    setExportProgress({ percent: 0, message: '准备导出...' });
    setExportComplete(false);
    
    try {
      // 调用 FFmpeg 渲染 API
      const response = await fetch('/api/remotion/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '导出失败');
      }
      
      // 使用 SSE 获取进度
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
                
                // 下载视频
                if (data.downloadUrl) {
                  const a = document.createElement('a');
                  a.href = data.downloadUrl;
                  a.download = `${courseInfo?.title || 'course'}.mp4`;
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
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* 顶部控制栏 */}
      <header className="bg-zinc-900 border-b border-zinc-800 px-4 py-2 flex items-center gap-3 h-14 flex-shrink-0">
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
              {courseInfo?.title || '课程视频'}
            </h1>
            {courseInfo && (
              <p className="text-xs text-zinc-500">
                {courseInfo.slideCount} 页 · {formatDuration(courseInfo.duration)}
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
        
        {/* 导出视频按钮 */}
        <Button
          size="sm"
          onClick={handleExportVideo}
          disabled={exporting || !courseInfo}
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
              
      {/* Remotion Studio iframe */}
      <div className="flex-1 relative overflow-hidden" style={{ minHeight: 'calc(100vh - 56px)' }}>
        {studioReady ? (
          <iframe
            id="remotion-studio-iframe"
            src={REMOTION_STUDIO_URL}
            className="absolute inset-0 w-full h-full border-0"
            title="Remotion Studio"
            allow="autoplay; fullscreen"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900">
            <AlertCircle className="h-16 w-16 text-zinc-600 mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">
              视频编辑器未启动
            </h2>
            <p className="text-zinc-400 mb-6 text-center max-w-md">
              Remotion Studio 服务需要运行才能使用编辑功能。
              <span className="block mt-2 text-sm text-zinc-500">
                开发环境会通过 <code className="bg-zinc-800 px-2 py-0.5 rounded">pnpm dev</code> 自动启动
              </span>
            </p>
            <Button onClick={checkStudioStatus} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              重新检测
                </Button>
              </div>
          )}
        </div>
        
      {/* 背景音乐选择弹窗 */}
      <MusicSelectorModal
        isOpen={musicModalOpen}
        onClose={() => setMusicModalOpen(false)}
        onSelect={handleMusicSelect}
        courseContent={courseInfo?.content || courseInfo?.title || ''}
        sceneType={courseInfo?.sceneType}
        currentConfig={backgroundMusic}
      />
    </div>
  );
}
