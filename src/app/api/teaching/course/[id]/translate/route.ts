/**
 * POST /api/teaching/course/[id]/translate
 * 
 * 创建英文版课程
 * 1. 翻译 HTML 幻灯片
 * 2. 翻译演讲稿
 * 3. 生成英文 TTS
 * 4. 保存为新的英文版课程
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  translateHtmlSlides,
  translateLectureScript,
  type HtmlSlide,
  type LectureScript,
  type TranslateProgressCallback,
} from '@/lib/teaching/translate/translate-service';

const MINIMAX_API_BASE = 'https://api.minimaxi.com';

// 英文 TTS 音色
const ENGLISH_VOICE_ID = 'Calm_Woman'; // MiniMax 英文音色

// 课程帧类型
interface CourseFrame {
  slideIndex: number;
  action: 'speak' | 'highlight' | 'next_slide' | 'end';
  text?: string;
  audioIndex?: number;
  audioDuration?: number;
  highlightTarget?: string;
  timestamp: number;
}

// 获取 API Key
function getApiKey(): string {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    throw new Error('MINIMAX_API_KEY 未配置');
  }
  return apiKey;
}

// 延迟函数
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 全局限速状态
let isRateLimited = false;
let rateLimitResetTime = 0;

// 生成英文 TTS
async function generateEnglishTTS(
  text: string,
  maxRetries: number = 5,
  retryDelayMs: number = 5000
): Promise<{ base64: string; duration: number }> {
  const apiKey = getApiKey();

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // 检查全局限速状态
    if (isRateLimited && Date.now() < rateLimitResetTime) {
      const waitTime = rateLimitResetTime - Date.now();
      await delay(waitTime);
    }

    try {
      const response = await fetch(`${MINIMAX_API_BASE}/v1/t2a_v2`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'speech-2.6-turbo',
          text,
          stream: false,
          language_boost: 'English', // 强制英文
          voice_setting: {
            voice_id: ENGLISH_VOICE_ID,
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
        if (response.status === 429) {
          throw new Error('rate limit');
        }
        throw new Error(`TTS API 调用失败: ${response.status}`);
      }

      const result = await response.json();

      if (result.base_resp?.status_code !== 0) {
        const errorMsg = result.base_resp?.status_msg || 'TTS 合成失败';
        if (
          errorMsg.toLowerCase().includes('rate') ||
          errorMsg.toLowerCase().includes('limit') ||
          errorMsg.includes('频率')
        ) {
          throw new Error('rate limit');
        }
        throw new Error(errorMsg);
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
    } catch (error: any) {
      lastError = error;

      if (error.message === 'rate limit' && attempt < maxRetries) {
        const waitTime = retryDelayMs * attempt;
        isRateLimited = true;
        rateLimitResetTime = Date.now() + waitTime;
        await delay(waitTime);

        isRateLimited = false;
        continue;
      }

      throw error;
    }
  }

  throw lastError || new Error('TTS 生成失败');
}

// POST: 创建英文版课程
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: courseId } = await params;


    // 1. 获取中文课程
    const zhCourse = await prisma.course.findUnique({
      where: { id: courseId },
    });

    if (!zhCourse) {
      return NextResponse.json({ error: '课程不存在' }, { status: 404 });
    }

    if (zhCourse.language !== 'zh') {
      return NextResponse.json({ error: '只能翻译中文课程' }, { status: 400 });
    }

    // 2. 检查是否已有英文版
    const existingEn = await prisma.course.findFirst({
      where: {
        manuscriptId: zhCourse.manuscriptId,
        language: 'en',
      },
    });

    if (existingEn) {
      return NextResponse.json({
        success: true,
        courseId: existingEn.id,
        message: '英文版已存在',
        isExisting: true,
      });
    }

    // 创建 SSE 流
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendProgress = (stage: string, percent: number, message: string) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ stage, percent, message })}\n\n`)
          );
        };

        try {
          // 3. 翻译 HTML 幻灯片
          sendProgress('translating_slides', 10, '正在翻译 PPT 幻灯片...');

          const zhSlides: HtmlSlide[] = JSON.parse(zhCourse.slides);

          const enSlides = await translateHtmlSlides(zhSlides, (progress) => {
            const percent = 10 + Math.floor((progress.current / progress.total) * 30);
            sendProgress('translating_slides', percent, progress.message);
          });

          // 4. 翻译演讲稿
          sendProgress('translating_script', 40, '正在翻译演讲稿...');

          const zhFrames: CourseFrame[] = JSON.parse(zhCourse.frames);

          // 从 frames 构建 LectureScript
          const slideScriptsMap = new Map<number, { action: string; text?: string; target?: string }[]>();
          for (const frame of zhFrames) {
            if (!slideScriptsMap.has(frame.slideIndex)) {
              slideScriptsMap.set(frame.slideIndex, []);
            }
            slideScriptsMap.get(frame.slideIndex)!.push({
              action: frame.action,
              text: frame.text,
              target: frame.highlightTarget,
            });
          }

          const lectureScript: LectureScript = {
            slides: Array.from(slideScriptsMap.entries()).map(([index, actions]) => ({
              index,
              actions: actions as any,
            })),
          };

          const enScript = await translateLectureScript(lectureScript, (progress) => {
            const percent = 40 + Math.floor((progress.current / progress.total) * 20);
            sendProgress('translating_script', percent, progress.message);
          });

          // 5. 生成英文 TTS
          sendProgress('generating_tts', 60, '正在生成英文语音...');

          const enFrames: CourseFrame[] = [];
          const enAudioData: { [key: number]: string } = {};
          let audioIndex = 0;
          let currentTimestamp = 0;
          let totalDuration = 0;

          // 收集所有需要生成 TTS 的文本
          const speakTexts: { slideIdx: number; text: string }[] = [];
          for (const slide of enScript.slides) {
            for (const action of slide.actions) {
              if (action.action === 'speak' && action.text) {
                speakTexts.push({
                  slideIdx: slide.index,
                  text: action.text,
                });
              }
            }
          }


          // 生成 TTS 并构建 frames
          const audioResults: Map<number, { base64: string; duration: number }> = new Map();

          for (let i = 0; i < speakTexts.length; i++) {
            const item = speakTexts[i];
            const percent = 60 + Math.floor(((i + 1) / speakTexts.length) * 30);
            sendProgress(
              'generating_tts',
              percent,
              `生成英文语音 ${i + 1}/${speakTexts.length}`
            );

            try {
              const result = await generateEnglishTTS(item.text);
              audioResults.set(i, result);
              await delay(1000); // 避免限速
            } catch (error: any) {
              console.error(`[TranslateAPI] 语音生成失败:`, error.message);
              // 跳过失败的语音
            }
          }

          // 构建帧序列
          let speakIndex = 0;
          for (const slide of enScript.slides) {
            for (const action of slide.actions) {
              if (action.action === 'speak' && action.text) {
                const audioResult = audioResults.get(speakIndex);
                if (audioResult) {
                  enAudioData[audioIndex] = audioResult.base64;
                  enFrames.push({
                    slideIndex: slide.index,
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
                speakIndex++;
              } else if (action.action === 'highlight' && action.target) {
                enFrames.push({
                  slideIndex: slide.index,
                  action: 'highlight',
                  highlightTarget: action.target,
                  timestamp: currentTimestamp,
                });
              } else if (action.action === 'next_slide') {
                enFrames.push({
                  slideIndex: slide.index,
                  action: 'next_slide',
                  timestamp: currentTimestamp,
                });
                currentTimestamp += 500;
                totalDuration += 500;
              } else if (action.action === 'end') {
                enFrames.push({
                  slideIndex: slide.index,
                  action: 'end',
                  timestamp: currentTimestamp,
                });
              }
            }
          }

          // 6. 创建英文版课程
          sendProgress('saving', 95, '正在保存英文版课程...');

          const enCourse = await prisma.course.create({
            data: {
              manuscriptId: zhCourse.manuscriptId,
              language: 'en',
              title: zhCourse.title + ' (English)',
              description: zhCourse.description
                ? zhCourse.description + ' - English Version'
                : 'English Version',
              coverImage: zhCourse.coverImage,
              duration: totalDuration,
              slides: JSON.stringify(enSlides),
              frames: JSON.stringify(enFrames),
              audioData: JSON.stringify(enAudioData),
              slideFormat: zhCourse.slideFormat,
              backgroundMusic: zhCourse.backgroundMusic,
              status: 'published',
            },
          });


          // 完成
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                complete: true,
                courseId: enCourse.id,
                title: enCourse.title,
                duration: enCourse.duration,
                message: '英文版课程创建成功！',
              })}\n\n`
            )
          );

          controller.close();
        } catch (error: any) {
          console.error('[TranslateAPI] 创建英文版失败:', error);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                error: error.message || '创建失败',
              })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error: any) {
    console.error('[TranslateAPI] 错误:', error);
    return NextResponse.json({ error: error.message || '服务器错误' }, { status: 500 });
  }
}

// GET: 检查是否有英文版
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: courseId } = await params;

    // 获取中文课程
    const zhCourse = await prisma.course.findUnique({
      where: { id: courseId },
      select: { manuscriptId: true },
    });

    if (!zhCourse) {
      return NextResponse.json({ error: '课程不存在' }, { status: 404 });
    }

    // 查找英文版
    const enCourse = await prisma.course.findFirst({
      where: {
        manuscriptId: zhCourse.manuscriptId,
        language: 'en',
      },
      select: {
        id: true,
        title: true,
        duration: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      hasEnglishVersion: !!enCourse,
      englishCourse: enCourse,
    });
  } catch (error: any) {
    console.error('[TranslateAPI] 检查失败:', error);
    return NextResponse.json({ error: error.message || '检查失败' }, { status: 500 });
  }
}

