/**
 * POST /api/teaching/infographic/prerender
 * 
 * 保存前端渲染的信息图 SVG
 * 
 * 前端渲染信息图后，将 SVG 字符串发送到这里保存到 slides 数据中
 * 这样导出视频时可以直接使用预渲染的 SVG，无需再次渲染
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface SaveRequest {
  manuscriptId: string;
  slideIndex: number;
  renderedSvg: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { manuscriptId, slideIndex, renderedSvg } = body as SaveRequest;
    
    if (!manuscriptId || slideIndex === undefined || !renderedSvg) {
      return NextResponse.json({ 
        error: '缺少必要参数：manuscriptId, slideIndex, renderedSvg' 
      }, { status: 400 });
    }
    
    // 获取手稿
    const manuscript = await prisma.teachingManuscript.findUnique({
      where: { id: manuscriptId },
      select: { htmlSlides: true },
    });
    
    if (!manuscript || !manuscript.htmlSlides) {
      return NextResponse.json({ error: '手稿不存在或没有幻灯片数据' }, { status: 404 });
    }
    
    // 解析 slides
    const slides = JSON.parse(manuscript.htmlSlides);
    
    if (slideIndex < 0 || slideIndex >= slides.length) {
      return NextResponse.json({ error: '无效的幻灯片索引' }, { status: 400 });
    }
    
    // 更新对应 slide 的信息图
    if (slides[slideIndex].infographic) {
      slides[slideIndex].infographic.renderedSvg = renderedSvg;
      
      // 保存到 Manuscript 表
      await prisma.teachingManuscript.update({
        where: { id: manuscriptId },
        data: { htmlSlides: JSON.stringify(slides) },
      });
      
      // 同时更新所有关联的 Course 表
      const courses = await prisma.course.findMany({
        where: { manuscriptId },
        select: { id: true, slides: true },
      });
      
      for (const course of courses) {
        if (course.slides) {
          try {
            const courseSlides = JSON.parse(course.slides);
            if (courseSlides[slideIndex]?.infographic) {
              courseSlides[slideIndex].infographic.renderedSvg = renderedSvg;
              await prisma.course.update({
                where: { id: course.id },
                data: { slides: JSON.stringify(courseSlides) },
              });
              console.log(`[Prerender] Also updated Course ${course.id}`);
            }
          } catch (e) {
            console.error(`[Prerender] Failed to update course ${course.id}:`, e);
          }
        }
      }
      
      console.log(`[Prerender] Saved SVG for slide ${slideIndex} of manuscript ${manuscriptId}`);
      
      return NextResponse.json({
        success: true,
        slideIndex,
        message: '信息图 SVG 已保存',
      });
    }
    
    return NextResponse.json({ 
      error: '该幻灯片没有信息图' 
    }, { status: 400 });
    
  } catch (error: any) {
    console.error('[Prerender] Error:', error);
    return NextResponse.json(
      { error: error.message || '保存失败' },
      { status: 500 }
    );
  }
}

/**
 * 批量保存信息图 SVG
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { manuscriptId, svgData } = body as { 
      manuscriptId: string; 
      svgData: { slideIndex: number; renderedSvg: string }[] 
    };
    
    if (!manuscriptId || !svgData || !Array.isArray(svgData)) {
      return NextResponse.json({ 
        error: '缺少必要参数：manuscriptId, svgData' 
      }, { status: 400 });
    }
    
    // 获取手稿
    const manuscript = await prisma.teachingManuscript.findUnique({
      where: { id: manuscriptId },
      select: { htmlSlides: true },
    });
    
    if (!manuscript || !manuscript.htmlSlides) {
      return NextResponse.json({ error: '手稿不存在或没有幻灯片数据' }, { status: 404 });
    }
    
    // 解析 slides
    const slides = JSON.parse(manuscript.htmlSlides);
    let savedCount = 0;
    
    // 批量更新
    for (const { slideIndex, renderedSvg } of svgData) {
      if (slideIndex >= 0 && slideIndex < slides.length && slides[slideIndex].infographic) {
        slides[slideIndex].infographic.renderedSvg = renderedSvg;
        savedCount++;
      }
    }
    
    // 保存回数据库
    await prisma.teachingManuscript.update({
      where: { id: manuscriptId },
      data: { htmlSlides: JSON.stringify(slides) },
    });
    
    console.log(`[Prerender] Batch saved ${savedCount} SVGs for manuscript ${manuscriptId}`);
    
    return NextResponse.json({
      success: true,
      savedCount,
      totalCount: svgData.length,
      message: `成功保存 ${savedCount} 个信息图`,
    });
    
  } catch (error: any) {
    console.error('[Prerender] Error:', error);
    return NextResponse.json(
      { error: error.message || '批量保存失败' },
      { status: 500 }
    );
  }
}

