/**
 * MiniMax TTS 同步 API 代理
 * POST: 同步语音合成，返回音频 base64
 * 支持使用复刻音色
 */

import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const MINIMAX_API_BASE = 'https://api.minimaxi.com';
const CLONED_VOICE_CONFIG_PATH = join(process.cwd(), 'cloned-voice-config.json');

// 获取 API Key
function getApiKey(): string {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    throw new Error('MINIMAX_API_KEY 未配置');
  }
  return apiKey;
}

// 获取当前使用的音色 ID（优先使用复刻音色）
function getActiveVoiceId(): string {
  try {
    if (existsSync(CLONED_VOICE_CONFIG_PATH)) {
      const content = readFileSync(CLONED_VOICE_CONFIG_PATH, 'utf-8');
      const config = JSON.parse(content);
      if (config.voiceId) {
        console.log('[TTS] 使用复刻音色:', config.voiceId);
        return config.voiceId;
      }
    }
  } catch (error) {
    console.error('[TTS] 读取复刻音色配置失败:', error);
  }
  return 'male-qn-qingse'; // 默认音色
}

// POST: 同步语音合成
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const defaultVoiceId = getActiveVoiceId(); // 获取当前激活的音色（复刻音色或默认）
    const { 
      text, 
      voiceId = defaultVoiceId, // 使用复刻音色或默认音色
      speed = 1, 
      model = 'speech-2.6-turbo' // 使用 turbo 更快
    } = body;
    
    if (!text) {
      return NextResponse.json({ error: '缺少 text 参数' }, { status: 400 });
    }
    
    const apiKey = getApiKey();
    
    console.log('[TTS] 同步语音合成:', text.substring(0, 50) + '...');
    
    // 调用 MiniMax 同步语音合成 API - 使用 hex 格式（直接返回音频数据）
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
        output_format: 'hex', // 返回 hex 格式，然后转为 base64
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
    
    // 获取 hex 格式的音频数据
    const audioHex = result.data?.audio;
    
    if (!audioHex) {
      console.error('[TTS] 无音频数据:', result);
      return NextResponse.json(
        { error: '未返回音频数据' },
        { status: 500 }
      );
    }
    
    // 将 hex 转为 base64
    const audioBuffer = Buffer.from(audioHex, 'hex');
    const audioBase64 = audioBuffer.toString('base64');
    
    console.log('[TTS] 合成成功, 时长:', result.extra_info?.audio_length, 'ms');
    
    // 构建 data URL 供前端直接播放
    const audioUrl = `data:audio/mp3;base64,${audioBase64}`;
    
    return NextResponse.json({
      audioUrl,        // data URL，可直接播放
      audioBase64,     // 原始 base64，用于存储
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
