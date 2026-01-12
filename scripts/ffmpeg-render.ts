#!/usr/bin/env npx ts-node
/**
 * FFmpeg 精确同步视频渲染脚本
 * 
 * 核心原则：以实际音频时长为唯一时间源，确保100%同步
 * 
 * 1. 先保存所有音频文件，获取每个音频的【实际时长】
 * 2. 基于实际时长重新计算所有时间点
 * 3. 视频、字幕都使用相同的时间数据
 * 4. 最后合并时音视频时长完全一致
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import puppeteer from 'puppeteer-core';
import ffmpegPath from 'ffmpeg-static';

const FFMPEG = ffmpegPath || 'ffmpeg';

const CHROME_PATHS: Record<string, string> = {
  darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  linux: '/usr/bin/google-chrome',
  win32: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
};

function getChromePath(): string {
  return CHROME_PATHS[process.platform] || CHROME_PATHS.darwin;
}

// 配置
const DATA_FILE = 'public/remotion-course-data.json';
const OUTPUT_DIR = 'out/ffmpeg-render';
const OUTPUT_VIDEO = 'out/course-ffmpeg.mp4';
const SLIDE_WIDTH = 1920;
const SLIDE_HEIGHT = 1080;
const SPEED: number = 1.3;
const FPS = 30;

interface Frame {
  slideIndex: number;
  action: string;
  text?: string;
  audioIndex?: number;
  audioDuration?: number;
  timestamp: number;
}

interface InfographicData {
  syntax: string;
  position: 'right' | 'bottom' | 'inline' | 'none';
  size: 'small' | 'medium' | 'large' | 'auto';
  renderedSvg?: string; // 预渲染的 SVG 字符串
}

interface SlideData {
  index: number;
  title: string;
  html: string;
  infographic?: InfographicData;
}

interface CourseData {
  slides: SlideData[];
  frames: Frame[];
  audioData?: { [key: string]: string };
  language?: string;  // 'zh' | 'en' - 课程语言
}

// 精确计算后的时间数据
interface TimingData {
  slideIndex: number;
  startTimeMs: number;      // 这张幻灯片开始时间（毫秒）
  durationMs: number;       // 这张幻灯片持续时间（毫秒）
  subtitles: Array<{
    text: string;
    startTimeMs: number;    // 字幕开始时间
    endTimeMs: number;      // 字幕结束时间
  }>;
}

async function main() {
  console.log('🎬 FFmpeg 精确同步渲染开始...\n');

  // 1. 读取数据
  if (!fs.existsSync(DATA_FILE)) {
    console.error('❌ 找不到数据文件');
    process.exit(1);
  }
  const data: CourseData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  
  // 设置课程语言（用于字幕样式调整）
  courseLanguage = data.language || 'zh';
  console.log(`📖 加载了 ${data.slides.length} 个幻灯片, ${data.frames.length} 个帧, 语言: ${courseLanguage}`);

  // 2. 准备目录
  if (fs.existsSync(OUTPUT_DIR)) fs.rmSync(OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(path.join(OUTPUT_DIR, 'slides'), { recursive: true });
  fs.mkdirSync(path.join(OUTPUT_DIR, 'audio'), { recursive: true });

  // 3. 【关键步骤】保存音频并获取实际时长，重新计算所有时间点
  console.log('\n🔊 分析音频并计算精确时间...');
  const { timingData, totalDurationMs, audioSegments } = await analyzeAndCalculateTiming(data);
  
  console.log(`   📊 总时长: ${(totalDurationMs / 1000).toFixed(2)}s`);
  console.log(`   📊 幻灯片数: ${timingData.length}`);
  timingData.forEach((t, i) => {
    console.log(`   ${i + 1}: ${(t.startTimeMs / 1000).toFixed(2)}s - ${((t.startTimeMs + t.durationMs) / 1000).toFixed(2)}s (${(t.durationMs / 1000).toFixed(2)}s) [${t.subtitles.length}条字幕]`);
  });

  // 4. 截图幻灯片
  console.log('\n📸 截图幻灯片...');
  await captureSlides(data.slides);

  // 5. 生成完整音频（基于精确时间）
  console.log('\n🔊 合成完整音频...');
  const audioPath = await generateFullAudio(audioSegments, totalDurationMs);

  // 6. 生成视频（基于精确时间）
  console.log('\n🎞️  生成视频...');
  const videoPath = path.join(OUTPUT_DIR, 'video_only.mp4');
  generateVideo(timingData, totalDurationMs, videoPath);

  // 7. 生成字幕（基于精确时间）
  console.log('\n📝 生成字幕...');
  const assPath = generateSubtitles(timingData);

  // 8. 合并：视频 + 音频 + 字幕（全部使用相同时间源，保证同步）
  console.log('\n🔗 合并视频音频字幕...');
  const mergedPath = path.join(OUTPUT_DIR, 'merged.mp4');
  
  if (audioPath && assPath) {
    const escaped = assPath.replace(/:/g, '\\:').replace(/'/g, "'\\''");
    execSync(
      `"${FFMPEG}" -y -i "${videoPath}" -i "${audioPath}" ` +
      `-filter_complex "[0:v]ass='${escaped}'[v]" ` +
      `-map "[v]" -map 1:a ` +
      `-c:v libx264 -c:a aac -b:a 192k "${mergedPath}" 2>/dev/null`
    );
  } else if (audioPath) {
    execSync(`"${FFMPEG}" -y -i "${videoPath}" -i "${audioPath}" -c:v copy -c:a aac "${mergedPath}" 2>/dev/null`);
  } else if (assPath) {
    const escaped = assPath.replace(/:/g, '\\:').replace(/'/g, "'\\''");
    execSync(`"${FFMPEG}" -y -i "${videoPath}" -vf "ass='${escaped}'" "${mergedPath}" 2>/dev/null`);
  } else {
    fs.copyFileSync(videoPath, mergedPath);
  }

  // 9. 应用倍速
  console.log('\n⚡ 应用倍速...');
  fs.mkdirSync(path.dirname(OUTPUT_VIDEO), { recursive: true });
  
  if (SPEED !== 1.0) {
    execSync(
      `"${FFMPEG}" -y -i "${mergedPath}" ` +
      `-vf "setpts=PTS/${SPEED}" -af "atempo=${SPEED}" ` +
      `-c:v libx264 -c:a aac "${OUTPUT_VIDEO}" 2>/dev/null`
    );
  } else {
    fs.copyFileSync(mergedPath, OUTPUT_VIDEO);
  }

  // 验证最终视频
  const finalDuration = getMediaDuration(OUTPUT_VIDEO);
  console.log(`\n✅ 完成！${OUTPUT_VIDEO}`);
  console.log(`   预期时长: ${(totalDurationMs / 1000 / SPEED).toFixed(2)}s`);
  console.log(`   实际时长: ${finalDuration.toFixed(2)}s`);
}

/**
 * 获取媒体文件的精确时长（秒）
 */
