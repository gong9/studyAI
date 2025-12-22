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

const MINIMAX_API_BASE = 'https://api.minimaxi.com';

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

// 调用 TTS 并返回音频 base64
async function generateTTSAudio(text: string): Promise<{ base64: string; duration: number }> {
  const apiKey = getApiKey();
  
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
        voice_id: 'male-qn-qingse',
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

    console.log('[Publish] 开始发布课程:', manuscriptId);

    // 1. 获取手稿数据
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
      return NextResponse.json({
        success: true,
        courseId: existingCourse.id,
        message: '课程已存在',
        isExisting: true,
      });
    }

    // 检查必要数据
    if (!manuscript.bananaImages) {
      return NextResponse.json({ error: '请先生成精美PPT' }, { status: 400 });
    }

    if (!manuscript.lectureScript) {
      return NextResponse.json({ error: '请先生成讲解稿' }, { status: 400 });
    }

    // 2. 解析数据
    const slides: string[] = JSON.parse(manuscript.bananaImages);
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

    // 批量生成 TTS（顺序执行，避免并发过多）
    const audioResults: Map<string, { base64: string; duration: number }> = new Map();
    
    for (let i = 0; i < speakTexts.length; i++) {
      const item = speakTexts[i];
      const key = `${item.slideIdx}-${item.actionIdx}`;
      
      console.log(`[Publish] 生成语音 ${i + 1}/${speakTexts.length}: ${item.text.substring(0, 30)}...`);
      
      try {
        const result = await generateTTSAudio(item.text);
        audioResults.set(key, result);
      } catch (error: any) {
        console.error(`[Publish] 语音生成失败:`, error.message);
        // 继续处理其他语音，失败的跳过
      }
    }

    console.log(`[Publish] 语音生成完成: ${audioResults.size}/${speakTexts.length}`);

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
    const course = await prisma.course.create({
      data: {
        manuscriptId,
        title: manuscript.chapter.title,
        description: `${manuscript.chapter.title} - AI 智能课程`,
        coverImage: slides[0] || null,
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

