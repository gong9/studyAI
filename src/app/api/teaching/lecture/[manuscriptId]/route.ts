/**
 * PPT 讲解 API
 * 客户端驱动模式：执行完一条指令后请求下一条
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { 
  generateFullLectureScript,
  parseSlideElements,
  LectureSceneType
} from '@/lib/teaching/lecture/lecture-agent';
import type { SlideInfo, LectureAction } from '@/lib/teaching/lecture/types';

// 根据知识库类型推断讲解场景类型
function getSceneTypeFromKbType(kbType: string): LectureSceneType {
  switch (kbType) {
    case 'tech':
    case 'k12':
    case 'teaching':
      return 'tech_training';
    case 'policy':
      return 'company_training';
    case 'legal':
      return 'legal_training';
    default:
      return 'general';
  }
}

// 内存缓存讲解状态（生产环境应使用 Redis）
// 注意：这个 Map 需要与 stream/route.ts 共享
// 由于 Next.js 的模块隔离，我们在全局定义
const globalForLecture = globalThis as unknown as {
  lectureStates: Map<string, {
    slides: SlideInfo[];
    script: { index: number; actions: LectureAction[] }[];
    currentSlideIndex: number;
    currentActionIndex: number;
    isReady: boolean;
  }>;
};

const lectureStates = globalForLecture.lectureStates || new Map();
if (!globalForLecture.lectureStates) {
  globalForLecture.lectureStates = lectureStates;
}

export { lectureStates };

// 解析幻灯片
function parseSlides(content: string): SlideInfo[] {
  let parts = content.split(/\n---\n/);
  
  // 跳过 frontmatter
  if (parts[0].trim().startsWith('---') || parts[0].includes('theme:')) {
    parts = parts.slice(1);
  }

  return parts
    .map(p => p.trim())
    .filter(p => p.length > 0)
    .map((content, index) => {
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1] : `第 ${index + 1} 页`;
      const elements = parseSlideElements(content, index);
      
      return { 
        index, 
        content, 
        title,
        elements,
      };
    });
}

// GET: 初始化讲解会话，生成完整演讲稿
export async function GET(
  request: NextRequest,
  { params }: { params: { manuscriptId: string } }
) {
  const { manuscriptId } = params;
  const startSlide = parseInt(request.nextUrl.searchParams.get('startSlide') || '0');

  // 获取稿件内容（包含知识库类型用于确定讲解风格）
  const manuscript = await prisma.teachingManuscript.findUnique({
    where: { id: manuscriptId },
    select: {
      id: true,
      slidevMd: true,
      enrichedContent: true,
      confirmedContent: true,
      draftContent: true,
      knowledgeBase: {
        select: { type: true },
      },
    },
  });

  if (!manuscript) {
    return NextResponse.json({ error: '稿件不存在' }, { status: 404 });
  }
  
  // 根据知识库类型确定讲解场景
  const sceneType = manuscript.knowledgeBase 
    ? getSceneTypeFromKbType(manuscript.knowledgeBase.type) 
    : 'general';

  const content = manuscript.slidevMd || 
                  manuscript.enrichedContent || 
                  manuscript.confirmedContent || 
                  manuscript.draftContent;

  if (!content) {
    return NextResponse.json({ error: '没有可讲解的内容' }, { status: 400 });
  }

  const slides = parseSlides(content);
  
  if (slides.length === 0) {
    return NextResponse.json({ error: '没有幻灯片' }, { status: 400 });
  }

  console.log(`[Lecture] 初始化讲解: ${manuscriptId}, ${slides.length} 页`);
  console.log(`[Lecture] 生成完整演讲稿中...`);

  try {
    let scriptResult: { slides: { index: number; actions: LectureAction[] }[] };
    let fromCache = false;
    
    // 尝试从数据库读取已保存的讲解稿
    const existingScript = await prisma.teachingManuscript.findUnique({
      where: { id: manuscriptId },
      select: { lectureScript: true },
    });
    
    if (existingScript?.lectureScript) {
      console.log(`[Lecture] 从数据库加载已有讲解稿: ${manuscriptId}`);
      scriptResult = JSON.parse(existingScript.lectureScript);
      fromCache = true;
    } else {
      // 一次性生成完整演讲稿
      console.log(`[Lecture] 生成新讲解稿中... 场景类型: ${sceneType}`);
      scriptResult = await generateFullLectureScript(slides, undefined, sceneType);
      
      // 保存到数据库
      await prisma.teachingManuscript.update({
        where: { id: manuscriptId },
        data: {
          lectureScript: JSON.stringify(scriptResult),
        },
      });
      console.log(`[Lecture] 讲解稿已保存到数据库`);
    }
    
    // 初始化讲解状态
    lectureStates.set(manuscriptId, {
      slides,
      script: scriptResult.slides,
      currentSlideIndex: startSlide,
      currentActionIndex: 0,
      isReady: true,
    });

    const totalActions = scriptResult.slides.reduce((sum, s) => sum + s.actions.length, 0);
    console.log(`[Lecture] 演讲稿就绪: ${scriptResult.slides.length} 页, ${totalActions} 条指令`);

    return NextResponse.json({
      success: true,
      manuscriptId,
      totalSlides: slides.length,
      totalActions,
      startSlide,
      fromCache, // 是否来自缓存
      message: fromCache ? '已加载保存的讲解稿' : '演讲稿已生成，请调用 POST 获取下一条指令',
    });
    
  } catch (error: any) {
    console.error('[Lecture] 生成演讲稿失败:', error);
    return NextResponse.json(
      { error: '生成演讲稿失败: ' + error.message },
      { status: 500 }
    );
  }
}

// POST: 获取下一条指令（从预生成的演讲稿中）
export async function POST(
  request: NextRequest,
  { params }: { params: { manuscriptId: string } }
) {
  const { manuscriptId } = params;

  try {
    // 获取讲解状态
    const state = lectureStates.get(manuscriptId);
    
    if (!state) {
      return NextResponse.json({ error: '讲解会话不存在，请先调用 GET 初始化' }, { status: 400 });
    }

    if (!state.isReady || !state.script) {
      return NextResponse.json({ error: '演讲稿尚未就绪' }, { status: 400 });
    }

    // 获取当前幻灯片的脚本
    const currentSlideScript = state.script[state.currentSlideIndex];
    
    if (!currentSlideScript) {
      // 所有页都讲完了
      lectureStates.delete(manuscriptId);
      return NextResponse.json({
        action: 'end',
        message: '全部讲解完成',
      });
    }

    // 获取当前幻灯片的当前指令
    const currentAction = currentSlideScript.actions[state.currentActionIndex];
    
    if (!currentAction) {
      // 当前页的指令执行完了，但不应该到这里（next_slide 会处理）
      state.currentSlideIndex++;
      state.currentActionIndex = 0;
      
      if (state.currentSlideIndex >= state.script.length) {
        lectureStates.delete(manuscriptId);
        return NextResponse.json({
          action: 'end',
          message: '全部讲解完成',
        });
      }
      
      return NextResponse.json({
        action: 'next_slide',
        progress: {
          slideIndex: state.currentSlideIndex,
          totalSlides: state.slides.length,
        },
      });
    }

    // 移动到下一条指令
    state.currentActionIndex++;

    // 如果是 next_slide，切换到下一页
    if (currentAction.action === 'next_slide') {
      state.currentSlideIndex++;
      state.currentActionIndex = 0;
      
      // 检查是否还有下一页
      if (state.currentSlideIndex >= state.script.length) {
        lectureStates.delete(manuscriptId);
        return NextResponse.json({
          action: 'end',
          message: '全部讲解完成',
          progress: {
            slideIndex: state.currentSlideIndex,
            totalSlides: state.slides.length,
          },
        });
      }
    }

    // 如果是 end，清理状态
    if (currentAction.action === 'end') {
      lectureStates.delete(manuscriptId);
    }

    // 返回指令
    return NextResponse.json({
      ...currentAction,
      progress: {
        slideIndex: state.currentSlideIndex,
        totalSlides: state.slides.length,
        actionIndex: state.currentActionIndex,
        totalActions: currentSlideScript.actions.length,
      },
    });

  } catch (error: any) {
    console.error('[Lecture POST] Error:', error);
    lectureStates.delete(manuscriptId);
    return NextResponse.json(
      { error: error.message || '获取指令失败' },
      { status: 500 }
    );
  }
}

// DELETE: 停止讲解，清理状态
export async function DELETE(
  request: NextRequest,
  { params }: { params: { manuscriptId: string } }
) {
  const { manuscriptId } = params;
  lectureStates.delete(manuscriptId);
  console.log(`[Lecture] 停止讲解: ${manuscriptId}`);
  return NextResponse.json({ success: true, message: '讲解已停止' });
}

