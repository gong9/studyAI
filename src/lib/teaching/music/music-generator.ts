/**
 * AI 背景音乐生成服务
 * 
 * 使用 MiniMax Music API 根据课程内容生成定制背景音乐
 */

import path from 'path';
import fs from 'fs-extra';

const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;
const MINIMAX_MUSIC_API = 'https://api.minimaxi.com/v1/music_generation';

// 背景音乐生成的 Prompt 模板（纯器乐 BGM，绝对无人声）
const BGM_PROMPT_TEMPLATES: Record<string, string> = {
  // 教学通用
  teaching: `Pure instrumental background music. Solo piano with soft ambient pads.
Calm, peaceful, concentration-enhancing. ABSOLUTELY NO VOCALS, NO SINGING, NO HUMMING.
This is pure BGM for educational video background.
Style: ambient piano, study music. BPM: 70. Instrumental only.`,

  // 科技/编程
  tech: `Pure instrumental electronic ambient BGM. Soft synth pads, subtle textures.
Futuristic but calming atmosphere. ABSOLUTELY NO VOCALS, NO SINGING.
Perfect background music for coding tutorials.
Style: ambient electronic. BPM: 85. Instrumental only.`,

  // 法律/商务
  law: `Pure instrumental orchestral BGM. Elegant strings and piano.
Dignified, professional atmosphere. ABSOLUTELY NO VOCALS, NO SINGING.
Background music for formal business content.
Style: cinematic orchestral. BPM: 65. Instrumental only.`,

  // 励志/积极
  inspiring: `Pure instrumental uplifting BGM. Bright piano, gentle acoustic guitar.
Warm, hopeful, motivational feeling. ABSOLUTELY NO VOCALS, NO SINGING.
Inspiring background music for educational content.
Style: inspirational acoustic. BPM: 95. Instrumental only.`,

  // 放松/冥想
  relaxed: `Pure instrumental ambient BGM. Soft nature sounds, gentle synth pads.
Very calm, serene, meditative. ABSOLUTELY NO VOCALS, NO SINGING.
Relaxing background music for calm content.
Style: ambient, meditation. BPM: 55. Instrumental only.`,
};

// 纯器乐 - 使用纯音乐结构标记，无任何歌词
// MiniMax Music API: 使用 [Instrumental] 标记生成纯器乐
const INSTRUMENTAL_LYRICS = `[Instrumental]
[Intro]
[Verse]
[Chorus]
[Bridge]
[Outro]`;

export interface MusicGenerationRequest {
  sceneType: 'teaching' | 'tech' | 'law' | 'inspiring' | 'relaxed';
  customPrompt?: string;  // 可选的自定义描述
  duration?: number;      // 期望时长（秒），默认 120
}

export interface MusicGenerationResult {
  success: boolean;
  audioUrl?: string;      // 生成的音频文件 URL
  filename?: string;      // 文件名
  error?: string;
}

/**
 * 使用 MiniMax API 生成背景音乐
 */
export async function generateBackgroundMusic(
  request: MusicGenerationRequest
): Promise<MusicGenerationResult> {
  if (!MINIMAX_API_KEY) {
    return {
      success: false,
      error: '未配置 MINIMAX_API_KEY 环境变量',
    };
  }

  const prompt = request.customPrompt || BGM_PROMPT_TEMPLATES[request.sceneType] || BGM_PROMPT_TEMPLATES.teaching;


  try {
    const response = await fetch(MINIMAX_MUSIC_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MINIMAX_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'music-2.0',
        prompt: prompt,
        lyrics: INSTRUMENTAL_LYRICS,
        audio_setting: {
          sample_rate: 32000,
          bitrate: 128000,
          format: 'mp3',
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[MusicGenerator] API error:', errorText);
      return {
        success: false,
        error: `API 请求失败: ${response.status} - ${errorText}`,
      };
    }

    const result = await response.json();
    
    if (!result.data?.audio) {
      return {
        success: false,
        error: '未收到音频数据',
      };
    }

    // 保存音频文件
    const audioHex = result.data.audio;
    const audioBuffer = Buffer.from(audioHex, 'hex');
    
    const timestamp = Date.now();
    const filename = `ai-generated-${request.sceneType}-${timestamp}.mp3`;
    const bgmDir = path.join(process.cwd(), 'public', 'audio', 'bgm');
    const outputPath = path.join(bgmDir, filename);
    
    await fs.ensureDir(bgmDir);
    await fs.writeFile(outputPath, audioBuffer);
    

    // 更新 music-library.json
    const libraryPath = path.join(bgmDir, 'music-library.json');
    let library: any = { version: '1.0.0', updatedAt: '', tracks: [] };
    
    try {
      if (await fs.pathExists(libraryPath)) {
        library = await fs.readJson(libraryPath);
      }
    } catch (e) {
      console.warn('[MusicGenerator] Could not read library, creating new');
    }

    // 场景名称映射
    const sceneNames: Record<string, { name: string; nameEn: string; color: string }> = {
      teaching: { name: 'AI·静谧时光', nameEn: 'AI Quiet Moments', color: '#64B5F6' },
      tech: { name: 'AI·数码脉冲', nameEn: 'AI Digital Pulse', color: '#4DD0E1' },
      law: { name: 'AI·华章', nameEn: 'AI Grand Movement', color: '#FFB74D' },
      inspiring: { name: 'AI·启航', nameEn: 'AI Set Sail', color: '#81C784' },
      relaxed: { name: 'AI·云端漫步', nameEn: 'AI Cloud Walk', color: '#CE93D8' },
    };

    const sceneInfo = sceneNames[request.sceneType] || sceneNames.teaching;

    // 添加新音乐
    const newTrack = {
      id: `ai-${request.sceneType}-${timestamp}`,
      name: sceneInfo.name,
      nameEn: sceneInfo.nameEn,
      duration: 120,
      filename,
      mood: request.sceneType === 'inspiring' ? ['uplifting', 'inspiring'] :
            request.sceneType === 'relaxed' ? ['calm', 'relaxed'] :
            request.sceneType === 'law' ? ['serious', 'inspiring'] :
            ['calm', 'focused'],
      tempo: 'slow',
      genre: request.sceneType === 'tech' ? 'electronic' :
             request.sceneType === 'law' ? 'orchestral' :
             request.sceneType === 'inspiring' ? 'acoustic' :
             'piano',
      scenes: [request.sceneType, 'teaching'],
      description: `AI 生成的${sceneInfo.name}背景音乐`,
      color: sceneInfo.color,
      generatedAt: new Date().toISOString(),
    };

    library.tracks.push(newTrack);
    library.updatedAt = new Date().toISOString().split('T')[0];
    
    await fs.writeJson(libraryPath, library, { spaces: 2 });

    return {
      success: true,
      audioUrl: `/audio/bgm/${filename}`,
      filename,
    };

  } catch (error: any) {
    console.error('[MusicGenerator] Error:', error);
    return {
      success: false,
      error: error.message || '生成失败',
    };
  }
}

/**
 * 获取可用的场景类型
 */
export function getAvailableSceneTypes() {
  return Object.keys(BGM_PROMPT_TEMPLATES).map(key => ({
    id: key,
    name: {
      teaching: '通用教学',
      tech: '科技/编程',
      law: '法律/商务',
      inspiring: '励志/积极',
      relaxed: '放松/冥想',
    }[key] || key,
    description: BGM_PROMPT_TEMPLATES[key].split('\n')[0],
  }));
}

