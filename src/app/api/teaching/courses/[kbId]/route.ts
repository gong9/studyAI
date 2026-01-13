import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: Request,
  { params }: { params: { kbId: string } }
) {
  try {
    const { kbId } = params;

    // 通过手稿关联查询课程
    const courses = await prisma.course.findMany({
      where: {
        manuscript: {
          knowledgeBaseId: kbId,
        },
      },
      select: {
        id: true,
        title: true,
        duration: true,
        language: true,
        createdAt: true,
        manuscript: {
          select: {
            id: true,
            chapter: {
              select: {
                title: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({
      courses: courses.map((c) => ({
        id: c.id,
        title: c.title,
        duration: c.duration,
        language: c.language,
        manuscriptId: c.manuscript.id,
        chapterTitle: c.manuscript.chapter?.title || c.title,
        createdAt: c.createdAt,
      })),
    });
  } catch (error) {
    console.error('获取课程列表失败:', error);
    return NextResponse.json(
      { error: '获取课程列表失败' },
      { status: 500 }
    );
  }
}

