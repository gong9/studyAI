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

// 设置 ffmpeg 路径 - 在 Next.js 中直接使用 node_modules 下的路径
const ffmpegPath = path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg');
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

// 计算每页 PPT 的显示时长
function calculateSlideDurations(frames: CourseFrame[], slideCount: number): number[] {
  const durations: number[] = new Array(slideCount).fill(0);
  
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    
    if (frame.action === 'speak' && frame.audioDuration) {
      durations[frame.slideIndex] += frame.audioDuration;
    } else if (frame.action === 'next_slide') {
      // 翻页动画时间
      durations[frame.slideIndex] += 500;
    }
  }
  
  // 确保每页至少 1 秒
  return durations.map(d => Math.max(d, 1000));
}

// 合并所有音频
async function mergeAudios(
  audioData: { [key: number]: string },
  frames: CourseFrame[],
  tempDir: string
): Promise<string> {
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

  return mergedAudioPath;
}

// 生成视频
async function generateVideo(
  slides: string[],
  slideDurations: number[],
  mergedAudioPath: string,
  tempDir: string,
  options: ExportOptions
): Promise<string> {
  const preset = PRESET_CONFIG[options.quality];
  const resolution = RESOLUTION_CONFIG[options.resolution];
  
  console.log(`[Export] 使用预设: ${options.quality} (${preset.preset}), 分辨率: ${options.resolution}`);

  // 写入所有图片
  const imageFiles: string[] = [];
  for (let i = 0; i < slides.length; i++) {
    const imagePath = path.join(tempDir, `slide_${i}.png`);
    await writeBase64ToFile(slides[i], imagePath);
    imageFiles.push(imagePath);
  }

  // 创建视频片段并拼接
  const videoListPath = path.join(tempDir, 'video_list.txt');
  const videoParts: string[] = [];

  for (let i = 0; i < slides.length; i++) {
    const partPath = path.join(tempDir, `part_${i}.mp4`);
    const duration = slideDurations[i] / 1000; // 转为秒

    console.log(`[Export] 生成视频片段 ${i + 1}/${slides.length} (${duration.toFixed(1)}s)...`);

    // 为每张图片生成对应时长的视频
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(imageFiles[i])
        .inputOptions(['-loop', '1'])
        .outputOptions([
          '-c:v', 'libx264',
          '-preset', preset.preset,
          '-crf', preset.crf,
          '-t', duration.toString(),
          '-pix_fmt', 'yuv420p',
          '-vf', `scale=${resolution.width}:${resolution.height}:force_original_aspect_ratio=decrease,pad=${resolution.width}:${resolution.height}:(ow-iw)/2:(oh-ih)/2`,
          '-r', preset.fps,
        ])
        .output(partPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });

    videoParts.push(partPath);
  }

  // 创建拼接列表
  const listContent = videoParts.map(f => `file '${f}'`).join('\n');
  await fs.writeFile(videoListPath, listContent);

  // 拼接所有视频片段
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

  // 合并视频和音频
  console.log('[Export] 合并视频和音频...');
  const finalVideoPath = path.join(tempDir, 'final.mp4');
  await new Promise<void>((resolve, reject) => {
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
      .on('error', (err) => reject(err))
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

    // 创建临时目录
    tempDir = await createTempDir();
    console.log('[Export] 临时目录:', tempDir);

    // 计算每页时长
    const slideDurations = calculateSlideDurations(frames, slides.length);
    const totalDuration = slideDurations.reduce((a, b) => a + b, 0) / 1000;
    console.log('[Export] 总时长:', `${totalDuration.toFixed(1)}s`);

    // 合并音频
    console.log('[Export] 合并音频...');
    const mergedAudioPath = await mergeAudios(audioData, frames, tempDir);
    console.log('[Export] 音频合并完成');

    // 生成视频
    console.log('[Export] 生成视频...');
    const videoPath = await generateVideo(slides, slideDurations, mergedAudioPath, tempDir, options);
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