function getMediaDuration(filePath: string): number {
  try {
    const result = execSync(
      `"${FFMPEG}" -i "${filePath}" 2>&1 | grep Duration | awk '{print $2}' | tr -d ,`,
      { encoding: 'utf-8' }
    ).trim();
    if (!result) return 0;
    const parts = result.split(':');
    const hours = parseFloat(parts[0]) || 0;
    const minutes = parseFloat(parts[1]) || 0;
    const seconds = parseFloat(parts[2]) || 0;
    return hours * 3600 + minutes * 60 + seconds;
  } catch {
    return 0;
  }
}

/**
 * 【核心函数】分析音频并计算精确时间
 * 以实际音频时长为准，重新计算所有时间点
 */
async function analyzeAndCalculateTiming(data: CourseData): Promise<{
  timingData: TimingData[];
  totalDurationMs: number;
  audioSegments: Array<{ path: string; startTimeMs: number; durationMs: number }>;
}> {
  const audioSegments: Array<{ path: string; startTimeMs: number; durationMs: number }> = [];
  
  // 按 slideIndex 分组的帧
  const framesBySlide: Map<number, Frame[]> = new Map();
  for (const frame of data.frames) {
    if (!framesBySlide.has(frame.slideIndex)) {
      framesBySlide.set(frame.slideIndex, []);
    }
    framesBySlide.get(frame.slideIndex)!.push(frame);
  }

  // 保存所有音频并获取实际时长
  const audioActualDurations: Map<number, number> = new Map();
  
  if (data.audioData) {
    for (const frame of data.frames) {
      if (frame.action === 'speak' && frame.audioIndex !== undefined && data.audioData[frame.audioIndex]) {
        const audioPath = path.join(OUTPUT_DIR, 'audio', `${frame.audioIndex}.mp3`);
        const base64 = data.audioData[frame.audioIndex].replace(/^data:audio\/\w+;base64,/, '');
        fs.writeFileSync(audioPath, Buffer.from(base64, 'base64'));
        
        // 获取实际时长
        const actualDurationSec = getMediaDuration(audioPath);
        const actualDurationMs = Math.round(actualDurationSec * 1000);
        audioActualDurations.set(frame.audioIndex, actualDurationMs);
        
        console.log(`   音频 ${frame.audioIndex}: 预计 ${frame.audioDuration}ms, 实际 ${actualDurationMs}ms`);
      }
    }
  }

  // 基于实际音频时长重新计算时间线
  // 关键：currentTime 是累积时间，每个 frame 的开始时间 = 上一个 frame 的结束时间
  let currentTime = 0;
  const recalculatedFrames: Array<{ frame: Frame; startTimeMs: number; endTimeMs: number }> = [];

  for (const frame of data.frames) {
    const startTimeMs = currentTime;
    let durationMs = 0;

    if (frame.action === 'speak' && frame.audioIndex !== undefined) {
      // 使用实际音频时长
      durationMs = audioActualDurations.get(frame.audioIndex) || frame.audioDuration || 3000;
    } else if (frame.action === 'show' || frame.action === 'pause') {
      // show 和 pause 使用原始 audioDuration 或默认值
      durationMs = frame.audioDuration || 500;
    }

    recalculatedFrames.push({
      frame,
      startTimeMs,
      endTimeMs: startTimeMs + durationMs,
    });

    currentTime = startTimeMs + durationMs;
  }

  const totalDurationMs = currentTime;

  // 构建 timingData（按幻灯片分组）
  const timingData: TimingData[] = [];
  
  for (let slideIndex = 0; slideIndex < data.slides.length; slideIndex++) {
    const slideFrames = recalculatedFrames.filter(rf => rf.frame.slideIndex === slideIndex);
    
    if (slideFrames.length === 0) {
      // 没有对应帧的幻灯片，给一个默认时长
      const prevEnd = timingData.length > 0 
        ? timingData[timingData.length - 1].startTimeMs + timingData[timingData.length - 1].durationMs 
        : 0;
      timingData.push({
        slideIndex,
        startTimeMs: prevEnd,
        durationMs: 2000,
        subtitles: [],
      });
      continue;
    }

    const slideStartTime = slideFrames[0].startTimeMs;
    const slideEndTime = slideFrames[slideFrames.length - 1].endTimeMs;
    
    const subtitles: TimingData['subtitles'] = [];
    for (const rf of slideFrames) {
      if (rf.frame.action === 'speak' && rf.frame.text) {
        subtitles.push({
          text: rf.frame.text,
          startTimeMs: rf.startTimeMs,
          endTimeMs: rf.endTimeMs,
        });
      }
    }

    // 收集音频段
    for (const rf of slideFrames) {
      if (rf.frame.action === 'speak' && rf.frame.audioIndex !== undefined) {
        const audioPath = path.join(OUTPUT_DIR, 'audio', `${rf.frame.audioIndex}.mp3`);
        if (fs.existsSync(audioPath)) {
          audioSegments.push({
            path: audioPath,
            startTimeMs: rf.startTimeMs,
            durationMs: rf.endTimeMs - rf.startTimeMs,
          });
        }
      }
    }

    timingData.push({
      slideIndex,
      startTimeMs: slideStartTime,
      durationMs: slideEndTime - slideStartTime,
      subtitles,
    });
  }

  return { timingData, totalDurationMs, audioSegments };
}

