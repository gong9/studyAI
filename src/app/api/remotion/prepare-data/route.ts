/**
 * POST /api/remotion/prepare-data
 * 
 * 准备课程数据文件，供 Remotion Studio 读取
 * 将课程数据保存到 public/remotion-course-data.json
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import fs from 'fs/promises';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const { courseId } = await request.json();

    if (!courseId) {
      return NextResponse.json(
        { error: '缺少课程 ID' },
        { status: 400 }
      );
    }

    // 获取课程数据
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        title: true,
        description: true,
        duration: true,
        slides: true,
        frames: true,
        audioData: true,
        slideFormat: true,
        backgroundMusic: true,
        language: true,
      },
    });

    if (!course) {
      return NextResponse.json(
        { error: '课程不存在' },
        { status: 404 }
      );
    }

    // 解析 JSON 字段
    let slides = [];
    let frames = [];
    let audioData = {};
    let backgroundMusic = null;

    try {
      slides = course.slides ? JSON.parse(course.slides) : [];
      frames = course.frames ? JSON.parse(course.frames) : [];
      audioData = course.audioData ? JSON.parse(course.audioData) : {};
      backgroundMusic = course.backgroundMusic ? JSON.parse(course.backgroundMusic) : null;
    } catch (e) {
      console.error('[Prepare Data] Failed to parse course data:', e);
    }

    // 修复 100vh 问题
    if (Array.isArray(slides)) {
      slides = slides.map((slide: any) => {
        if (typeof slide === 'object' && slide.html) {
          return {
            ...slide,
            html: slide.html
              .replace(/100vh/g, '100%')
              .replace(/height:\s*100vh/gi, 'height: 100%')
              .replace(/min-height:\s*100vh/gi, 'min-height: 100%'),
          };
        }
        return slide;
      });
    }

    // 处理背景音乐 - 转换为 base64（和 TTS 一样）
    let backgroundMusicForRemotion = null;
    if (backgroundMusic && backgroundMusic.enabled) {
      let musicSrc = backgroundMusic.src;
      
      if (!musicSrc && backgroundMusic.trackId) {
        musicSrc = `/audio/bgm/${backgroundMusic.trackId}.mp3`;
      }
      
      if (musicSrc) {
        try {
          // 从 public 目录读取音频文件并转换为 base64
          const publicDir = path.join(process.cwd(), 'public');
          const musicFilePath = path.join(publicDir, musicSrc);
          
          const musicBuffer = await fs.readFile(musicFilePath);
          const base64Music = musicBuffer.toString('base64');
          
          backgroundMusicForRemotion = {
            src: `data:audio/mp3;base64,${base64Music}`,
            volume: backgroundMusic.volume || 0.2,
            enabled: true,
          };
          console.log('[Prepare Data] Background music converted to base64, size:', Math.round(musicBuffer.length / 1024), 'KB');
        } catch (e) {
          console.error('[Prepare Data] Failed to read background music file:', e);
          // 回退到原始路径
          backgroundMusicForRemotion = {
            src: musicSrc,
            volume: backgroundMusic.volume || 0.2,
            enabled: true,
          };
        }
      }
    }

    // 构建完整数据
    const courseData = {
      id: course.id,
      title: course.title,
      description: course.description,
      duration: course.duration,
      language: course.language || 'zh',  // 添加语言字段
      slides,
      frames,
      audioData,
      backgroundMusic: backgroundMusicForRemotion,
      slideCount: slides.length,
      frameCount: frames.length,
      slideFormat: course.slideFormat,
      fps: 30,
      width: 1920,
      height: 1080,
      durationInFrames: Math.max(300, Math.ceil((course.duration / 1000) * 30)),
    };

    // 保存到 public 目录
    const publicDir = path.join(process.cwd(), 'public');
    const dataFilePath = path.join(publicDir, 'remotion-course-data.json');
    
    await fs.writeFile(dataFilePath, JSON.stringify(courseData, null, 2), 'utf-8');

    console.log(`[Prepare Data] 课程数据已保存: ${dataFilePath}`);
    console.log(`[Prepare Data] 幻灯片: ${slides.length} 页, 时长: ${course.duration}ms`);

    return NextResponse.json({
      success: true,
      courseId: course.id,
      slideCount: slides.length,
      duration: course.duration,
    });

  } catch (error: any) {
    console.error('[Prepare Data] Error:', error);
    return NextResponse.json(
      { error: error.message || '服务器错误' },
      { status: 500 }
    );
  }
}

