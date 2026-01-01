/**
 * 阶段1：教学规划 Agent
 * 
 * 职责：
 * - 阅读章节内容，理解知识结构
 * - 根据内容本身的逻辑组织讲解
 * - 不强套固定模板，灵活适应不同内容
 * 
 * 核心理念：按照内容本身的结构来讲，不是按固定模板
 */

import { OpenAI } from '@llamaindex/openai';
import { configureLLM } from '../../llm/config';

// ==================== 场景类型 ====================

/** 场景类型 */
export type SceneType = 'k12_teaching' | 'tech_training' | 'product_launch' | 'business_report' | 'company_training' | 'legal_training' | 'general';

/** 场景配置 */
interface SceneConfig {
  name: string;
  description: string;
  audience: string;
  style: string;
}

/** 场景配置表 - 只定义风格，不定义结构 */
const SCENE_CONFIGS: Record<SceneType, SceneConfig> = {
  k12_teaching: {
    name: 'K12 教学',
    description: '面向中小学生的课堂教学',
    audience: '学生',
    style: '生动有趣、循序渐进、多用例子、注重互动',
  },
  tech_training: {
    name: '技术培训',
    description: '面向开发者的技术分享',
    audience: '开发者/技术人员',
    style: '逻辑清晰、由浅入深、重视原理、配合代码示例',
  },
  product_launch: {
    name: '产品发布',
    description: '产品介绍和发布演示',
    audience: '潜在用户/客户',
    style: '突出价值、展示亮点、引导行动',
  },
  business_report: {
    name: '商业汇报',
    description: '商业分析和决策汇报',
    audience: '管理层/决策者',
    style: '数据驱动、结论先行、重点突出',
  },
  company_training: {
    name: '企业制度培训',
    description: '公司规章制度培训',
    audience: '员工',
    style: '通俗易懂、重点突出、结合案例',
  },
  legal_training: {
    name: '普法讲座',
    description: '法律知识普及',
    audience: '普通群众',
    style: '通俗易懂、生活化案例、实用指导',
  },
  general: {
    name: '通用演示',
    description: '通用演示文稿',
    audience: '通用',
    style: '清晰有条理、重点突出',
  },
};

// ==================== 核心 Prompt ====================

const FLEXIBLE_PLANNING_PROMPT = `你是一位资深的培训规划专家。请阅读以下章节内容，根据内容本身的结构来规划讲解。

## 章节信息
标题：{chapterTitle}
场景：{sceneName}（{sceneDescription}）
受众：{audience}
风格要求：{style}

## 章节内容
{chapterContent}

## 任务
1. **理解内容结构**：这章讲了什么？分几个部分？每部分的核心是什么？
2. **识别重点**：哪些是必须讲的核心概念？哪些是辅助说明？
3. **按内容组织**：根据内容本身的逻辑来划分讲解单元，不要强套固定模板
4. **适当扩展**：可以补充开场引入和结尾总结，但主体部分要忠于原文结构

## 输出格式 (JSON)
{
  "chapter": "章节名称",
  "summary": "一句话概括这章讲什么",
  "teaching_goals": ["学完能掌握xxx", "学完能理解xxx"],
  "key_concepts": ["核心概念1", "核心概念2"],
  "sections": [
    {
      "title": "段落/小节标题（来自原文或自拟）",
      "key_points": ["这部分要讲的要点1", "要点2"],
      "duration_minutes": 5,
      "notes": "讲解建议（可选）"
    }
  ],
  "total_duration_minutes": 30,
  "notes": "整体讲解建议"
}

## 重要原则
1. **忠于原文结构**：如果原文有明确的章节划分（如 1.1、1.2 或 小节标题），就按那个来
2. **不强套模板**：不需要必须有"背景介绍"、"架构讲解"等固定环节，按内容需要来
3. **灵活划分**：一个 section 可以是一个概念、一个例子、一个对比，取决于内容
4. **合理时间**：根据内容复杂度分配时间，重要的多讲，简单的少讲
5. **保持完整**：确保原文的核心内容都覆盖到

请直接输出 JSON，不要有其他解释文字。`;

// ==================== 类型定义 ====================

