/**
 * 背景音乐 CDN 服务
 * 
 * 从 GitHub Release CDN 加载音乐库
 */

import type { MusicLibrary, MusicTrack } from './types';

// ==================== 配置 ====================

// 音乐资源基础路径
// 优先使用环境变量配置的 CDN，否则使用本地 public 目录
const CDN_BASE = process.env.NEXT_PUBLIC_MUSIC_CDN_BASE || '/audio/bgm';

// 是否使用本地模式
const IS_LOCAL_MODE = !process.env.NEXT_PUBLIC_MUSIC_CDN_BASE;

// 音乐库 JSON 文件名
const LIBRARY_FILE = 'music-library.json';

// 缓存
let cachedLibrary: MusicLibrary | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 1000 * 60 * 60; // 1 小时

// ==================== 默认音乐库（CDN 不可用时使用）====================

const DEFAULT_LIBRARY: MusicLibrary = {
  version: '1.0.0',
  updatedAt: '2025-01-02',
  tracks: [],
  // 音乐库为空时，用户可以通过 AI 生成按钮创建背景音乐
};

// ==================== 公共函数 ====================

/**
 * 获取音乐库
 */
export async function getMusicLibrary(): Promise<MusicLibrary> {
  // 检查缓存
  if (cachedLibrary && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedLibrary;
  }

  // 本地模式直接使用默认库
  if (IS_LOCAL_MODE) {
    console.log('[MusicService] Using local/default library');
    cachedLibrary = DEFAULT_LIBRARY;
    cacheTimestamp = Date.now();
    return DEFAULT_LIBRARY;
  }

  try {
    // 尝试从 CDN 加载
    const response = await fetch(`${CDN_BASE}/${LIBRARY_FILE}`, {
      next: { revalidate: 3600 }, // Next.js ISR 缓存 1 小时
    });

    if (response.ok) {
      const library = await response.json() as MusicLibrary;
      cachedLibrary = library;
      cacheTimestamp = Date.now();
      console.log('[MusicService] Library loaded from CDN:', library.tracks.length, 'tracks');
      return library;
    }
  } catch (error) {
    console.warn('[MusicService] CDN fetch failed:', error);
  }

  // 使用默认库
  console.log('[MusicService] Using default library');
  return DEFAULT_LIBRARY;
}

/**
 * 获取音乐文件 URL
 */
export function getMusicUrl(track: MusicTrack): string {
  return `${CDN_BASE}/${track.filename}`;
}

/**
 * 检查是否为本地模式
 */
export function isLocalMode(): boolean {
  return IS_LOCAL_MODE;
}

/**
 * 根据 ID 获取音乐
 */
export async function getMusicById(id: string): Promise<MusicTrack | null> {
  const library = await getMusicLibrary();
  return library.tracks.find(t => t.id === id) || null;
}

/**
 * 按标签筛选音乐
 */
export async function filterMusicByTags(options: {
  mood?: string;
  genre?: string;
  scene?: string;
}): Promise<MusicTrack[]> {
  const library = await getMusicLibrary();
  
  return library.tracks.filter(track => {
    if (options.mood && !track.mood.includes(options.mood as any)) {
      return false;
    }
    if (options.genre && track.genre !== options.genre) {
      return false;
    }
    if (options.scene && !track.scenes.includes(options.scene as any)) {
      return false;
    }
    return true;
  });
}

/**
 * 清除缓存
 */
export function clearMusicCache(): void {
  cachedLibrary = null;
  cacheTimestamp = 0;
}

