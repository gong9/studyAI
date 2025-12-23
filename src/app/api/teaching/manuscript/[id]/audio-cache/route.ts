/**
 * 音频缓存 API
 * GET: 获取已缓存的音频
 * POST: 保存预加载的音频
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET: 获取已缓存的音频
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const manuscript = await prisma.teachingManuscript.findUnique({
      where: { id },
      select: { cachedAudio: true },
    });

    if (!manuscript) {
      return NextResponse.json({ error: '手稿不存在' }, { status: 404 });
    }

    // 解析缓存的音频数据
    let audioCache: Record<string, string> = {};
    if (manuscript.cachedAudio) {
      try {
        audioCache = JSON.parse(manuscript.cachedAudio);
      } catch (e) {
        // ignore
      }
    }

    return NextResponse.json({
      audioCache,
      count: Object.keys(audioCache).length,
    });

  } catch (error: any) {
    console.error('[Audio Cache API] 获取失败:', error);
    return NextResponse.json(
      { error: error.message || '获取失败' },
      { status: 500 }
    );
  }
}

// POST: 保存预加载的音频
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { audioMap } = body; // { text: base64Audio, ... }

    if (!audioMap || typeof audioMap !== 'object') {
      return NextResponse.json({ error: '缺少 audioMap 参数' }, { status: 400 });
    }

    // 获取现有缓存
    const manuscript = await prisma.teachingManuscript.findUnique({
      where: { id },
      select: { cachedAudio: true },
    });

    if (!manuscript) {
      return NextResponse.json({ error: '手稿不存在' }, { status: 404 });
    }

    // 解析现有缓存
    let existingCache: Record<string, string> = {};
    if (manuscript.cachedAudio) {
      try {
        existingCache = JSON.parse(manuscript.cachedAudio);
      } catch (e) {
        // ignore
      }
    }

    // 合并新的音频数据（直接用原文作为 key）
    const newCache: Record<string, string> = { ...existingCache };
    let addedCount = 0;

    for (const [text, base64Audio] of Object.entries(audioMap)) {
      if (!newCache[text]) {
        newCache[text] = base64Audio as string;
        addedCount++;
      }
    }

    // 保存到数据库
    await prisma.teachingManuscript.update({
      where: { id },
      data: { cachedAudio: JSON.stringify(newCache) },
    });

    console.log(`[Audio Cache API] 保存 ${addedCount} 条音频，总计 ${Object.keys(newCache).length} 条`);

    return NextResponse.json({
      success: true,
      addedCount,
      totalCount: Object.keys(newCache).length,
    });

  } catch (error: any) {
    console.error('[Audio Cache API] 保存失败:', error);
    return NextResponse.json(
      { error: error.message || '保存失败' },
      { status: 500 }
    );
  }
}

