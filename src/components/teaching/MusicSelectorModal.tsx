'use client';

/**
 * 背景音乐选择器弹窗
 * 
 * AI 自动分析课程内容并生成最匹配的背景音乐
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  X, Music, Play, Pause, Loader2, Sparkles,
  Volume2, Check, Wand2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { 
  MusicTrack,
  BackgroundMusicConfig,
} from '@/lib/teaching/music/types';
import { MOOD_LABELS, GENRE_LABELS } from '@/lib/teaching/music/types';

interface MusicSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (config: BackgroundMusicConfig) => void;
  courseContent: string;      // 课程内容（用于 AI 分析）
  sceneType?: string;         // 场景类型
  currentConfig?: BackgroundMusicConfig | null;
}

// 音乐资源基础路径
const MUSIC_BASE = '/audio/bgm';

interface GeneratedMusic {
  audioUrl: string;
  filename: string;
  analysis: {
    mood: string[];
    tempo: string;
    genre: string;
    reason: string;
  };
}

export const MusicSelectorModal: React.FC<MusicSelectorModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  courseContent,
  sceneType = 'general',
  currentConfig,
}) => {
  // 状态
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<GeneratedMusic | null>(null);
  const [error, setError] = useState<string>('');
  const [volume, setVolume] = useState(0.2);
  const [isPlaying, setIsPlaying] = useState(false);
  const [allTracks, setAllTracks] = useState<MusicTrack[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<MusicTrack | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 加载已有音乐库
  const loadLibrary = useCallback(async () => {
    try {
      const res = await fetch('/api/teaching/music/library');
      const data = await res.json();
      if (data.success && data.tracks?.length > 0) {
        setAllTracks(data.tracks);
      }
    } catch (error) {
      console.error('Failed to load music library:', error);
    }
  }, []);

  // AI 自动生成背景音乐
  const autoGenerate = useCallback(async () => {
    if (!courseContent) {
      setError('课程内容为空，无法分析');
      return;
    }

    try {
      setGenerating(true);
      setError('');
      setGenerated(null);
      
      const res = await fetch('/api/teaching/music/auto-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseContent, sceneType }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        setGenerated({
          audioUrl: data.audioUrl,
          filename: data.filename,
          analysis: data.analysis,
        });
        // 重新加载音乐库
        await loadLibrary();
      } else {
        setError(data.error || '生成失败');
      }
    } catch (error: any) {
      setError(error.message || '网络错误');
    } finally {
      setGenerating(false);
    }
  }, [courseContent, sceneType, loadLibrary]);

  // 播放/暂停
  const togglePlay = useCallback((url: string) => {
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      audioRef.current = new Audio(url);
      audioRef.current.volume = volume;
      audioRef.current.play().catch(console.error);
      audioRef.current.onended = () => setIsPlaying(false);
      setIsPlaying(true);
    }
  }, [isPlaying, volume]);

  // 更新播放音量
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // 初始化
  useEffect(() => {
    if (isOpen) {
      loadLibrary();
      // 恢复当前配置
      if (currentConfig) {
        setVolume(currentConfig.volume);
      }
    }
    
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [isOpen, loadLibrary, currentConfig]);

  // 确认使用生成的音乐
  const handleConfirmGenerated = () => {
    if (generated) {
      const config = {
        trackId: `ai-generated-${Date.now()}`,
        trackName: `AI·${generated.analysis.reason.substring(0, 10)}`,
        volume,
        enabled: true,
        src: generated.audioUrl,
      };
      console.log('Using generated music with config:', config);
      onSelect(config);
      onClose();
    }
  };

  // 确认使用已有音乐
  const handleConfirmSelected = () => {
    if (selectedTrack) {
      const config = {
        trackId: selectedTrack.id,
        trackName: selectedTrack.name,
        volume,
        enabled: true,
        src: `${MUSIC_BASE}/${selectedTrack.filename}`,
      };
      console.log('Selecting music with config:', config);
      onSelect(config);
      onClose();
    }
  };

  // 移除音乐
  const handleRemove = () => {
    onSelect({
      trackId: '',
      trackName: '',
      volume: 0,
      enabled: false,
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 遮罩 */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* 弹窗 */}
      <div className="relative w-full max-w-lg max-h-[85vh] bg-zinc-900 rounded-xl shadow-2xl border border-zinc-700 flex flex-col overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center">
              <Wand2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">AI 背景音乐</h2>
              <p className="text-sm text-zinc-400">根据课程内容自动生成</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-zinc-400">
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* 生成中 */}
          {generating && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="relative">
                <div className="w-20 h-20 rounded-full bg-gradient-to-r from-pink-500 to-purple-500 animate-pulse" />
                <Wand2 className="absolute inset-0 m-auto w-8 h-8 text-white animate-bounce" />
              </div>
              <p className="mt-6 text-white font-medium">正在分析课程内容...</p>
              <p className="mt-2 text-zinc-400 text-sm">AI 正在生成最匹配的背景音乐</p>
              <p className="mt-1 text-zinc-500 text-xs">预计需要 30-60 秒</p>
            </div>
          )}

          {/* 生成成功 */}
          {!generating && generated && (
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 rounded-lg p-4 border border-green-500/20">
                <div className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-400 mt-0.5" />
                  <div>
                    <p className="text-white font-medium">生成成功！</p>
                    <p className="text-sm text-zinc-400 mt-1">{generated.analysis.reason}</p>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {generated.analysis.mood.map(m => (
                        <span key={m} className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-xs">
                          {MOOD_LABELS[m as keyof typeof MOOD_LABELS] || m}
                        </span>
                      ))}
                      <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-xs">
                        {GENRE_LABELS[generated.analysis.genre as keyof typeof GENRE_LABELS] || generated.analysis.genre}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 播放控制 */}
              <div className="bg-zinc-800 rounded-lg p-4 flex items-center gap-4">
                <button
                  className={cn(
                    'w-12 h-12 rounded-full flex items-center justify-center transition-colors',
                    isPlaying
                      ? 'bg-pink-500 text-white'
                      : 'bg-zinc-700 text-white hover:bg-zinc-600'
                  )}
                  onClick={() => togglePlay(generated.audioUrl)}
                >
                  {isPlaying ? (
                    <Pause className="w-5 h-5" />
                  ) : (
                    <Play className="w-5 h-5 ml-0.5" />
                  )}
                </button>
                <div className="flex-1">
                  <p className="text-white font-medium">AI 生成的背景音乐</p>
                  <p className="text-sm text-zinc-400">点击播放试听</p>
                </div>
              </div>
            </div>
          )}

          {/* 错误提示 */}
          {!generating && error && (
            <div className="bg-red-500/10 rounded-lg p-4 border border-red-500/20">
              <p className="text-red-400">{error}</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={autoGenerate}
                className="mt-3 text-red-400"
              >
                重试
              </Button>
            </div>
          )}

          {/* 初始状态 */}
          {!generating && !generated && !error && (
            <div className="space-y-6">
              {/* 已有音乐 - 优先显示 */}
              {allTracks.length > 0 && (
                <div>
                  <h3 className="text-white font-medium mb-3 flex items-center gap-2">
                    <Music className="w-4 h-4 text-purple-400" />
                    选择已有音乐
                  </h3>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {allTracks.map(track => (
                      <div
                        key={track.id}
                        className={cn(
                          'p-3 rounded-lg border cursor-pointer transition-all flex items-center gap-3',
                          selectedTrack?.id === track.id
                            ? 'bg-purple-500/10 border-purple-500'
                            : 'bg-zinc-800/50 border-zinc-700 hover:border-zinc-600'
                        )}
                        onClick={() => setSelectedTrack(track)}
                      >
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: track.color || '#6366f1' }}
                        >
                          <Music className="w-5 h-5 text-white/90" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-medium truncate">{track.name}</p>
                          <p className="text-xs text-zinc-500 truncate">{track.description}</p>
                        </div>
                        <button
                          className={cn(
                            'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                            isPlaying ? 'bg-purple-500' : 'bg-zinc-700 hover:bg-zinc-600'
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePlay(`${MUSIC_BASE}/${track.filename}`);
                          }}
                        >
                          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                        </button>
                        {selectedTrack?.id === track.id && (
                          <Check className="w-5 h-5 text-purple-400 flex-shrink-0" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 分隔线 */}
              {allTracks.length > 0 && (
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-zinc-700" />
                  <span className="text-xs text-zinc-500">或者</span>
                  <div className="flex-1 h-px bg-zinc-700" />
                </div>
              )}

              {/* AI 生成 */}
              <div className="bg-gradient-to-r from-pink-500/10 to-purple-500/10 rounded-lg p-4 border border-pink-500/20 text-center">
                <Wand2 className="w-8 h-8 text-pink-400 mx-auto mb-2" />
                <h3 className="text-white font-medium">AI 生成新音乐</h3>
                <p className="text-zinc-400 text-xs mt-1">
                  根据课程内容自动生成专属配乐
                </p>
                <Button
                  onClick={autoGenerate}
                  size="sm"
                  className="mt-3 bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  开始生成
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* 底部：音量控制和确认 */}
        <div className="border-t border-zinc-700 px-6 py-4 bg-zinc-800/50">
          <div className="flex items-center gap-6">
            {/* 音量控制 */}
            <div className="flex items-center gap-3 flex-1">
              <Volume2 className="w-4 h-4 text-zinc-400" />
              <Slider
                value={[volume * 100]}
                max={50}
                step={5}
                onValueChange={v => setVolume(v[0] / 100)}
                className="flex-1"
              />
              <span className="text-sm text-zinc-400 w-12">{Math.round(volume * 100)}%</span>
            </div>

            {/* 按钮组 */}
            <div className="flex gap-2">
              {currentConfig?.enabled && (
                <Button variant="ghost" onClick={handleRemove} className="text-red-400">
                  移除
                </Button>
              )}
              <Button variant="ghost" onClick={onClose}>
                取消
              </Button>
              {generated && (
                <Button
                  onClick={handleConfirmGenerated}
                  className="bg-pink-500 hover:bg-pink-600"
                >
                  <Check className="w-4 h-4 mr-2" />
                  使用
                </Button>
              )}
              {selectedTrack && !generated && (
                <Button
                  onClick={handleConfirmSelected}
                  className="bg-purple-500 hover:bg-purple-600"
                >
                  <Check className="w-4 h-4 mr-2" />
                  使用
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MusicSelectorModal;
