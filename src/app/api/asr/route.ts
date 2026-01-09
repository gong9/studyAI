import { NextRequest, NextResponse } from 'next/server';

// AIHubMix Whisper API（使用 BANANA_API_KEY）
const API_KEY = process.env.BANANA_API_KEY || process.env.NANO_BANANA_KEY;
const API_BASE = process.env.BANANA_API_BASE || 'https://aihubmix.com/v1';
const WHISPER_API_URL = `${API_BASE}/audio/transcriptions`;

/**
 * POST /api/asr
 * 接收音频数据，调用 OpenAI Whisper 语音识别
 */
export async function POST(request: NextRequest) {
  try {
    if (!API_KEY) {
      return NextResponse.json(
        { error: 'BANANA_API_KEY 未配置' },
        { status: 500 }
      );
    }
    
    // 获取音频数据
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File | null;
    
    if (!audioFile) {
      return NextResponse.json(
        { error: '缺少音频文件' },
        { status: 400 }
      );
    }
    
    
    // 构建 OpenAI 请求
    const openaiFormData = new FormData();
    openaiFormData.append('file', audioFile, 'recording.wav');
    openaiFormData.append('model', 'whisper-1');
    openaiFormData.append('language', 'zh'); // 中文
    openaiFormData.append('response_format', 'json');
    
    // 可选：添加 prompt 提示词，帮助识别专业术语
    const prompt = formData.get('prompt') as string | null;
    if (prompt) {
      openaiFormData.append('prompt', prompt);
    } else {
      // 默认提示词，包含常见技术术语
      openaiFormData.append('prompt', 
        'React, Vue, Angular, TypeScript, JavaScript, Python, API, HTTP, WebSocket, ' +
        'Node.js, Next.js, MongoDB, PostgreSQL, Redis, Docker, Kubernetes, ' +
        'AI, 人工智能, 机器学习, 深度学习, 神经网络, Transformer, GPT, LLM, ' +
        'RAG, Embedding, Vector, 向量数据库, LangChain, ' +
        '微积分, 导数, 积分, 函数, 方程, 概率, 统计'
      );
    }
    
    // 调用 Whisper API（通过 AIHubMix）
    const response = await fetch(WHISPER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: openaiFormData,
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Whisper] API 错误:', response.status, errorText);
      return NextResponse.json(
        { error: `Whisper API 错误: ${response.status}` },
        { status: response.status }
      );
    }
    
    const result = await response.json();
    
    
    return NextResponse.json({
      success: true,
      text: result.text || '',
    });
    
  } catch (error: any) {
    console.error('[Whisper] 错误:', error);
    return NextResponse.json(
      { error: error.message || '语音识别失败' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/asr
 * 检查 ASR 服务状态
 */
export async function GET() {
  const configured = !!API_KEY;
  
  return NextResponse.json({
    service: 'aihubmix-whisper',
    configured,
    apiBase: API_BASE,
    message: configured ? 'AIHubMix Whisper 已配置' : '请配置 BANANA_API_KEY',
  });
}
