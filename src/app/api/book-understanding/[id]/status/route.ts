/**
 * GET /api/book-understanding/[id]/status
 * 
 * 获取全书理解处理状态
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const { id } = await params;

    // TODO: 从数据库或缓存获取处理状态
    // 目前处理是同步的，所以这个端点主要用于未来的异步处理

    return NextResponse.json({
      id,
      status: 'unknown',
      message: '状态查询功能待实现',
    });

  } catch (error: any) {
    console.error('[API] Status error:', error);
    return NextResponse.json(
      { error: error.message || '查询失败' },
      { status: 500 }
    );
  }
}

