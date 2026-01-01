/**
 * POST /api/book-understanding/[id]/manuscript
 * 
 * 基于已有的知识图谱生成讲稿
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    // TODO: 从数据库获取知识图谱，重新生成讲稿
    // 目前讲稿直接在 process 接口生成

    return NextResponse.json({
      id,
      message: '讲稿生成功能待实现',
      hint: '请使用 /api/book-understanding/process 接口获取完整结果',
    });

  } catch (error: any) {
    console.error('[API] Manuscript error:', error);
    return NextResponse.json(
      { error: error.message || '生成失败' },
      { status: 500 }
    );
  }
}

