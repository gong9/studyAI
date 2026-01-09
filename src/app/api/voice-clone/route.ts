/**
 * MiniMax 音色复刻 API
 * POST: 上传音频文件并创建复刻音色
 * GET: 查询复刻音色列表
 */

import { NextRequest, NextResponse } from 'next/server';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

const MINIMAX_API_BASE = 'https://api.minimaxi.com';

// 存储复刻音色配置的文件路径
const CLONED_VOICE_CONFIG_PATH = join(process.cwd(), 'cloned-voice-config.json');

// 获取 API Key
function getApiKey(): string {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    throw new Error('MINIMAX_API_KEY 未配置');
  }
  return apiKey;
}

// 获取已保存的复刻音色配置
function getClonedVoiceConfig(): { voiceId?: string; name?: string; createdAt?: string } {
  try {
    if (existsSync(CLONED_VOICE_CONFIG_PATH)) {
      const content = readFileSync(CLONED_VOICE_CONFIG_PATH, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error('[VoiceClone] 读取配置失败:', error);
  }
  return {};
}

// 保存复刻音色配置
function saveClonedVoiceConfig(config: { voiceId: string; name: string; createdAt: string }) {
  writeFileSync(CLONED_VOICE_CONFIG_PATH, JSON.stringify(config, null, 2));
}

// 获取当前使用的音色 ID（优先使用复刻音色）
export function getActiveVoiceId(): string {
  const config = getClonedVoiceConfig();
  return config.voiceId || 'male-qn-qingse'; // 默认音色
}

// GET: 查询当前复刻音色配置
export async function GET() {
  try {
    const config = getClonedVoiceConfig();
    const activeVoiceId = getActiveVoiceId();
    
    return NextResponse.json({
      hasClonedVoice: !!config.voiceId,
      config,
      activeVoiceId,
      defaultVoiceId: 'male-qn-qingse',
    });
  } catch (error: any) {
    console.error('[VoiceClone] 查询失败:', error);
    return NextResponse.json(
      { error: error.message || '查询失败' },
      { status: 500 }
    );
  }
}

// POST: 上传音频并创建复刻音色
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const voiceName = formData.get('name') as string || '复刻音色';
    
    if (!file) {
      return NextResponse.json({ error: '缺少音频文件' }, { status: 400 });
    }
    
    const apiKey = getApiKey();
    
    
    // 步骤 1: 上传音频文件
    
    const uploadFormData = new FormData();
    uploadFormData.append('purpose', 'voice_clone');
    uploadFormData.append('file', file);
    
    const uploadResponse = await fetch(`${MINIMAX_API_BASE}/v1/files/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: uploadFormData,
    });
    
    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('[VoiceClone] 上传失败:', errorText);
      return NextResponse.json(
        { error: '音频上传失败', details: errorText },
        { status: uploadResponse.status }
      );
    }
    
    const uploadResult = await uploadResponse.json();
    
    if (uploadResult.base_resp?.status_code !== 0) {
      console.error('[VoiceClone] 上传返回错误:', uploadResult.base_resp);
      return NextResponse.json(
        { error: uploadResult.base_resp?.status_msg || '上传失败' },
        { status: 400 }
      );
    }
    
    const fileId = uploadResult.file?.file_id;
    
    // 步骤 2: 创建复刻音色
    
    // voice_id 格式要求：
    // 1. 首字符必须为英文字母
    // 2. 允许数字、字母、-、_
    // 3. 末位字符不可为 -、_
    // 4. 创建的 voice_id 不可与之前重复
    const voiceIdSuffix = voiceName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'custom';
    const generatedVoiceId = `${voiceIdSuffix}${Date.now()}`;
    
    const cloneResponse = await fetch(`${MINIMAX_API_BASE}/v1/voice_clone`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        file_id: fileId,
        voice_id: generatedVoiceId,
      }),
    });
    
    if (!cloneResponse.ok) {
      const errorText = await cloneResponse.text();
      console.error('[VoiceClone] 复刻失败:', errorText);
      return NextResponse.json(
        { error: '音色复刻失败', details: errorText },
        { status: cloneResponse.status }
      );
    }
    
    const cloneResult = await cloneResponse.json();
    
    if (cloneResult.base_resp?.status_code !== 0) {
      console.error('[VoiceClone] 复刻返回错误:', cloneResult.base_resp);
      return NextResponse.json(
        { error: cloneResult.base_resp?.status_msg || '复刻失败' },
        { status: 400 }
      );
    }
    
    const voiceId = cloneResult.voice_id;
    
    // 保存配置
    const config = {
      voiceId,
      name: voiceName,
      createdAt: new Date().toISOString(),
      fileId,
    };
    saveClonedVoiceConfig(config);
    
    return NextResponse.json({
      success: true,
      message: '音色复刻成功！',
      voiceId,
      config,
    });
    
  } catch (error: any) {
    console.error('[VoiceClone] 音色复刻失败:', error);
    return NextResponse.json(
      { error: error.message || '音色复刻失败' },
      { status: 500 }
    );
  }
}

// DELETE: 重置为默认音色
export async function DELETE() {
  try {
    if (existsSync(CLONED_VOICE_CONFIG_PATH)) {
      const fs = await import('fs');
      fs.unlinkSync(CLONED_VOICE_CONFIG_PATH);
    }
    
    return NextResponse.json({
      success: true,
      message: '已重置为默认音色',
      activeVoiceId: 'male-qn-qingse',
    });
  } catch (error: any) {
    console.error('[VoiceClone] 重置失败:', error);
    return NextResponse.json(
      { error: error.message || '重置失败' },
      { status: 500 }
    );
  }
}

