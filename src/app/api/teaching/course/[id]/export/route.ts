/**
 * POST /api/teaching/course/[id]/export
 * 
 * 导出课程为 MP4 视频
 * - 读取课程的 PPT 图片、帧序列、音频数据
 * - 使用 ffmpeg 合成视频
 * - 返回视频文件
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import ffmpeg from 'fluent-ffmpeg';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// 设置 ffmpeg 路径 - 优先使用系统安装的，否则使用 node_modules 下的
import { existsSync } from 'fs';

const systemFfmpegPath = '/usr/local/bin/ffmpeg';
const nodeModulesFfmpegPath = path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg');

// 优先使用系统 ffmpeg（线上环境），否则使用 node_modules 里的（本地开发）
const ffmpegPath = existsSync(systemFfmpegPath) ? systemFfmpegPath : nodeModulesFfmpegPath;
console.log('[Export] 使用 ffmpeg:', ffmpegPath);
ffmpeg.setFfmpegPath(ffmpegPath);

// 导出选项类型
interface ExportOptions {
  quality: 'fast' | 'balanced' | 'high';  // 质量预设
  resolution: '720p' | '1080p';           // 分辨率
}

// 预设配置
const PRESET_CONFIG = {
  fast: {
    preset: 'ultrafast',
    crf: '28',
    fps: '24',
  },
  balanced: {
    preset: 'veryfast',
    crf: '23',
    fps: '30',
  },
  high: {
    preset: 'medium',
    crf: '18',
    fps: '30',
  },
};

const RESOLUTION_CONFIG = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
};

// 课程帧类型
interface CourseFrame {
  slideIndex: number;
  action: 'speak' | 'highlight' | 'next_slide' | 'end';
  text?: string;           // 字幕文本
  audioIndex?: number;
  audioDuration?: number;
  timestamp: number;
}

// 创建临时目录
async function createTempDir(): Promise<string> {
  const tempDir = path.join(os.tmpdir(), `course-export-${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });
  return tempDir;
}

// 清理临时目录
async function cleanupTempDir(tempDir: string): Promise<void> {
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch (e) {
    console.error('[Export] 清理临时目录失败:', e);
  }
}

// 将 base64 写入文件
async function writeBase64ToFile(base64: string, filePath: string): Promise<void> {
  const buffer = Buffer.from(base64, 'base64');
  await fs.writeFile(filePath, buffer);
}

// 计算每页 PPT 的显示时长（使用实际音频时长）
function calculateSlideDurations(
  frames: CourseFrame[], 
  slideCount: number,
  actualAudioDurations: Map<number, number> // 实际音频时长
): number[] {
  const durations: number[] = new Array(slideCount).fill(0);
  
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    
    if (frame.action === 'speak' && frame.audioIndex !== undefined) {
      // 使用实际音频时长，而不是保存的 audioDuration
      const actualDuration = actualAudioDurations.get(frame.audioIndex);
      if (actualDuration) {
        durations[frame.slideIndex] += actualDuration;
      } else if (frame.audioDuration) {
        // 降级：如果没有实际时长，使用保存的值
        durations[frame.slideIndex] += frame.audioDuration;
      }
    } else if (frame.action === 'next_slide') {
      // 翻页动画时间
      durations[frame.slideIndex] += 500;
    }
  }
  
  // 确保每页至少 1 秒
  return durations.map(d => Math.max(d, 1000));
}

// 合并所有音频，并返回每个音频的时长（从 frames 中获取）
async function mergeAudios(
  audioData: { [key: number]: string },
  frames: CourseFrame[],
  tempDir: string
): Promise<{ mergedPath: string; audioDurations: Map<number, number> }> {
  // 从 frames 中提取音频时长（发布时保存的准确值）
  const audioDurations: Map<number, number> = new Map();
  for (const frame of frames) {
    if (frame.action === 'speak' && frame.audioIndex !== undefined && frame.audioDuration) {
      audioDurations.set(frame.audioIndex, frame.audioDuration);
    }
  }

  // 按顺序收集所有音频索引
  const audioIndexes: number[] = [];
  for (const frame of frames) {
    if (frame.action === 'speak' && frame.audioIndex !== undefined) {
      audioIndexes.push(frame.audioIndex);
    }
  }

  if (audioIndexes.length === 0) {
    throw new Error('没有音频数据');
  }

  // 写入所有音频文件
  const audioFiles: string[] = [];
  
  for (const idx of audioIndexes) {
    if (audioData[idx]) {
      const audioPath = path.join(tempDir, `audio_${idx}.mp3`);
      await writeBase64ToFile(audioData[idx], audioPath);
      audioFiles.push(audioPath);
      console.log(`[Export] 音频 ${idx} 时长: ${audioDurations.get(idx) || 0}ms`);
    }
  }

  // 创建合并列表文件
  const listPath = path.join(tempDir, 'audio_list.txt');
  const listContent = audioFiles.map(f => `file '${f}'`).join('\n');
  await fs.writeFile(listPath, listContent);

  // 合并音频
  const mergedAudioPath = path.join(tempDir, 'merged_audio.mp3');
  
  await new Promise<void>((resolve, reject) => {
    ffmpeg()
      .input(listPath)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions(['-c', 'copy'])
      .output(mergedAudioPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });

  return { mergedPath: mergedAudioPath, audioDurations };
}

// 字幕自动换行：每行最多 maxChars 个字符，直接按字符数切分
function wrapSubtitleText(text: string, maxChars: number = 80): string {
  if (text.length <= maxChars) return text;
  
  const lines: string[] = [];
  
  for (let i = 0; i < text.length; i += maxChars) {
    lines.push(text.slice(i, i + maxChars));
  }
  
  return lines.join('\n');
}

// 生成 SRT 字幕文件
async function generateSubtitles(
  frames: CourseFrame[],
  audioDurations: Map<number, number>,
  tempDir: string
): Promise<string> {
  const srtPath = path.join(tempDir, 'subtitles.srt');
  const subtitles: string[] = [];
  
  let currentTime = 0; // 当前时间（毫秒）
  let subtitleIndex = 1;
  
  for (const frame of frames) {
    if (frame.action === 'speak' && frame.text && frame.audioIndex !== undefined) {
      const duration = audioDurations.get(frame.audioIndex) || frame.audioDuration || 3000;
      const startTime = currentTime;
      const endTime = currentTime + duration;
      
      // 格式化时间为 SRT 格式: 00:00:00,000
      const formatTime = (ms: number) => {
        const hours = Math.floor(ms / 3600000);
        const minutes = Math.floor((ms % 3600000) / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        const milliseconds = ms % 1000;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')},${milliseconds.toString().padStart(3, '0')}`;
      };
      
      // 自动换行处理
      const wrappedText = wrapSubtitleText(frame.text);
      
      subtitles.push(`${subtitleIndex}`);
      subtitles.push(`${formatTime(startTime)} --> ${formatTime(endTime)}`);
      subtitles.push(wrappedText);
      subtitles.push('');
      
      subtitleIndex++;
      currentTime = endTime;
    } else if (frame.action === 'next_slide') {
      currentTime += 500; // 翻页时间
    }
  }
  
  await fs.writeFile(srtPath, subtitles.join('\n'), 'utf-8');
  console.log(`[Export] 生成字幕文件: ${subtitleIndex - 1} 条字幕`);
  
  return srtPath;
}

// 并行控制：限制同时运行的任务数
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<T[]> {
  const results: T[] = [];
  const executing: Promise<void>[] = [];
  
  for (const task of tasks) {
    const p = Promise.resolve().then(() => task()).then(result => {
      results.push(result);
    });
    executing.push(p as Promise<void>);
    
    if (executing.length >= concurrency) {
      await Promise.race(executing);
      // 移除已完成的
      const idx = executing.findIndex(e => e === p);
      if (idx !== -1) executing.splice(idx, 1);
    }
  }
  
  await Promise.all(executing);
  return results;
}

// 检测是否支持硬件加速
// 注意：h264_videotoolbox 对 -loop 1 静态图片输入可能有兼容性问题，暂时禁用
async function detectHardwareEncoder(): Promise<string> {
  // 暂时禁用硬件加速，因为对静态图片循环有兼容性问题
  console.log('[Export] 使用软件编码: libx264 (并行处理)');
  return 'libx264';
}

// 生成视频
async function generateVideo(
  slides: string[],
  slideDurations: number[],
  mergedAudioPath: string,
  subtitlePath: string,
  tempDir: string,
  options: ExportOptions
): Promise<string> {
  const preset = PRESET_CONFIG[options.quality];
  const resolution = RESOLUTION_CONFIG[options.resolution];
  
  // 检测硬件加速
  const encoder = await detectHardwareEncoder();
  const useHardwareEncoder = encoder === 'h264_videotoolbox';
  
  console.log(`[Export] 使用预设: ${options.quality} (${preset.preset}), 分辨率: ${options.resolution}, 编码器: ${encoder}`);

  // 写入所有图片（并行）
  console.log('[Export] 写入图片文件...');
  const imageFiles: string[] = [];
  await Promise.all(slides.map(async (slide, i) => {
    const imagePath = path.join(tempDir, `slide_${i}.png`);
    await writeBase64ToFile(slide, imagePath);
    imageFiles[i] = imagePath;
  }));

  // 创建视频片段生成任务
  const videoParts: string[] = new Array(slides.length);
  const tasks = slides.map((_, i) => async () => {
    const partPath = path.join(tempDir, `part_${i}.mp4`);
    const duration = slideDurations[i] / 1000; // 转为秒

    console.log(`[Export] 生成视频片段 ${i + 1}/${slides.length} (${duration.toFixed(1)}s)...`);

    // 为每张图片生成对应时长的视频
    await new Promise<void>((resolve, reject) => {
      const cmd = ffmpeg()
        .input(imageFiles[i])
        .inputOptions(['-loop', '1']);
      
      // 根据编码器选择不同的参数
      if (useHardwareEncoder) {
        // 硬件编码：VideoToolbox 不支持 -preset 和 -crf，使用 -b:v
        cmd.outputOptions([
          '-c:v', 'h264_videotoolbox',
          '-b:v', options.quality === 'high' ? '8M' : options.quality === 'balanced' ? '5M' : '3M',
          '-t', duration.toString(),
          '-pix_fmt', 'yuv420p',
          '-vf', `scale=${resolution.width}:${resolution.height}:force_original_aspect_ratio=decrease,pad=${resolution.width}:${resolution.height}:(ow-iw)/2:(oh-ih)/2`,
          '-r', preset.fps,
        ]);
      } else {
        // 软件编码
        cmd.outputOptions([
          '-c:v', 'libx264',
          '-preset', preset.preset,
          '-crf', preset.crf,
          '-t', duration.toString(),
          '-pix_fmt', 'yuv420p',
          '-vf', `scale=${resolution.width}:${resolution.height}:force_original_aspect_ratio=decrease,pad=${resolution.width}:${resolution.height}:(ow-iw)/2:(oh-ih)/2`,
          '-r', preset.fps,
        ]);
      }
      
      cmd
        .output(partPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });

    videoParts[i] = partPath;
    return partPath;
  });

  // 并行生成视频片段（限制并发数为 4，避免资源耗尽）
  console.log(`[Export] 并行生成 ${slides.length} 个视频片段 (并发数: 4)...`);
  const startTime = Date.now();
  await runWithConcurrency(tasks, 4);
  console.log(`[Export] 视频片段生成完成，耗时: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

  // 创建拼接列表
  const videoListPath = path.join(tempDir, 'video_list.txt');
  const listContent = videoParts.map(f => `file '${f}'`).join('\n');
  await fs.writeFile(videoListPath, listContent);

  // 拼接所有视频片段（使用 -c copy 避免重编码）
  console.log('[Export] 拼接视频片段...');
  const videoOnlyPath = path.join(tempDir, 'video_only.mp4');
  await new Promise<void>((resolve, reject) => {
    ffmpeg()
      .input(videoListPath)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions(['-c', 'copy'])
      .output(videoOnlyPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });

  // 合并视频、音频和字幕
  console.log('[Export] 合并视频、音频和字幕...');
  const finalVideoPath = path.join(tempDir, 'final.mp4');
  
  // 字幕样式
  const escapedSubtitlePath = subtitlePath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
  // 字幕左右边距 200 像素，限制字幕宽度，避免超出屏幕
  const subtitleFilter = `subtitles='${escapedSubtitlePath}':force_style='FontName=PingFang SC,FontSize=14,PrimaryColour=&HFFFFFF,BackColour=&H80404040,BorderStyle=4,Outline=0,Shadow=0,MarginV=30,MarginL=200,MarginR=200,Alignment=2'`;
  
  await new Promise<void>((resolve, reject) => {
    const cmd = ffmpeg()
      .input(videoOnlyPath)
      .input(mergedAudioPath);
    
    // 最终合成时也使用硬件加速（如果可用）
    if (useHardwareEncoder) {
      cmd.outputOptions([
        '-c:v', 'h264_videotoolbox',
        '-b:v', options.quality === 'high' ? '8M' : options.quality === 'balanced' ? '5M' : '3M',
        '-vf', subtitleFilter,
        '-c:a', 'aac',
        '-shortest',
      ]);
    } else {
      cmd.outputOptions([
        '-c:v', 'libx264',
        '-preset', preset.preset,
        '-crf', preset.crf,
        '-vf', subtitleFilter,
        '-c:a', 'aac',
        '-shortest',
      ]);
    }
    
    cmd
      .output(finalVideoPath)
      .on('end', () => resolve())
      .on('error', (err) => {
        console.error('[Export] 字幕合成失败，尝试不带字幕导出:', err.message);
        // 如果字幕合成失败，尝试不带字幕的版本
        ffmpeg()
          .input(videoOnlyPath)
          .input(mergedAudioPath)
          .outputOptions([
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-shortest',
          ])
          .output(finalVideoPath)
          .on('end', () => resolve())
          .on('error', (err2) => reject(err2))
          .run();
      })
      .run();
  });

  return finalVideoPath;
}

// POST: 导出视频（支持选项）
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let tempDir: string | null = null;
  
  try {
    const { id: courseId } = await params;
    
    // 解析选项
    const body = await request.json().catch(() => ({}));
    const options: ExportOptions = {
      quality: body.quality || 'fast',
      resolution: body.resolution || '1080p',
    };

    console.log('[Export] 开始导出课程:', courseId, options);

    // 获取课程数据
    const course = await prisma.course.findUnique({
      where: { id: courseId },
    });

    if (!course) {
      return NextResponse.json({ error: '课程不存在' }, { status: 404 });
    }

    // 解析数据
    const slides: string[] = JSON.parse(course.slides);
    const frames: CourseFrame[] = JSON.parse(course.frames);
    const audioData: { [key: number]: string } = JSON.parse(course.audioData);

    console.log(`[Export] 数据: ${slides.length} 页, ${frames.length} 帧, ${Object.keys(audioData).length} 音频`);

    // 检测 slides 格式：base64 图片还是 Markdown
    const isBase64Image = slides.length > 0 && 
      !slides[0].includes('#') && 
      !slides[0].includes('\n') && 
      slides[0].length > 100;
    
    if (!isBase64Image) {
      console.log('[Export] 检测到 Markdown 格式，暂不支持导出');
      return NextResponse.json({ 
        error: '当前课程使用普通模式发布，暂不支持导出视频。请回到课件页面，使用"精美模式"重新发布后再导出。',
        hint: '精美模式会将课件渲染为高清图片，导出效果更佳。'
      }, { status: 400 });
    }

    // 创建临时目录
    tempDir = await createTempDir();
    console.log('[Export] 临时目录:', tempDir);

    // 合并音频（同时获取每段音频的实际时长）
    console.log('[Export] 合并音频...');
    const { mergedPath: mergedAudioPath, audioDurations } = await mergeAudios(audioData, frames, tempDir);
    console.log('[Export] 音频合并完成');

    // 计算每页时长（使用实际音频时长）
    const slideDurations = calculateSlideDurations(frames, slides.length, audioDurations);
    const totalDuration = slideDurations.reduce((a, b) => a + b, 0) / 1000;
    console.log('[Export] 总时长:', `${totalDuration.toFixed(1)}s`);

    // 生成字幕文件
    console.log('[Export] 生成字幕...');
    const subtitlePath = await generateSubtitles(frames, audioDurations, tempDir);

    // 生成视频（包含字幕）
    console.log('[Export] 生成视频...');
    const videoPath = await generateVideo(slides, slideDurations, mergedAudioPath, subtitlePath, tempDir, options);
    console.log('[Export] 视频生成完成');

    // 读取视频文件
    const videoBuffer = await fs.readFile(videoPath);
    
    // 清理临时目录
    await cleanupTempDir(tempDir);
    tempDir = null;

    console.log(`[Export] 导出完成，视频大小: ${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB`);

    // 返回视频文件
    return new NextResponse(videoBuffer, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="${course.title || 'course'}.mp4"`,
        'Content-Length': videoBuffer.length.toString(),
      },
    });

  } catch (error: any) {
    console.error('[Export] 导出失败:', error);
    
    // 清理临时目录
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
    
    return NextResponse.json(
      { error: error.message || '导出失败' },
      { status: 500 }
    );
  }
}

// GET: 获取导出选项配置
export async function GET() {
  return NextResponse.json({
    quality: [
      { value: 'fast', label: '极速', description: '最快导出，适合预览', estimatedTime: '1-2分钟' },
      { value: 'balanced', label: '均衡', description: '速度与质量平衡', estimatedTime: '3-5分钟' },
      { value: 'high', label: '高质量', description: '最佳画质，导出较慢', estimatedTime: '10-15分钟' },
    ],
    resolution: [
      { value: '720p', label: '720p', description: '1280×720，文件较小' },
      { value: '1080p', label: '1080p', description: '1920×1080，高清' },
    ],
  });
}
