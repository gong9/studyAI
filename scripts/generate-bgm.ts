/**
 * 批量生成 AI 背景音乐脚本
 * 
 * 使用方法: npx tsx scripts/generate-bgm.ts
 */

import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs-extra';

// 加载环境变量
dotenv.config({ path: path.join(process.cwd(), '.env') });

const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;
const MINIMAX_MUSIC_API = 'https://api.minimaxi.com/v1/music_generation';
const OUTPUT_DIR = path.join(process.cwd(), 'public', 'audio', 'bgm');

// 要生成的音乐配置
const MUSIC_TO_GENERATE = [
  {
    id: 'calm-piano-ai',
    name: '静谧时光',
    nameEn: 'Quiet Moments',
    mood: ['calm', 'focused'],
    tempo: 'slow',
    genre: 'piano',
    scenes: ['teaching', 'intro'],
    description: 'AI 生成的平静钢琴，适合通用教学',
    color: '#64B5F6',
    prompt: `A calm and peaceful solo piano instrumental. 
Gentle, flowing melody with soft dynamics. 
No vocals, no drums, just pure piano. 
Perfect for studying, reading, or background ambiance.
Style: classical crossover, ambient piano. BPM: 70. Key: C major.`,
  },
  {
    id: 'lofi-study-ai',
    name: '午后咖啡',
    nameEn: 'Afternoon Coffee',
    mood: ['focused', 'relaxed'],
    tempo: 'slow',
    genre: 'lofi',
    scenes: ['teaching', 'tech'],
    description: 'AI 生成的 Lo-Fi，适合编程学习',
    color: '#BA68C8',
    prompt: `Chill lo-fi hip hop instrumental beat.
Warm vinyl crackle, mellow piano chords, soft jazz samples.
Relaxed and cozy atmosphere, perfect for studying or coding.
No vocals. Style: lo-fi, chillhop. BPM: 80.`,
  },
  {
    id: 'tech-ambient-ai',
    name: '数码脉冲',
    nameEn: 'Digital Pulse',
    mood: ['focused', 'uplifting'],
    tempo: 'medium',
    genre: 'electronic',
    scenes: ['tech', 'business'],
    description: 'AI 生成的电子音乐，适合科技内容',
    color: '#4DD0E1',
    prompt: `Modern ambient electronic instrumental.
Soft synth pads, subtle arpeggios, futuristic but calming atmosphere.
Clean and professional sound, suitable for tech tutorials or presentations.
No vocals. Style: ambient electronic, synthwave light. BPM: 90.`,
  },
  {
    id: 'inspiring-acoustic-ai',
    name: '启航',
    nameEn: 'Set Sail',
    mood: ['uplifting', 'inspiring'],
    tempo: 'medium',
    genre: 'acoustic',
    scenes: ['teaching', 'intro'],
    description: 'AI 生成的励志音乐，适合开场',
    color: '#81C784',
    prompt: `Uplifting and inspiring acoustic instrumental.
Bright acoustic guitar, warm piano, gentle strings in the background.
Hopeful and motivational feeling, perfect for inspirational content.
No vocals. Style: cinematic, inspirational. BPM: 100.`,
  },
  {
    id: 'orchestral-elegant-ai',
    name: '华章',
    nameEn: 'Grand Movement',
    mood: ['serious', 'inspiring'],
    tempo: 'slow',
    genre: 'orchestral',
    scenes: ['law', 'business'],
    description: 'AI 生成的管弦乐，适合正式场合',
    color: '#FFB74D',
    prompt: `Elegant orchestral instrumental piece.
Dignified strings, subtle brass, majestic but not overwhelming.
Professional and trustworthy atmosphere for formal content.
No vocals. Style: cinematic orchestral, classical crossover. BPM: 65.`,
  },
];

// 纯器乐的歌词结构
const INSTRUMENTAL_LYRICS = `[Intro]
(Soft ambient intro, 8 bars)

[Verse]
(Main melodic theme develops, 16 bars)

[Chorus]
(Gentle crescendo and emotional peak, 8 bars)

[Verse]
(Melodic variation, 16 bars)

[Bridge]
(Subtle transition, 8 bars)

[Outro]
(Soft fade out, 8 bars)`;

async function generateMusic(config: typeof MUSIC_TO_GENERATE[0]): Promise<string | null> {
  console.log(`\n🎵 生成: ${config.name} (${config.id})...`);
  
  try {
    const response = await fetch(MINIMAX_MUSIC_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MINIMAX_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'music-2.0',
        prompt: config.prompt,
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
      console.error(`   ❌ API 错误: ${response.status} - ${errorText}`);
      return null;
    }

    const result = await response.json();
    
    console.log('   📦 API 响应:', JSON.stringify(result).substring(0, 500));
    
    if (!result.data?.audio) {
      console.error('   ❌ 未收到音频数据');
      console.error('   响应内容:', JSON.stringify(result, null, 2));
      return null;
    }

    // 保存音频文件
    const audioHex = result.data.audio;
    const audioBuffer = Buffer.from(audioHex, 'hex');
    
    const filename = `${config.id}.mp3`;
    const outputPath = path.join(OUTPUT_DIR, filename);
    
    await fs.writeFile(outputPath, audioBuffer);
    
    console.log(`   ✅ 保存: ${filename} (${(audioBuffer.length / 1024 / 1024).toFixed(2)} MB)`);
    
    return filename;

  } catch (error: any) {
    console.error(`   ❌ 错误: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('🎼 AI 背景音乐批量生成');
  console.log('========================\n');

  if (!MINIMAX_API_KEY) {
    console.error('❌ 未配置 MINIMAX_API_KEY 环境变量');
    process.exit(1);
  }

  // 确保输出目录存在
  await fs.ensureDir(OUTPUT_DIR);

  const results: typeof MUSIC_TO_GENERATE = [];
  
  for (const config of MUSIC_TO_GENERATE) {
    const filename = await generateMusic(config);
    
    if (filename) {
      results.push({
        ...config,
        prompt: '', // 不保存 prompt 到 library
      });
    }
    
    // 避免 API 限流，等待一下
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // 更新 music-library.json
  const library = {
    version: '2.0.0',
    updatedAt: new Date().toISOString().split('T')[0],
    generatedBy: 'MiniMax Music API',
    tracks: results.map(r => ({
      id: r.id,
      name: r.name,
      nameEn: r.nameEn,
      duration: 120, // 预估时长
      filename: `${r.id}.mp3`,
      mood: r.mood,
      tempo: r.tempo,
      genre: r.genre,
      scenes: r.scenes,
      description: r.description,
      color: r.color,
    })),
  };

  const libraryPath = path.join(OUTPUT_DIR, 'music-library.json');
  await fs.writeJson(libraryPath, library, { spaces: 2 });

  console.log('\n========================');
  console.log(`✅ 完成！生成了 ${results.length} 首背景音乐`);
  console.log(`📁 位置: ${OUTPUT_DIR}`);
}

main().catch(console.error);

