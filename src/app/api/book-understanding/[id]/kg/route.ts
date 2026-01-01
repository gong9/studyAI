/**
 * GET /api/book-understanding/[id]/kg
 * 
 * 获取知识图谱数据
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

    // TODO: 从数据库获取已保存的知识图谱
    // 目前结果直接在 process 接口返回

    return NextResponse.json({
      id,
      message: '知识图谱查询功能待实现',
      hint: '请使用 /api/book-understanding/process 接口获取完整结果',
    });

  } catch (error: any) {
    console.error('[API] KG error:', error);
    return NextResponse.json(
      { error: error.message || '查询失败' },
      { status: 500 }
    );
  }
}

