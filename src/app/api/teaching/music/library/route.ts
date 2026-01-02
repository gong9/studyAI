/**
 * 音乐库列表 API
 * 
 * GET /api/teaching/music/library
 * 获取音乐库列表，支持按标签筛选
 */

import { NextRequest, NextResponse } from 'next/server';
import { getMusicLibrary, filterMusicByTags } from '@/lib/teaching/music';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const mood = searchParams.get('mood') || undefined;
    const genre = searchParams.get('genre') || undefined;
    const scene = searchParams.get('scene') || undefined;

    // 如果有筛选条件
    if (mood || genre || scene) {
      const tracks = await filterMusicByTags({ mood, genre, scene });
      return NextResponse.json({
        success: true,
        tracks,
        count: tracks.length,
      });
    }

    // 返回完整音乐库
    const library = await getMusicLibrary();
    
    return NextResponse.json({
      success: true,
      version: library.version,
      updatedAt: library.updatedAt,
      tracks: library.tracks,
      count: library.tracks.length,
    });
  } catch (error: any) {
    console.error('[Music Library API] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || '获取音乐库失败' },
      { status: 500 }
    );
  }
}

