/**
 * POST /api/teaching/manuscript/[id]/publish
 * 
 * 发布为课程 - 将 PPT + 讲解指令 + TTS音频 打包成可重放的课程
 * 1. 读取 bananaImages 和 lectureScript
 * 2. 遍历所有 speak 指令，批量调用 TTS 生成音频
 * 3. 创建 Course 记录
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const MINIMAX_API_BASE = 'https://api.minimaxi.com';
const CLONED_VOICE_CONFIG_PATH = join(process.cwd(), 'cloned-voice-config.json');

// 课程帧类型
interface CourseFrame {
  slideIndex: number;
  action: 'speak' | 'highlight' | 'next_slide' | 'end';
  text?: string;
  audioIndex?: number;        // 对应 audioData 中的索引
  audioDuration?: number;     // 音频时长(ms)
  highlightTarget?: string;
  timestamp: number;          // 帧开始时间(ms)
}

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
        console.log('[Publish] 使用复刻音色:', config.voiceId);
        return config.voiceId;
      }
    }
  } catch (error) {
    console.error('[Publish] 读取复刻音色配置失败:', error);
  }
  return 'male-qn-qingse'; // 默认音色
}

// 调用 TTS 并返回音频 base64
async function generateTTSAudio(text: string): Promise<{ base64: string; duration: number }> {
  const apiKey = getApiKey();
  const voiceId = getActiveVoiceId(); // 使用复刻音色或默认音色
  
  const response = await fetch(`${MINIMAX_API_BASE}/v1/t2a_v2`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'speech-2.6-turbo',
      text,
      stream: false,
      language_boost: 'auto',
      voice_setting: {
        voice_id: voiceId,
        speed: 1,
        vol: 1,
        pitch: 0,
      },
      audio_setting: {
        sample_rate: 32000,
        bitrate: 128000,
        format: 'mp3',
        channel: 1,
      },
      output_format: 'url',
    }),
  });

  if (!response.ok) {
    throw new Error(`TTS API 调用失败: ${response.status}`);
  }

  const result = await response.json();
  
  if (result.base_resp?.status_code !== 0) {
    throw new Error(result.base_resp?.status_msg || 'TTS 合成失败');
  }

  const audioUrl = result.data?.audio;
  const duration = result.extra_info?.audio_length || 0;

  if (!audioUrl) {
    throw new Error('TTS 未返回音频数据');
  }

  // 下载音频并转为 base64
  const audioResponse = await fetch(audioUrl);
  const audioBuffer = await audioResponse.arrayBuffer();
  const base64 = Buffer.from(audioBuffer).toString('base64');

  return { base64, duration };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: manuscriptId } = await params;
    
    // 解析请求参数
    const body = await request.json().catch(() => ({}));
    const forceRegenerate = body.force === true; // 是否强制重新发布

    console.log('[Publish] 开始发布课程:', manuscriptId, forceRegenerate ? '(强制重新生成)' : '');

    // 1. 获取手稿数据（包括缓存的音频）
    const manuscript = await prisma.teachingManuscript.findUnique({
      where: { id: manuscriptId },
      include: {
        chapter: true,
      },
    });

    if (!manuscript) {
      return NextResponse.json({ error: '手稿不存在' }, { status: 404 });
    }

    // 检查是否已有课程
    const existingCourse = await prisma.course.findUnique({
      where: { manuscriptId },
    });
    
    if (existingCourse) {
      if (forceRegenerate) {
        // 强制重新发布：删除旧课程
        console.log('[Publish] 删除旧课程:', existingCourse.id);
        await prisma.course.delete({
          where: { id: existingCourse.id },
        });
      } else {
        return NextResponse.json({
          success: true,
          courseId: existingCourse.id,
          message: '课程已存在',
          isExisting: true,
        });
      }
    }

    // 检查必要数据 - 只需要讲解稿，精美PPT是可选的
    if (!manuscript.lectureScript) {
      return NextResponse.json({ error: '请先生成讲解稿' }, { status: 400 });
    }

    // 2. 解析数据
    // 优先使用精美PPT，如果没有则使用普通的 slidevMd
    let slides: string[] = [];
    const hasBananaImages = !!manuscript.bananaImages;
    
    if (hasBananaImages) {
      slides = JSON.parse(manuscript.bananaImages);
      console.log('[Publish] 使用精美PPT模式');
    } else {
      // 从 slidevMd 解析普通幻灯片
      const slidevContent = manuscript.slidevMd || manuscript.enrichedContent || '';
      if (slidevContent) {
        let parts = slidevContent.split(/\n---\n/);
        // 跳过 frontmatter
        if (parts[0].trim().startsWith('---') || parts[0].includes('theme:')) {
          parts = parts.slice(1);
        }
        // 普通模式下，slides 存储的是 markdown 内容（不是图片URL）
        slides = parts.filter((p: string) => p.trim().length > 0);
        console.log('[Publish] 使用普通PPT模式');
      }
    }
    
    if (slides.length === 0) {
      return NextResponse.json({ error: '没有可发布的PPT内容' }, { status: 400 });
    }
    
    const lectureScript = JSON.parse(manuscript.lectureScript);
    
    console.log(`[Publish] 解析完成: ${slides.length} 页PPT, ${lectureScript.slides?.length || 0} 页讲解`);

    // 3. 构建帧序列并生成音频
    const frames: CourseFrame[] = [];
    const audioData: { [key: number]: string } = {};
    let audioIndex = 0;
    let currentTimestamp = 0;
    let totalDuration = 0;

    // 收集所有需要生成的 speak 文本
    const speakTexts: { slideIdx: number; actionIdx: number; text: string }[] = [];
    
    for (const slideScript of lectureScript.slides || []) {
      for (let actionIdx = 0; actionIdx < slideScript.actions.length; actionIdx++) {
        const action = slideScript.actions[actionIdx];
        if (action.action === 'speak' && action.text) {
          speakTexts.push({
            slideIdx: slideScript.index,
            actionIdx,
            text: action.text,
          });
        }
      }
    }

    console.log(`[Publish] 需要生成 ${speakTexts.length} 条语音`);

    // 读取已缓存的音频（来自演示时的预加载）
    let audioCache: Record<string, string> = {};
    if (manuscript.cachedAudio) {
      try {
        audioCache = JSON.parse(manuscript.cachedAudio);
        console.log(`[Publish] 发现 ${Object.keys(audioCache).length} 条已缓存的音频`);
      } catch (e) {
        // ignore
      }
    }

    // 批量生成 TTS
    // 注意：暂时不使用缓存，因为缓存中没有保存时长信息，会导致视频节奏不对
    // TODO: 改进缓存结构，同时保存 { base64, duration }
    const audioResults: Map<string, { base64: string; duration: number }> = new Map();
    let cacheHitCount = 0;
    let generateCount = 0;
    
    for (let i = 0; i < speakTexts.length; i++) {
      const item = speakTexts[i];
      const key = `${item.slideIdx}-${item.actionIdx}`;
      
      // 暂时禁用缓存，直接生成音频以获取准确时长
      // TODO: 未来可以改进缓存结构来复用
      /*
      if (audioCache[item.text]) {
        console.log(`[Publish] ✓ 使用缓存 ${i + 1}/${speakTexts.length}: ${item.text.substring(0, 30)}...`);
        // 缓存里只有 base64，没有时长信息
        audioResults.set(key, { base64: audioCache[item.text], duration: ??? });
        cacheHitCount++;
        continue;
      }
      */
      
      // 调用 TTS 生成（包含准确的时长信息）
      console.log(`[Publish] → 生成语音 ${i + 1}/${speakTexts.length}: ${item.text.substring(0, 30)}...`);
      
      try {
        const result = await generateTTSAudio(item.text);
        audioResults.set(key, result);
        generateCount++;
      } catch (error: any) {
        console.error(`[Publish] 语音生成失败:`, error.message);
        // 继续处理其他语音，失败的跳过
      }
    }

    console.log(`[Publish] 语音生成完成: ${generateCount} 条, 总计 ${audioResults.size}/${speakTexts.length}`);

    // 4. 构建帧序列
    let currentSlideIndex = 0;
    
    for (const slideScript of lectureScript.slides || []) {
      currentSlideIndex = slideScript.index;
      
      for (let actionIdx = 0; actionIdx < slideScript.actions.length; actionIdx++) {
        const action = slideScript.actions[actionIdx];
        
        if (action.action === 'speak' && action.text) {
          const key = `${slideScript.index}-${actionIdx}`;
          const audioResult = audioResults.get(key);
          
          if (audioResult) {
            // 保存音频数据
            audioData[audioIndex] = audioResult.base64;
            
            frames.push({
              slideIndex: currentSlideIndex,
              action: 'speak',
              text: action.text,
              audioIndex,
              audioDuration: audioResult.duration,
              timestamp: currentTimestamp,
            });
            
            currentTimestamp += audioResult.duration;
            totalDuration += audioResult.duration;
            audioIndex++;
          }
        } else if (action.action === 'highlight' && action.target) {
          frames.push({
            slideIndex: currentSlideIndex,
            action: 'highlight',
            highlightTarget: action.target,
            timestamp: currentTimestamp,
          });
          // 高亮不增加时间
        } else if (action.action === 'next_slide') {
          frames.push({
            slideIndex: currentSlideIndex,
            action: 'next_slide',
            timestamp: currentTimestamp,
          });
          // 翻页添加短暂停顿
          currentTimestamp += 500;
          totalDuration += 500;
        } else if (action.action === 'end') {
          frames.push({
            slideIndex: currentSlideIndex,
            action: 'end',
            timestamp: currentTimestamp,
          });
        }
      }
    }

    console.log(`[Publish] 帧序列构建完成: ${frames.length} 帧, 总时长 ${Math.round(totalDuration / 1000)}秒`);

    // 5. 创建课程记录
    // 封面图：精美模式用第一张图，普通模式暂无封面
    const coverImage = hasBananaImages ? slides[0] : null;
    
    const course = await prisma.course.create({
      data: {
        manuscriptId,
        title: manuscript.chapter.title,
        description: `${manuscript.chapter.title} - AI 智能课程${hasBananaImages ? '' : '（普通模式）'}`,
        coverImage,
        duration: totalDuration,
        slides: JSON.stringify(slides),
        frames: JSON.stringify(frames),
        audioData: JSON.stringify(audioData),
        status: 'published',
      },
    });

    console.log(`[Publish] 课程创建成功: ${course.id}`);

    return NextResponse.json({
      success: true,
      courseId: course.id,
      title: course.title,
      duration: course.duration,
      frameCount: frames.length,
      audioCount: Object.keys(audioData).length,
      message: '课程发布成功',
    });

  } catch (error: any) {
    console.error('[Publish] 发布失败:', error);
    return NextResponse.json(
      { error: error.message || '发布失败' },
      { status: 500 }
    );
  }
}

// GET: 检查课程是否已发布
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: manuscriptId } = await params;

    const course = await prisma.course.findUnique({
      where: { manuscriptId },
      select: {
        id: true,
        title: true,
        duration: true,
        status: true,
        viewCount: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      hasPublished: !!course,
      course,
    });

  } catch (error: any) {
    console.error('[Publish] 检查失败:', error);
    return NextResponse.json(
      { error: error.message || '检查失败' },
      { status: 500 }
    );
  }
}

