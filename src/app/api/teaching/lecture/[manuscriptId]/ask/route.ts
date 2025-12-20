/**
 * 学生问题理解 API
 * 理解学生问题，定位到相关 PPT 页，生成针对性讲解
 */

import { NextRequest, NextResponse } from 'next/server';
//@ts-ignore
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
});

const QUESTION_UNDERSTANDING_PROMPT = `你是一位专业的小学数学老师，正在课堂上讲课。学生打断了你的讲解，提出了一个问题。

## 你的任务
1. 理解学生的问题
2. 根据问题找到最相关的 PPT 页
3. 用通俗易懂的语言解释，让学生明白

## 输入
- 学生的问题
- PPT 页面列表（包含页码和标题）
- 当前正在讲的页码

## 输出要求
返回 JSON 对象：
{
  "targetSlide": 2,        // 最相关的 PPT 页码（从 0 开始）
  "response": "好的，我来给你解释一下小数的读法...",  // 讲解内容（口语化，100-200字）
  "summary": "小数读法"    // 问题摘要（用于日志）
}

## 讲解原则
1. 用学生能听懂的语言
2. 举生活中的例子
3. 循序渐进，不要一下子讲太多
4. 语气亲切，像和孩子聊天
`;

const CONTINUE_EXPLAINING_PROMPT = `你是一位有耐心的小学数学老师。学生刚才说没听明白，你需要换一种方式再解释一遍。

## 要求
1. 用更简单的语言
2. 举更多具体的例子
3. 把复杂的内容拆分成小步骤
4. 语气更加鼓励和耐心

## 输入
- 学生的原始问题
- 这是第几次解释（如果 >= 3，可以建议课后再讨论）

## 输出
返回 JSON 对象：
{
  "response": "没关系，我换个方式说。比如说...",  // 新的讲解内容
  "shouldContinue": true  // 是否继续解释（false 表示建议课后讨论）
}
`;

export async function POST(
  request: NextRequest,
  { params }: { params: { manuscriptId: string } }
) {
  try {
    const body = await request.json();
    const { 
      question, 
      currentSlide, 
      slideTitles, 
      continueExplaining = false,
      explainCount = 1 
    } = body;

    console.log('[Ask API] 收到问题:', question, '当前页:', currentSlide);

    if (!question) {
      return NextResponse.json({ error: '缺少问题内容' }, { status: 400 });
    }

    if (continueExplaining) {
      // 继续解释模式
      console.log('[Ask API] 继续解释模式，第', explainCount, '次');
      
      const response = await client.chat.completions.create({
        model: 'qwen-plus',
        messages: [
          { role: 'system', content: CONTINUE_EXPLAINING_PROMPT },
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
      const slidesContext = slideTitles
        .map((s: { index: number; title: string }) => `第 ${s.index + 1} 页: ${s.title}`)
        .join('\n');

      const response = await client.chat.completions.create({
        model: 'qwen-plus',
        messages: [
          { role: 'system', content: QUESTION_UNDERSTANDING_PROMPT },
          { 
            role: 'user', 
            content: `学生问题：${question}\n\n当前正在讲第 ${currentSlide + 1} 页。\n\nPPT 页面列表：\n${slidesContext}\n\n请理解问题，找到相关页面，并生成讲解内容。` 
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 1500,
      });

      const content = response.choices[0]?.message?.content || '{}';
      const result = JSON.parse(content);

      console.log('[Ask API] 问题理解结果:', result);

      // 验证结果
      let targetSlide = result.targetSlide;
      if (typeof targetSlide !== 'number' || targetSlide < 0 || targetSlide >= slideTitles.length) {
        targetSlide = currentSlide; // 默认留在当前页
      }

      return NextResponse.json({
        targetSlide,
        response: result.response || '好的，让我给你解释一下这个问题...',
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

