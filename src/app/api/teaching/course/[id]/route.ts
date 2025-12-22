/**
 * GET /api/teaching/course/[id]
 * 
 * 获取课程详情，用于播放器加载
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: courseId } = await params;

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: {
        manuscript: {
          include: {
            chapter: true,
          },
        },
      },
    });

    if (!course) {
      return NextResponse.json({ error: '课程不存在' }, { status: 404 });
    }

    // 更新观看次数
    await prisma.course.update({
      where: { id: courseId },
      data: { viewCount: { increment: 1 } },
    });

    // 解析 JSON 数据
    const slides = JSON.parse(course.slides);
    const frames = JSON.parse(course.frames);
    const audioData = JSON.parse(course.audioData);

    return NextResponse.json({
      id: course.id,
      title: course.title,
      description: course.description,
      coverImage: course.coverImage,
      duration: course.duration,
      status: course.status,
      viewCount: course.viewCount + 1,
      chapter: {
        id: course.manuscript.chapter.id,
        title: course.manuscript.chapter.title,
      },
      // 课程内容
      slides,
      frames,
      audioData,
      // 统计
      slideCount: slides.length,
      frameCount: frames.length,
      audioCount: Object.keys(audioData).length,
      createdAt: course.createdAt,
    });

  } catch (error: any) {
    console.error('[Course] 获取课程失败:', error);
    return NextResponse.json(
      { error: error.message || '获取失败' },
      { status: 500 }
    );
  }
}

// DELETE: 删除课程
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: courseId } = await params;

    await prisma.course.delete({
      where: { id: courseId },
    });

    return NextResponse.json({ success: true, message: '课程已删除' });

  } catch (error: any) {
    console.error('[Course] 删除课程失败:', error);
    return NextResponse.json(
      { error: error.message || '删除失败' },
      { status: 500 }
    );
  }
}

