/**
 * 阶段1：教学规划 Agent
 * 
 * 职责：
 * - 阅读整章教材内容
 * - 识别教学目标、核心概念、合理讲解顺序
 * - 决定哪些内容重点讲、略讲、不讲
 * - 输出结构化的教学规划
 */

import { OpenAI } from '@llamaindex/openai';
import { configureLLM } from '../../llm/config';

// ==================== 类型定义 ====================

/** 课程节次规划 */
export interface SectionPlan {
  type: 'intro' | 'concept' | 'example' | 'exercise' | 'summary' | 'transition';
  title: string;
  key_points: string[];
  duration_minutes?: number;
}

/** 教学规划（Agent1 输出） */
export interface TeachingPlan {
  chapter: string;                    // 章节名称
  teaching_goals: string[];           // 教学目标
  key_concepts: string[];             // 核心概念
  prerequisites: string[];            // 前置知识
  sections: SectionPlan[];            // 节次规划
  constraints: {
    grade: string;                    // 年级
    subject: string;                  // 学科
    duration: string;                 // 建议时长，如 "45min"
    difficulty: 'easy' | 'medium' | 'hard';
  };
  notes: string;                      // 教学建议
}

/** 规划输入 */
export interface PlanningInput {
  chapterTitle: string;
  chapterContent: string;
  metadata?: {
    grade?: string;
    subject?: string;
  };
}

/** 规划结果 */
export interface PlanningResult {
  success: boolean;
  plan: TeachingPlan | null;
  error?: string;
}

// ==================== Prompt ====================

const TEACHING_PLAN_PROMPT = `你是一位资深的教研专家。请阅读以下教材内容，从教师的角度进行教学规划。

## 教材章节
标题：{chapterTitle}
年级学科：{grade} {subject}

## 教材内容
{chapterContent}

## 任务
1. 分析这节课的教学目标
2. 识别核心概念和前置知识
3. 规划合理的讲解顺序
4. 决定哪些内容需要重点讲解

## 输出格式 (JSON)
{
  "chapter": "章节名称",
  "teaching_goals": ["目标1", "目标2"],
  "key_concepts": ["核心概念1", "核心概念2"],
  "prerequisites": ["前置知识1"],
  "sections": [
    {
      "type": "intro",
      "title": "引入：从生活中的例子说起",
      "key_points": ["用学生熟悉的场景引入"],
      "duration_minutes": 5
    },
    {
      "type": "concept",
      "title": "概念讲解：xxx 的定义",
      "key_points": ["定义", "关键条件"],
      "duration_minutes": 10
    },
    {
      "type": "example",
      "title": "例题：xxx",
      "key_points": ["解题步骤", "易错点"],
      "duration_minutes": 8
    },
    {
      "type": "exercise",
      "title": "练习巩固",
      "key_points": ["基础练习", "变式练习"],
      "duration_minutes": 10
    },
    {
      "type": "summary",
      "title": "课堂小结",
      "key_points": ["知识框架", "要点回顾"],
      "duration_minutes": 5
    }
  ],
  "constraints": {
    "grade": "初二",
    "subject": "数学",
    "duration": "45min",
    "difficulty": "medium"
  },
  "notes": "教学建议和注意事项"
}

## 注意
1. sections 的 type 必须是: intro, concept, example, exercise, summary, transition 之一
2. 每个 section 都要有明确的 key_points
3. duration_minutes 加起来不要超过 45 分钟
4. 请直接输出 JSON，不要有其他解释文字`;

// ==================== 核心函数 ====================

/**
 * 生成教学规划
 */
export async function generateTeachingPlan(input: PlanningInput): Promise<PlanningResult> {
  try {
    configureLLM();

    const llm = new OpenAI({
      model: process.env.OPENAI_MODEL || 'qwen-plus',
      apiKey: process.env.OPENAI_API_KEY!,
      baseURL: process.env.OPENAI_API_BASE || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });

    const prompt = TEACHING_PLAN_PROMPT
      .replace('{chapterTitle}', input.chapterTitle)
      .replace('{grade}', input.metadata?.grade || '未知')
      .replace('{subject}', input.metadata?.subject || '未知')
      .replace('{chapterContent}', truncateContent(input.chapterContent, 8000));

    console.log('[TeachingPlanner] Generating plan for:', input.chapterTitle);

    const response = await llm.complete({ prompt });
    const text = response.text.trim();

    // 解析 JSON
    const plan = parseTeachingPlan(text);
    
    if (!plan) {
      return {
        success: false,
        plan: null,
        error: '无法解析教学规划',
      };
    }

    console.log('[TeachingPlanner] Plan generated:', {
      goals: plan.teaching_goals.length,
      sections: plan.sections.length,
    });

    return {
      success: true,
      plan,
    };
  } catch (error: any) {
    console.error('[TeachingPlanner] Error:', error);
    return {
      success: false,
      plan: null,
      error: error.message || '教学规划生成失败',
    };
  }
}

// ==================== 辅助函数 ====================

/**
 * 解析教学规划 JSON
 */
function parseTeachingPlan(text: string): TeachingPlan | null {
  try {
    // 提取 JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[TeachingPlanner] No JSON found in response');
      return null;
    }

    let jsonStr = jsonMatch[0];
    
    // 清理可能的问题
    jsonStr = jsonStr
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');

    const parsed = JSON.parse(jsonStr);

    // 验证必要字段
    if (!parsed.chapter || !Array.isArray(parsed.sections)) {
      console.error('[TeachingPlanner] Invalid plan structure');
      return null;
    }

    // 规范化
    return {
      chapter: parsed.chapter || '',
      teaching_goals: parsed.teaching_goals || [],
      key_concepts: parsed.key_concepts || [],
      prerequisites: parsed.prerequisites || [],
      sections: normalizeSections(parsed.sections),
      constraints: {
        grade: parsed.constraints?.grade || '未知',
        subject: parsed.constraints?.subject || '未知',
        duration: parsed.constraints?.duration || '45min',
        difficulty: parsed.constraints?.difficulty || 'medium',
      },
      notes: parsed.notes || '',
    };
  } catch (error: any) {
    console.error('[TeachingPlanner] JSON parse error:', error.message);
    return null;
  }
}

/**
 * 规范化节次列表
 */
function normalizeSections(sections: any[]): SectionPlan[] {
  const validTypes = ['intro', 'concept', 'example', 'exercise', 'summary', 'transition'];
  
  return sections.map((s: any) => ({
    type: validTypes.includes(s.type) ? s.type : 'concept',
    title: s.title || '未命名节次',
    key_points: Array.isArray(s.key_points) ? s.key_points : [],
    duration_minutes: typeof s.duration_minutes === 'number' ? s.duration_minutes : undefined,
  }));
}

/**
 * 截断内容，避免超出 token 限制
 */
function truncateContent(content: string, maxLength: number): string {
  if (content.length <= maxLength) {
    return content;
  }
  return content.slice(0, maxLength) + '\n\n...[内容过长，已截断]';
}

