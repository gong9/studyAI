/**
 * MiniMax TTS 同步 API 代理
 * POST: 同步语音合成，返回音频 URL
 */

import { NextRequest, NextResponse } from 'next/server';

const MINIMAX_API_BASE = 'https://api.minimaxi.com';

// 获取 API Key
function getApiKey(): string {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    throw new Error('MINIMAX_API_KEY 未配置');
  }
  return apiKey;
}

// POST: 同步语音合成
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      text, 
      voiceId = 'male-qn-qingse', // 默认音色
      speed = 1, 
      model = 'speech-2.6-turbo' // 使用 turbo 更快
    } = body;
    
    if (!text) {
      return NextResponse.json({ error: '缺少 text 参数' }, { status: 400 });
    }
    
    const apiKey = getApiKey();
    
    console.log('[TTS] 同步语音合成:', text.substring(0, 50) + '...');
    
    // 调用 MiniMax 同步语音合成 API
    const response = await fetch(`${MINIMAX_API_BASE}/v1/t2a_v2`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        text,
        stream: false,
        language_boost: 'auto',
        voice_setting: {
          voice_id: voiceId,
          speed,
          vol: 1,
          pitch: 0,
        },
        audio_setting: {
          sample_rate: 32000,
          bitrate: 128000,
          format: 'mp3',
          channel: 1,
        },
        output_format: 'url', // 直接返回 URL，有效期 24 小时
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[TTS] MiniMax API 错误:', errorText);
      return NextResponse.json(
        { error: 'MiniMax API 调用失败', details: errorText },
        { status: response.status }
      );
    }
    
    const result = await response.json();
    
    if (result.base_resp?.status_code !== 0) {
      console.error('[TTS] MiniMax 返回错误:', result.base_resp);
      return NextResponse.json(
        { error: result.base_resp?.status_msg || '未知错误' },
        { status: 400 }
      );
    }
    
    // 返回音频 URL
    const audioUrl = result.data?.audio;
    
    if (!audioUrl) {
      console.error('[TTS] 无音频数据:', result);
      return NextResponse.json(
        { error: '未返回音频数据' },
        { status: 500 }
      );
    }
    
    console.log('[TTS] 合成成功, 时长:', result.extra_info?.audio_length, 'ms');
    
    return NextResponse.json({
      audioUrl,
      audioLength: result.extra_info?.audio_length,
      audioSize: result.extra_info?.audio_size,
      usageCharacters: result.extra_info?.usage_characters,
    });
    
  } catch (error: any) {
    console.error('[TTS] 语音合成失败:', error);
    return NextResponse.json(
      { error: error.message || '语音合成失败' },
      { status: 500 }
    );
  }
}