// 根据信息图尺寸和位置计算布局比例
function getLayoutRatios(size: string, position: string) {
  if (position === 'right') {
    switch (size) {
      case 'small': return { content: '70%', infographic: '30%' };
      case 'large': return { content: '60%', infographic: '40%' };
      default: return { content: '65%', infographic: '35%' };
    }
  } else {
    switch (size) {
      case 'small': return { content: '65%', infographic: '35%' };
      case 'large': return { content: '50%', infographic: '50%' };
      default: return { content: '55%', infographic: '45%' };
    }
  }
}

// 生成幻灯片 HTML（支持预渲染的信息图 SVG）
function generateSlideHtml(slide: SlideData): string {
  const hasRenderedSvg = slide.infographic?.renderedSvg;
  
  if (!hasRenderedSvg) {
    // 没有预渲染的信息图，只渲染主内容
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      *{margin:0;padding:0;box-sizing:border-box}
      html,body{width:${SLIDE_WIDTH}px;height:${SLIDE_HEIGHT}px;overflow:hidden}
      *,*::before,*::after{animation:none!important;transition:none!important}
    </style></head><body>${slide.html}</body></html>`;
  }

  // 有预渲染的 SVG，生成包含信息图的布局
  const infographic = slide.infographic!;
  const position = infographic.position || 'bottom';
  const size = infographic.size || 'medium';
  const ratios = getLayoutRatios(size, position);

  if (position === 'right') {
    // 左右布局
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      *{margin:0;padding:0;box-sizing:border-box}
      html,body{width:${SLIDE_WIDTH}px;height:${SLIDE_HEIGHT}px;overflow:hidden}
      *,*::before,*::after{animation:none!important;transition:none!important}
      .container{display:flex;width:100%;height:100%}
      .slide-content{width:${ratios.content};height:100%;overflow:hidden}
      .infographic-area{width:${ratios.infographic};height:100%;padding:16px;background:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden}
      .infographic-area svg{width:100%;height:100%;max-width:100%;max-height:100%}
    </style></head><body>
    <div class="container">
      <div class="slide-content">${slide.html}</div>
      <div class="infographic-area">${infographic.renderedSvg}</div>
    </div>
    </body></html>`;
  } else {
    // 上下布局（bottom 或其他）
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      *{margin:0;padding:0;box-sizing:border-box}
      html,body{width:${SLIDE_WIDTH}px;height:${SLIDE_HEIGHT}px;overflow:hidden}
      *,*::before,*::after{animation:none!important;transition:none!important}
      .container{display:flex;flex-direction:column;width:100%;height:100%}
      .slide-content{width:100%;height:${ratios.content};overflow:hidden}
      .infographic-area{width:100%;height:${ratios.infographic};padding:16px;background:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden}
      .infographic-area svg{width:100%;height:100%;max-width:100%;max-height:100%}
    </style></head><body>
    <div class="container">
      <div class="slide-content">${slide.html}</div>
      <div class="infographic-area">${infographic.renderedSvg}</div>
    </div>
    </body></html>`;
  }
}

async function captureSlides(slides: CourseData['slides']) {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: getChromePath(),
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: SLIDE_WIDTH, height: SLIDE_HEIGHT });

  for (const slide of slides) {
    const outPath = path.join(OUTPUT_DIR, 'slides', `${slide.index.toString().padStart(3, '0')}.png`);
    const html = generateSlideHtml(slide);
    const hasInfoSvg = !!slide.infographic?.renderedSvg;
    
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await new Promise(r => setTimeout(r, 100));
    await page.screenshot({ path: outPath, type: 'png' });
    console.log(`   ✅ ${slide.index + 1}/${slides.length}${hasInfoSvg ? ' (含信息图)' : ''}`);
  }
  await browser.close();
}

/**
 * 生成完整音频轨道
 */
async function generateFullAudio(
  audioSegments: Array<{ path: string; startTimeMs: number; durationMs: number }>,
  totalDurationMs: number
): Promise<string | null> {
  if (audioSegments.length === 0) {
    console.log('   ⚠️ 无音频数据');
    return null;
  }

  // 按开始时间排序
  audioSegments.sort((a, b) => a.startTimeMs - b.startTimeMs);

  const outputPath = path.join(OUTPUT_DIR, 'audio', 'full_audio.mp3');
  const totalDurationSec = totalDurationMs / 1000;

  // 生成静音底轨
  const silentPath = path.join(OUTPUT_DIR, 'audio', 'silent_base.mp3');
  execSync(`"${FFMPEG}" -y -f lavfi -i anullsrc=r=44100:cl=stereo -t ${totalDurationSec} -c:a libmp3lame -q:a 2 "${silentPath}" 2>/dev/null`);

  // 使用 adelay 精确定位每个音频（基于重新计算的时间）
  const inputs = audioSegments.map(seg => `-i "${seg.path}"`).join(' ');
  const filters: string[] = [];
  const mixInputs: string[] = ['[0]'];
  
  for (let i = 0; i < audioSegments.length; i++) {
    const delayMs = audioSegments[i].startTimeMs;
    filters.push(`[${i + 1}]adelay=${delayMs}|${delayMs}[a${i}]`);
    mixInputs.push(`[a${i}]`);
  }
  
  // normalize=0 禁用音量归一化，保持原始音量
  filters.push(`${mixInputs.join('')}amix=inputs=${mixInputs.length}:duration=first:dropout_transition=0:normalize=0`);
  const filterComplex = filters.join(';');
  
  execSync(
    `"${FFMPEG}" -y -i "${silentPath}" ${inputs} -filter_complex "${filterComplex}" -c:a libmp3lame -q:a 2 "${outputPath}" 2>/dev/null`
  );

  const actualDuration = getMediaDuration(outputPath);
  console.log(`   ✅ 合成 ${audioSegments.length} 个音频片段`);
  console.log(`   📊 预期时长: ${totalDurationSec.toFixed(2)}s, 实际时长: ${actualDuration.toFixed(2)}s`);
  
  return outputPath;
}

/**
 * 生成视频轨道（使用精确时间）
 */
function generateVideo(timingData: TimingData[], totalDurationMs: number, outputPath: string) {
  const concatFile = path.join(OUTPUT_DIR, 'slides.txt');
  let content = '';
  
  for (const timing of timingData) {
    const imgPath = path.join(OUTPUT_DIR, 'slides', `${timing.slideIndex.toString().padStart(3, '0')}.png`);
    const durationSec = timing.durationMs / 1000;
    content += `file '${path.resolve(imgPath)}'\n`;
    content += `duration ${durationSec}\n`;
  }
  
  // 最后一帧需要重复（FFmpeg concat demuxer 的要求）
  const lastSlideIndex = timingData[timingData.length - 1].slideIndex;
  const lastImg = path.join(OUTPUT_DIR, 'slides', `${lastSlideIndex.toString().padStart(3, '0')}.png`);
  content += `file '${path.resolve(lastImg)}'\n`;
  
  fs.writeFileSync(concatFile, content);

  execSync(
    `"${FFMPEG}" -y -f concat -safe 0 -i "${concatFile}" ` +
    `-c:v libx264 -pix_fmt yuv420p -r ${FPS} "${outputPath}" 2>/dev/null`
  );

  const actualDuration = getMediaDuration(outputPath);
  console.log(`   ✅ 视频轨道生成完成`);
  console.log(`   📊 预期时长: ${(totalDurationMs / 1000).toFixed(2)}s, 实际时长: ${actualDuration.toFixed(2)}s`);
}

/**
 * 字幕自动换行：每行最多 maxChars 个字符，直接按字符数切分
 */
// 全局语言变量，在 main 中设置
let courseLanguage: string = 'zh';

function wrapSubtitleText(text: string): string {
  // 英文需要更长的行长度，因为英文单词比中文字符宽
  const maxChars = courseLanguage === 'en' ? 100 : 80;
  
  if (text.length <= maxChars) return text;
  
  // 英文按单词边界换行，中文按字符换行
  if (courseLanguage === 'en') {
    return wrapEnglishText(text, maxChars);
  }
  
  const lines: string[] = [];
  for (let i = 0; i < text.length; i += maxChars) {
    lines.push(text.slice(i, i + maxChars));
  }
  
  // 用 \N 连接（ASS 格式换行符）
  return lines.join('\\N');
}

// 英文按单词边界换行
function wrapEnglishText(text: string, maxChars: number): string {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  
  for (const word of words) {
    if (currentLine.length + word.length + 1 <= maxChars) {
      currentLine = currentLine ? `${currentLine} ${word}` : word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  
  return lines.join('\\N');
}

/**
 * 生成字幕（使用精确时间）
 */
function generateSubtitles(timingData: TimingData[]): string | null {
  const allSubtitles: Array<{ text: string; startTimeMs: number; endTimeMs: number }> = [];
  
  for (const timing of timingData) {
    allSubtitles.push(...timing.subtitles);
  }
  
  if (allSubtitles.length === 0) return null;

  const assPath = path.join(OUTPUT_DIR, 'subtitles.ass');
  
  // 根据语言调整字幕样式
  // 英文需要更小的边距（更宽的字幕区域），更大的字号
  const isEnglish = courseLanguage === 'en';
  const fontName = isEnglish ? 'Arial' : 'PingFang SC';
  const fontSize = isEnglish ? 26 : 28;
  const marginLR = isEnglish ? 100 : 300;  // 英文边距更小，给更多空间
  const marginV = 50;

  const header = `[Script Info]
Title: Subtitles
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},&H00FFFFFF,&H000000FF,&H00000000,&HC0000000,-1,0,0,0,100,100,0,0,3,4,2,2,${marginLR},${marginLR},${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  let dialogues = '';
  for (const sub of allSubtitles) {
    // 自动换行处理
    const wrappedText = wrapSubtitleText(sub.text);
    dialogues += `Dialogue: 0,${formatAssTime(sub.startTimeMs)},${formatAssTime(sub.endTimeMs)},Default,,0,0,0,,${wrappedText}\n`;
  }

  fs.writeFileSync(assPath, header + dialogues);
  console.log(`   ✅ 生成 ${allSubtitles.length} 条字幕`);
  return assPath;
}

function formatAssTime(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
}

main().catch(console.error);
