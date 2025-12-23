/**
 * 学生问题理解 API
 * 理解学生问题，定位到相关 PPT 页，生成针对性讲解
 * 支持动态角色（根据知识库类型）和智能跳转逻辑
 */

import { NextRequest, NextResponse } from 'next/server';
//@ts-ignore
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
});

// 根据知识库类型和章节元数据生成角色提示词
function generateRolePrompt(
  knowledgeBaseType: string,
  chapterMetadata: { grade?: string; subject?: string } | null
): string {
  if (knowledgeBaseType === 'tech') {
    return `你是一位经验丰富的技术培训讲师，正在给学员讲解技术课程。学员打断了你的讲解，提出了一个问题。

## 讲解原则
1. 使用准确的技术术语
2. 可以适当引用代码示例
3. 解释原理和最佳实践
4. 语气专业但友好`;
  }

  if (knowledgeBaseType === 'policy') {
    return `你是一位专业的政策培训讲师，正在给学员讲解政策法规。学员打断了你的讲解，提出了一个问题。

## 讲解原则
1. 准确引用相关条款
2. 条理清晰，逻辑严密
3. 结合实际案例说明
4. 语气严谨但易懂`;
  }

  // k12 教育：根据学科和年级调整
  const grade = chapterMetadata?.grade || '';
  const subject = chapterMetadata?.subject || '通用';
  
  return `你是一位${grade}${subject}老师，正在课堂上讲课。学生打断了你的讲解，提出了一个问题。

## 讲解原则
1. 用学生能听懂的语言
2. 举生活中的例子
3. 循序渐进，不要一下子讲太多
4. 语气亲切，像和孩子聊天`;
}

