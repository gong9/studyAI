/**
 * POST /api/legal/recommend
 * 
 * 根据选定的法律，基于知识库中的实际内容，使用 LLM 推荐适合普法讲座的主题
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { loadIndex } from '@/lib/llm';
import { hybridSearch } from '@/lib/hybrid-search';
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
});

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const { lawName, audience } = await request.json();

    if (!lawName) {
      return NextResponse.json({ error: '请选择法律' }, { status: 400 });
    }

    // 1. 查找预置法律库
    const presetKB = await prisma.knowledgeBase.findFirst({
      where: { isPreset: true, type: 'legal' },
    });

    if (!presetKB) {
      return NextResponse.json({ error: '法律知识库未初始化' }, { status: 400 });
    }

    // 2. 从知识库中检索该法律的核心内容
    let lawContent = '';
    try {
      const index = await loadIndex(presetKB.id);
      const results = await hybridSearch(index, presetKB.id, lawName, {
        vectorTopK: 15,
        keywordLimit: 10,
        minVectorScore: 0.2,
      });
      
      // 提取法条内容
      lawContent = results
        .map(r => r.content)
        .join('\n\n')
        .slice(0, 8000); // 限制长度
      
      console.log(`[Legal Recommend] Retrieved ${results.length} chunks for "${lawName}"`);
    } catch (searchError) {
      console.error('[Legal Recommend] Search error:', searchError);
    }

    if (!lawContent) {
      return NextResponse.json({ error: '未找到该法律的相关内容' }, { status: 400 });
    }

    // 3. 基于实际法条内容让 LLM 推荐主题
    const prompt = `你是一位专业的普法讲座策划专家。请根据以下《${lawName}》的实际法条内容，推荐 5 个适合面向"${audience || '普通群众'}"的普法讲座主题。

## 法律条文内容（来自知识库）
${lawContent}

## 要求
1. 主题必须基于上述法条中实际涉及的内容，不要虚构
2. 选择最贴近生活、最实用的条款作为主题
3. 标题要通俗易懂，能引起听众兴趣
4. 每个主题用一句话概括，不超过 20 字

请直接返回 JSON 数组格式，不要其他解释：
["主题1", "主题2", "主题3", "主题4", "主题5"]`;

    const response = await client.chat.completions.create({
      model: 'qwen-turbo',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content || '[]';
    
    // 解析 JSON
    let topics: string[] = [];
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        topics = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error('[Legal Recommend] Parse error:', e);
      topics = content.split('\n').filter(line => line.trim()).slice(0, 5);
    }

    return NextResponse.json({ topics });
  } catch (error: any) {
    console.error('[Legal Recommend] Error:', error);
    return NextResponse.json({ error: '推荐失败' }, { status: 500 });
  }
}