/** 课程节次规划 */
export interface SectionPlan {
  title: string;
  key_points: string[];
  duration_minutes?: number;
  notes?: string;
  // 兼容旧版 type 字段（可选）
  type?: string;
}

/** 教学规划（Agent1 输出） */
export interface TeachingPlan {
  chapter: string;
  summary?: string;
  teaching_goals: string[];
  key_concepts: string[];
  prerequisites?: string[];
  sections: SectionPlan[];
  total_duration_minutes?: number;
  constraints?: {
    grade?: string;
    subject?: string;
    duration?: string;
    difficulty?: 'easy' | 'medium' | 'hard';
  };
  notes: string;
  sceneType?: SceneType;
}

/** 规划输入 */
export interface PlanningInput {
  chapterTitle: string;
  chapterContent: string;
  sceneType?: SceneType;
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

// ==================== 导出场景配置（供前端使用） ====================

export const SCENE_OPTIONS = Object.entries(SCENE_CONFIGS).map(([value, config]) => ({
  value: value as SceneType,
  label: config.name,
}));

// ==================== 核心函数 ====================

/**
 * 生成教学规划
 */
export async function generateTeachingPlan(input: PlanningInput): Promise<PlanningResult> {
  try {
    configureLLM();

    const sceneType = input.sceneType || 'general';
    const sceneConfig = SCENE_CONFIGS[sceneType];

    const llm = new OpenAI({
      model: process.env.OPENAI_MODEL || 'qwen-plus',
      apiKey: process.env.OPENAI_API_KEY!,
      baseURL: process.env.OPENAI_API_BASE || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });

    // 构建灵活的 prompt
    const prompt = FLEXIBLE_PLANNING_PROMPT
      .replace('{chapterTitle}', input.chapterTitle)
      .replace('{sceneName}', sceneConfig.name)
      .replace('{sceneDescription}', sceneConfig.description)
      .replace('{audience}', sceneConfig.audience)
      .replace('{style}', sceneConfig.style)
      .replace('{chapterContent}', truncateContent(input.chapterContent, 12000));

    console.log('[TeachingPlanner] Generating flexible plan for:', input.chapterTitle, 'scene:', sceneType);

    const response = await llm.complete({ prompt });
    const text = response.text.trim();

    // 解析 JSON
    const plan = parseTeachingPlan(text, sceneType);
    
    if (!plan) {
      return {
        success: false,
        plan: null,
        error: '无法解析教学规划',
      };
    }

    // 添加场景类型
    plan.sceneType = sceneType;

    console.log('[TeachingPlanner] Plan generated:', {
      summary: plan.summary,
      goals: plan.teaching_goals.length,
      sections: plan.sections.length,
      totalDuration: plan.total_duration_minutes,
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
function parseTeachingPlan(text: string, sceneType: SceneType): TeachingPlan | null {
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

    // 规范化 sections
    const sections: SectionPlan[] = parsed.sections.map((s: any) => ({
      title: s.title || '未命名',
      key_points: Array.isArray(s.key_points) ? s.key_points : [],
      duration_minutes: typeof s.duration_minutes === 'number' ? s.duration_minutes : undefined,
      notes: s.notes || undefined,
      type: s.type || undefined, // 兼容旧版
    }));

    // 计算总时长
    const totalDuration = parsed.total_duration_minutes || 
      sections.reduce((sum, s) => sum + (s.duration_minutes || 5), 0);

    return {
      chapter: parsed.chapter || '',
      summary: parsed.summary || '',
      teaching_goals: parsed.teaching_goals || [],
      key_concepts: parsed.key_concepts || [],
      prerequisites: parsed.prerequisites || [],
      sections,
      total_duration_minutes: totalDuration,
      constraints: parsed.constraints ? {
        grade: parsed.constraints.grade,
        subject: parsed.constraints.subject,
        duration: parsed.constraints.duration || `${totalDuration}min`,
        difficulty: parsed.constraints.difficulty || 'medium',
      } : {
        duration: `${totalDuration}min`,
        difficulty: 'medium',
      },
      notes: parsed.notes || '',
    };
  } catch (error: any) {
    console.error('[TeachingPlanner] JSON parse error:', error.message);
    return null;
  }
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
