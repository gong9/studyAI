/**
 * 课程分享 API
 * 
 * POST /api/teaching/course/[id]/share - 创建分享链接
 * GET  /api/teaching/course/[id]/share - 获取分享列表
 * DELETE /api/teaching/course/[id]/share?shareId=xxx - 删除/禁用分享
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

// POST: 创建分享
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: courseId } = await params;
    const { password, expiresInDays } = await request.json();

    if (!password || password.length < 4) {
      return NextResponse.json(
        { error: '密码至少4位' },
        { status: 400 }
      );
    }

    // 检查课程是否存在
    const course = await prisma.course.findUnique({
      where: { id: courseId },
    });

    if (!course) {
      return NextResponse.json({ error: '课程不存在' }, { status: 404 });
    }

    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 10);

    // 计算过期时间
    let expiresAt: Date | null = null;
    if (expiresInDays && expiresInDays > 0) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    }

    // 创建分享
    const share = await prisma.courseShare.create({
      data: {
        courseId,
        password: hashedPassword,
        expiresAt,
      },
    });

    // 生成分享链接
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const shareUrl = `${baseUrl}/share/${share.id}`;

    return NextResponse.json({
      id: share.id,
      shareUrl,
      expiresAt: share.expiresAt,
      createdAt: share.createdAt,
    });

  } catch (error: any) {
    console.error('[CourseShare] 创建分享失败:', error);
    return NextResponse.json(
      { error: error.message || '创建失败' },
      { status: 500 }
    );
  }
}

// GET: 获取分享列表
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: courseId } = await params;

    const shares = await prisma.courseShare.findMany({
      where: { courseId },
      orderBy: { createdAt: 'desc' },
    });

    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';

    return NextResponse.json({
      shares: shares.map(share => ({
        id: share.id,
        shareUrl: `${baseUrl}/share/${share.id}`,
        viewCount: share.viewCount,
        isActive: share.isActive,
        expiresAt: share.expiresAt,
        createdAt: share.createdAt,
        // 判断是否已过期
        isExpired: share.expiresAt ? new Date() > share.expiresAt : false,
      })),
    });

  } catch (error: any) {
    console.error('[CourseShare] 获取分享列表失败:', error);
    return NextResponse.json(
      { error: error.message || '获取失败' },
      { status: 500 }
    );
  }
}

// DELETE: 删除或禁用分享
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { searchParams } = new URL(request.url);
    const shareId = searchParams.get('shareId');

    if (!shareId) {
      return NextResponse.json({ error: '缺少 shareId' }, { status: 400 });
    }

    await prisma.courseShare.update({
      where: { id: shareId },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true, message: '分享已禁用' });

  } catch (error: any) {
    console.error('[CourseShare] 禁用分享失败:', error);
    return NextResponse.json(
      { error: error.message || '操作失败' },
      { status: 500 }
    );
  }
}

