/**
 * 学生问题理解 API
 * 直接从数据库读取手稿内容来回答学生问题
 */

import { NextRequest, NextResponse } from 'next/server';
//@ts-ignore
import OpenAI from 'openai';
import { lightragClient } from '@/lib/lightrag-client';
import { prisma } from '@/lib/prisma';

const client = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
});

// 解析手稿内容为 slides
function parseManuscriptToSlides(content: string): { title: string; content: string }[] {
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
      return { content, title };
    });
}

// 根据知识库类型生成角色提示词
function generateRolePrompt(
  knowledgeBaseType: string,
  chapterMetadata: { grade?: string; subject?: string } | null
): string {
  if (knowledgeBaseType === 'tech') {
    return `你是一位经验丰富的技术培训讲师，学员提出了一个问题。用专业但友好的语气回答。`;
  }

  if (knowledgeBaseType === 'policy') {
    return `你是一位专业的政策培训讲师，学员提出了一个问题。用严谨但易懂的语气回答。`;
  }

  const grade = chapterMetadata?.grade || '';
  const subject = chapterMetadata?.subject || '';
  
  return `你是一位${grade}${subject}老师，学生提出了一个问题。用亲切的语气回答，像和孩子聊天一样。`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { manuscriptId: string } }
) {
  try {
    const { manuscriptId } = params;
    const body = await request.json();
    const { 
      question, 
      currentSlide = 0, 
      knowledgeBaseId,  // 知识库 ID，用于 RAG 检索（可选）
      knowledgeBaseType = 'k12',
      chapterMetadata = null,
      continueExplaining = false,
      explainCount = 1 
    } = body;

    console.log('[Ask API] 收到问题:', question, '当前页:', currentSlide, '类型:', knowledgeBaseType);

    if (!question) {
      return NextResponse.json({ error: '缺少问题内容' }, { status: 400 });
    }

    // ========== 从数据库读取手稿内容 ==========
    const manuscript = await prisma.teachingManuscript.findUnique({
      where: { id: manuscriptId },
      include: {
        knowledgeBase: true,
        chapter: true,
      },
    });

    if (!manuscript) {
      return NextResponse.json({ error: '手稿不存在' }, { status: 404 });
    }

    // 获取手稿内容（优先使用 slidevMd，其次 enrichedContent）
    const manuscriptContent = manuscript.slidevMd || manuscript.enrichedContent || manuscript.confirmedContent || manuscript.draftContent || '';
    
    // 解析为 slides
    const slides = parseManuscriptToSlides(manuscriptContent);
    console.log('[Ask API] 从手稿解析 slides 数量:', slides.length);
    
    if (slides.length > 0) {
      console.log('[Ask API] 第一页:', { title: slides[0].title, content: slides[0].content?.slice(0, 100) });
    }

    // ========== 构建上下文：手稿内容 + 知识库补充 ==========
    
    // 1. 使用手稿/PPT 内容（最相关）
    let pptContext = '';
    if (slides.length > 0) {
      pptContext = slides
        .map((s, i) => `【第${i + 1}页】${s.title}\n${s.content}`)
        .join('\n\n---\n\n');
      console.log('[Ask API] PPT 内容长度:', pptContext.length);
    }
    
    // 2. 知识库检索补充（使用手稿关联的知识库）
    let kbContext = '';
    const kbId = knowledgeBaseId || manuscript.knowledgeBaseId;
    if (kbId) {
      try {
        console.log('[Ask API] 检索知识库补充信息...', kbId);
        const ragResult = await lightragClient.query({
          kb_id: kbId,
          question: question,
          mode: 'hybrid',
        });
        
        if (ragResult.answer) {
          kbContext = ragResult.answer;
          console.log('[Ask API] 知识库检索成功，内容长度:', kbContext.length);
        }
      } catch (ragError: any) {
        console.error('[Ask API] 知识库检索失败:', ragError.message);
        // 知识库检索失败不影响回答，因为我们有手稿内容
      }
    }
    
    // 3. 合并上下文：PPT 优先，知识库补充
    const fullContext = pptContext 
      ? `## 当前 PPT 内容\n${pptContext}${kbContext ? `\n\n## 知识库补充\n${kbContext}` : ''}`
      : kbContext || '（无可用内容）';

    if (continueExplaining) {
      // 继续解释模式
      const response = await client.chat.completions.create({
        model: 'qwen-plus',
        messages: [
          { role: 'system', content: `你是一位有耐心的老师，学生说没听明白，请换一种方式解释。用更简单的语言，多举例子。直接回答，不要输出 JSON。` },
          { role: 'user', content: `学生问题：${question}\n\n参考内容：\n${fullContext}\n\n这是第 ${explainCount} 次解释，请换种方式讲。` },
        ],
        temperature: 0.8,
        max_tokens: 800,
      });

      const answer = response.choices[0]?.message?.content || '让我换个方式解释...';
      
      return NextResponse.json({
        response: answer,
        shouldContinue: explainCount < 3,
      });

    } else {
      // 问题回答模式
      const kbType = manuscript.knowledgeBase?.type || knowledgeBaseType;
      const chapMeta = manuscript.chapter?.metadata as any || chapterMetadata;
      const rolePrompt = generateRolePrompt(kbType, chapMeta);
      
      // 构建 PPT 页面列表（用于定位）
      const slideTitles = slides
        .map((s, i) => `第${i + 1}页: ${s.title}`)
        .join('\n');

      const systemPrompt = `${rolePrompt}

## 你的任务
根据下面的 PPT 内容回答学生问题。回答要简洁自然，像真人老师一样。

## 参考内容
${fullContext}

## PPT 页面列表
${slideTitles || '（无页面信息）'}

## 要求
1. 基于 PPT 内容回答，内容要准确
2. 口语化表达，简洁为主，复杂问题才多说
3. 如果问题与 PPT 无关，也友好回答，但标记为偏题
4. 判断问题对应哪一页 PPT（从 0 开始计数）

返回 JSON：
{
  "response": "回答内容...",
  "targetSlide": 0,
  "isOffTopic": false,
  "summary": "问题摘要"
}`;

      const response = await client.chat.completions.create({
        model: 'qwen-plus',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `学生问题：${question}\n当前在第 ${currentSlide + 1} 页。` },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 1000,
      });

      const content = response.choices[0]?.message?.content || '{}';
      const result = JSON.parse(content);

      console.log('[Ask API] 回答结果:', result);

      // 处理跳转逻辑
      let targetSlide = result.targetSlide ?? currentSlide;
      let jumpAction: 'jump' | 'stay' | 'later' | 'off_topic';
      let finalResponse = result.response || '好的，让我给你解释一下...';
      const isOffTopic = result.isOffTopic === true;
      const slideCount = slides.length;

      if (isOffTopic || targetSlide === -1) {
        jumpAction = 'off_topic';
        targetSlide = currentSlide;
        if (!finalResponse.includes('偏题')) {
          finalResponse += ' 不过这个有点偏题了哈，我们继续上课。';
        }
      } else if (targetSlide < 0 || targetSlide >= slideCount) {
        // 无效页码，留在当前页
        jumpAction = 'stay';
        targetSlide = currentSlide;
      } else if (targetSlide !== currentSlide) {
        // 目标页不是当前页，跳转过去
        jumpAction = 'jump';
      } else {
        // 目标页就是当前页，不跳转
        jumpAction = 'stay';
      }

      console.log('[Ask API] 跳转:', { targetSlide, jumpAction, isOffTopic });

      return NextResponse.json({
        targetSlide,
        jumpAction,
        response: finalResponse,
        summary: result.summary || question.slice(0, 20),
      });
    }

  } catch (error: any) {
    console.error('[Ask API] 错误:', error);
    return NextResponse.json(
      { error: error.message || '处理问题失败' },
      { status: 500 }
    );
  }
}
