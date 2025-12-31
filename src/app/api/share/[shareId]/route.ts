/**
 * 公开分享验证 API（无需登录）
 * 
 * GET  /api/share/[shareId] - 获取分享基本信息
 * POST /api/share/[shareId] - 验证密码并获取课程数据
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

// GET: 获取分享基本信息（无需密码）
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ shareId: string }> }
) {
  try {
    const { shareId } = await params;

    const share = await prisma.courseShare.findUnique({
      where: { id: shareId },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            description: true,
            coverImage: true,
            duration: true,
            viewCount: true,
          },
        },
      },
    });

    if (!share) {
      return NextResponse.json({ error: '分享链接不存在' }, { status: 404 });
    }

    // 检查是否有效
    if (!share.isActive) {
      return NextResponse.json({ error: '分享链接已失效' }, { status: 410 });
    }

    // 检查是否过期
    if (share.expiresAt && new Date() > share.expiresAt) {
      return NextResponse.json({ error: '分享链接已过期' }, { status: 410 });
    }

    return NextResponse.json({
      id: share.id,
      course: {
        title: share.course.title,
        description: share.course.description,
        coverImage: share.course.coverImage,
        duration: share.course.duration,
        viewCount: share.course.viewCount,
      },
      requiresPassword: true, // 总是需要密码
      expiresAt: share.expiresAt,
    });

  } catch (error: any) {
    console.error('[ShareVerify] 获取分享信息失败:', error);
    return NextResponse.json(
      { error: error.message || '获取失败' },
      { status: 500 }
    );
  }
}

// POST: 验证密码并获取完整课程数据
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ shareId: string }> }
) {
  try {
    const { shareId } = await params;
    const { password } = await request.json();

    if (!password) {
      return NextResponse.json({ error: '请输入密码' }, { status: 400 });
    }

    const share = await prisma.courseShare.findUnique({
      where: { id: shareId },
      include: {
        course: {
          include: {
            manuscript: {
              include: {
                chapter: true,
              },
            },
          },
        },
      },
    });

    if (!share) {
      return NextResponse.json({ error: '分享链接不存在' }, { status: 404 });
    }

    // 检查是否有效
    if (!share.isActive) {
      return NextResponse.json({ error: '分享链接已失效' }, { status: 410 });
    }

    // 检查是否过期
    if (share.expiresAt && new Date() > share.expiresAt) {
      return NextResponse.json({ error: '分享链接已过期' }, { status: 410 });
    }

    // 验证密码
    const isValid = await bcrypt.compare(password, share.password);
    if (!isValid) {
      return NextResponse.json({ error: '密码错误' }, { status: 401 });
    }

    // 更新访问次数
    await prisma.courseShare.update({
      where: { id: shareId },
      data: { viewCount: { increment: 1 } },
    });

    // 同时更新课程访问次数
    await prisma.course.update({
      where: { id: share.courseId },
      data: { viewCount: { increment: 1 } },
    });

    const course = share.course;

    // 解析 JSON 数据
    const slides = JSON.parse(course.slides);
    const frames = JSON.parse(course.frames);
    const audioData = JSON.parse(course.audioData);

    return NextResponse.json({
      verified: true,
      course: {
        id: course.id,
        title: course.title,
        description: course.description,
        coverImage: course.coverImage,
        duration: course.duration,
        status: course.status,
        viewCount: course.viewCount + 1,
        slideFormat: course.slideFormat || 'image', // 兼容旧数据
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
      },
    });

  } catch (error: any) {
    console.error('[ShareVerify] 验证密码失败:', error);
    return NextResponse.json(
      { error: error.message || '验证失败' },
      { status: 500 }
    );
  }
}

