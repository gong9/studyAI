/**
 * 智能音乐推荐 API
 * 
 * POST /api/teaching/music/recommend
 * 根据课程内容推荐背景音乐
 */

import { NextRequest, NextResponse } from 'next/server';
import { recommendMusic } from '@/lib/teaching/music';
import { getMusicUrl } from '@/lib/teaching/music/music-service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { courseContent, sceneType = 'general' } = body;

    if (!courseContent) {
      return NextResponse.json(
        { success: false, error: '缺少课程内容' },
        { status: 400 }
      );
    }


    // 获取推荐
    const result = await recommendMusic(courseContent, sceneType);

    // 添加音乐 URL
    const recommendations = result.recommendations.map(rec => ({
      ...rec,
      track: {
        ...rec.track,
        url: getMusicUrl(rec.track),
      },
    }));

    return NextResponse.json({
      success: true,
      analysis: result.analysis,
      recommendations,
    });
  } catch (error: any) {
    console.error('[Music Recommend API] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || '音乐推荐失败' },
      { status: 500 }
    );
  }
}

