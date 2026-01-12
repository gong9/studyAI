/**
 * GET /api/remotion/course/[id]
 * 
 * 为 Remotion Studio 提供课程数据
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const course = await prisma.course.findUnique({
      where: { id },
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
        manuscriptId: true,
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
      console.error('[Remotion API] Failed to parse course data:', e);
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

    return NextResponse.json({
      id: course.id,
      title: course.title,
      description: course.description,
      duration: course.duration,
      manuscriptId: course.manuscriptId,
      slides,
      frames,
      audioData,
      backgroundMusic,
      slideCount: slides.length,
      frameCount: frames.length,
      slideFormat: course.slideFormat,
      // Remotion 需要的配置
      fps: 30,
      width: 1920,
      height: 1080,
      durationInFrames: Math.max(300, Math.ceil((course.duration / 1000) * 30)),
    });

  } catch (error: any) {
    console.error('[Remotion API] Error:', error);
    return NextResponse.json(
      { error: error.message || '服务器错误' },
      { status: 500 }
    );
  }
}