// 生成继续解释的角色提示词
function generateContinuePrompt(
  knowledgeBaseType: string,
  chapterMetadata: { grade?: string; subject?: string } | null
): string {
  if (knowledgeBaseType === 'tech') {
    return `你是一位有耐心的技术培训讲师。学员刚才说没听明白，你需要换一种方式再解释一遍。

## 要求
1. 用更简单的语言，减少专业术语
2. 举更多具体的例子或类比
3. 把复杂的内容拆分成小步骤
4. 可以用图示或伪代码辅助说明`;
  }

  if (knowledgeBaseType === 'policy') {
    return `你是一位有耐心的政策培训讲师。学员刚才说没听明白，你需要换一种方式再解释一遍。

## 要求
1. 用更通俗的语言解释条款
2. 举更多实际应用案例
3. 对比不同情况的处理方式
4. 强调关键要点`;
  }

  const grade = chapterMetadata?.grade || '';
  const subject = chapterMetadata?.subject || '';
  
  return `你是一位有耐心的${grade}${subject}老师。学生刚才说没听明白，你需要换一种方式再解释一遍。

## 要求
1. 用更简单的语言
2. 举更多具体的例子
3. 把复杂的内容拆分成小步骤
4. 语气更加鼓励和耐心`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { manuscriptId: string } }
) {
  try {
    const body = await request.json();
    const { 
      question, 
      currentSlide, 
      slides,  // 完整的 slides 数组（包含 title 和 content）
      knowledgeBaseType = 'k12',  // 知识库类型
      chapterMetadata = null,      // 章节元数据
      continueExplaining = false,
      explainCount = 1 
    } = body;

    console.log('[Ask API] 收到问题:', question, '当前页:', currentSlide, '类型:', knowledgeBaseType);

    if (!question) {
      return NextResponse.json({ error: '缺少问题内容' }, { status: 400 });
    }

    if (continueExplaining) {
      // 继续解释模式
      console.log('[Ask API] 继续解释模式，第', explainCount, '次');
      
      const continuePrompt = generateContinuePrompt(knowledgeBaseType, chapterMetadata);
      
      const response = await client.chat.completions.create({
        model: 'qwen-plus',
        messages: [
          { role: 'system', content: `${continuePrompt}

## 输入
- 学生的原始问题
- 这是第几次解释（如果 >= 3，可以建议课后再讨论）

## 输出
返回 JSON 对象：
{
  "response": "没关系，我换个方式说。比如说...",  // 新的讲解内容
  "shouldContinue": true  // 是否继续解释（false 表示建议课后讨论）
}` },
          { 
            role: 'user', 
            content: `学生问题：${question}\n这是第 ${explainCount} 次解释。\n\n请换一种方式再解释一遍。` 
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.8,
        max_tokens: 1000,
      });

      const content = response.choices[0]?.message?.content || '{}';
      const result = JSON.parse(content);

      console.log('[Ask API] 继续解释结果:', result);

      // 如果解释次数太多，建议课后讨论
      if (explainCount >= 3 && !result.response) {
        return NextResponse.json({
          response: '没关系，这个知识点确实有点难。课后你可以来找老师，我们慢慢讨论，好吗？',
          shouldContinue: false,
        });
      }

      return NextResponse.json({
        response: result.response || '让我再举一个例子来说明...',
        shouldContinue: result.shouldContinue !== false,
      });

    } else {
      // 问题理解模式
      const rolePrompt = generateRolePrompt(knowledgeBaseType, chapterMetadata);
      
      // 构建完整的 PPT 内容上下文（包含标题和内容）
      const slidesContext = (slides || [])
        .map((s: { index: number; title: string; content?: string }, i: number) => {
          const idx = s.index ?? i;
          const contentPreview = s.content 
            ? s.content.slice(0, 500) + (s.content.length > 500 ? '...' : '')
            : '（无内容）';
          return `【第 ${idx + 1} 页】${s.title}\n${contentPreview}`;
        })
        .join('\n\n---\n\n');

      const systemPrompt = `${rolePrompt}

## 你的任务
1. 理解学生的问题
2. 根据问题找到最相关的 PPT 页（仔细阅读每页内容）
3. 如果找不到相关内容，返回 targetSlide: -1

## 输入
- 学生的问题
- PPT 页面列表（包含页码、标题和内容）
- 当前正在讲的页码

## 输出要求
返回 JSON 对象：
{
  "targetSlide": 2,        // 最相关的 PPT 页码（从 0 开始），-1 表示未找到相关内容
  "response": "好的，我来给你解释一下...",  // 讲解内容（口语化，100-200字）
  "summary": "问题摘要"    // 问题摘要（用于日志）
}`;

      const response = await client.chat.completions.create({
        model: 'qwen-plus',
        messages: [
          { role: 'system', content: systemPrompt },
          { 
            role: 'user', 
            content: `学生问题：${question}\n\n当前正在讲第 ${currentSlide + 1} 页。\n\nPPT 完整内容：\n${slidesContext}\n\n请理解问题，找到相关页面，并生成讲解内容。` 
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 1500,
      });

      const content = response.choices[0]?.message?.content || '{}';
      const result = JSON.parse(content);

      console.log('[Ask API] 问题理解结果:', result);

      // 处理跳转逻辑
      let targetSlide = result.targetSlide;
      let jumpAction: 'jump' | 'stay' | 'later' | 'not_found';
      let finalResponse: string;

      const slideCount = slides?.length || 0;

      if (targetSlide === -1 || targetSlide === undefined || targetSlide === null) {
        // 未找到相关内容
        jumpAction = 'not_found';
        targetSlide = currentSlide;
        finalResponse = '这个问题不在我们这次讨论范围内，课后我们可以单独聊聊，好吗？';
      } else if (targetSlide < 0 || targetSlide >= slideCount) {
        // 无效页码，留在当前页
        jumpAction = 'stay';
        targetSlide = currentSlide;
        finalResponse = result.response || '好的，让我给你解释一下这个问题...';
      } else if (targetSlide < currentSlide) {
        // 目标页在当前页之前 -> 跳转回去讲解
        jumpAction = 'jump';
        finalResponse = result.response || '好的，让我给你解释一下这个问题...';
      } else if (targetSlide === currentSlide) {
        // 就在当前页 -> 直接讲解
        jumpAction = 'stay';
        finalResponse = result.response || '好的，让我给你解释一下这个问题...';
      } else {
        // 目标页在当前页之后 -> 提示一会儿会讲到
        jumpAction = 'later';
        finalResponse = '这个问题我们一会儿会讲到，请先听我把当前内容讲完，好吗？';
      }

      console.log('[Ask API] 跳转逻辑:', { targetSlide, jumpAction, currentSlide });

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
