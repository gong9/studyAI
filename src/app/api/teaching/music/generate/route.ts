/**
 * AI 背景音乐生成 API
 * 
 * POST /api/teaching/music/generate
 * 
 * 使用 MiniMax Music API 生成定制背景音乐
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  generateBackgroundMusic, 
  getAvailableSceneTypes,
  type MusicGenerationRequest 
} from '@/lib/teaching/music/music-generator';

// GET: 获取可用的场景类型
export async function GET() {
  const sceneTypes = getAvailableSceneTypes();
  return NextResponse.json({
    success: true,
    sceneTypes,
  });
}

// POST: 生成背景音乐
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const { sceneType, customPrompt } = body as MusicGenerationRequest;
    
    if (!sceneType) {
      return NextResponse.json(
        { success: false, error: '请指定场景类型 sceneType' },
        { status: 400 }
      );
    }

    console.log('[Music Generate API] Generating BGM for scene:', sceneType);

    const result = await generateBackgroundMusic({
      sceneType,
      customPrompt,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      audioUrl: result.audioUrl,
      filename: result.filename,
      message: '背景音乐生成成功！',
    });

  } catch (error: any) {
    console.error('[Music Generate API] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || '生成失败' },
      { status: 500 }
    );
  }
}

