/**
 * 课程 API
 * 
 * PATCH /api/teaching/course/[id]
 * 更新课程配置（如背景音乐）
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // 验证课程存在
    const course = await prisma.course.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!course) {
      return NextResponse.json(
        { error: '课程不存在' },
        { status: 404 }
      );
    }

    // 构建更新数据
    const updateData: Record<string, any> = {};

    // 更新背景音乐配置
    if (body.backgroundMusic !== undefined) {
      updateData.backgroundMusic = body.backgroundMusic 
        ? JSON.stringify(body.backgroundMusic)
        : null;
      
    }

    // 执行更新
    if (Object.keys(updateData).length > 0) {
    await prisma.course.update({
        where: { id },
        data: updateData,
    });
    }

    return NextResponse.json({
      success: true,
      courseId: id,
    });

  } catch (error: any) {
    console.error('[Course API] Error:', error);
    return NextResponse.json(
      { error: error.message || '服务器错误' },
      { status: 500 }
    );
  }
}

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
        slideFormat: true,
        backgroundMusic: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!course) {
      return NextResponse.json(
        { error: '课程不存在' },
        { status: 404 }
      );
    }

    // 解析背景音乐
    let backgroundMusic = null;
    if (course.backgroundMusic) {
      try {
        backgroundMusic = JSON.parse(course.backgroundMusic);
      } catch (e) {
        console.error('[Course API] Failed to parse backgroundMusic:', e);
      }
    }

    return NextResponse.json({
      ...course,
      backgroundMusic,
    });

  } catch (error: any) {
    console.error('[Course API] Error:', error);
    return NextResponse.json(
      { error: error.message || '服务器错误' },
      { status: 500 }
    );
  }
}
