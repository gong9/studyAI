/**
 * AI 自动分析并生成背景音乐 API
 * 
 * POST /api/teaching/music/auto-generate
 * 
 * 流程：
 * 1. 分析课程内容，得出最合适的音乐风格
 * 2. 调用 MiniMax Music API 生成背景音乐
 * 3. 返回生成的音乐信息
 */

import { NextRequest, NextResponse } from 'next/server';
import { analyzeContentForMusic } from '@/lib/teaching/music/music-recommender';
import { generateBackgroundMusic } from '@/lib/teaching/music/music-generator';

// Genre 到 SceneType 的映射
const GENRE_TO_SCENE: Record<string, string> = {
  piano: 'teaching',
  ambient: 'teaching',
  electronic: 'tech',
  lofi: 'tech',
  orchestral: 'law',
  acoustic: 'inspiring',
};

export async function POST(request: NextRequest) {
  try {
    const { courseContent, sceneType = 'general' } = await request.json();

    if (!courseContent) {
      return NextResponse.json(
        { success: false, error: '请提供课程内容' },
        { status: 400 }
      );
    }


    // Step 1: 分析课程内容
    const analysis = await analyzeContentForMusic(courseContent, sceneType);
    

    // Step 2: 根据分析结果确定生成场景
    const generateScene = GENRE_TO_SCENE[analysis.genre] || 'teaching';
    
    // 构建自定义 prompt，强调纯器乐无人声
    const moodDesc = analysis.mood.join(' and ');
    const tempoDesc = analysis.tempo === 'slow' ? '70 BPM' : 
                      analysis.tempo === 'medium' ? '90 BPM' : '110 BPM';
    
    const customPrompt = `Pure instrumental BGM. ${moodDesc} mood, ${analysis.genre} style.
ABSOLUTELY NO VOCALS, NO SINGING, NO HUMMING. This is pure background music.
Tempo: ${tempoDesc}. For educational video background.
Instrumental only, like study music or lo-fi beats without any voice.`;


    // Step 3: 生成音乐
    const result = await generateBackgroundMusic({
      sceneType: generateScene as any,
      customPrompt,
    });

    if (!result.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: result.error,
          analysis, // 即使生成失败也返回分析结果
        },
        { status: 500 }
      );
    }


    return NextResponse.json({
      success: true,
      analysis,
      audioUrl: result.audioUrl,
      filename: result.filename,
      message: `已根据课程内容自动生成背景音乐：${analysis.reason}`,
    });

  } catch (error: any) {
    console.error('[Auto Generate] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || '自动生成失败' },
      { status: 500 }
    );
  }
}

