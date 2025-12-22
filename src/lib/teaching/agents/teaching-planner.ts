/**
 * 阶段1：教学规划 Agent
 * 
 * 职责：
 * - 阅读整章教材内容
 * - 识别教学目标、核心概念、合理讲解顺序
 * - 决定哪些内容重点讲、略讲、不讲
 * - 输出结构化的教学规划
 * 
 * 支持多种场景：K12教学、技术培训、产品发布、商业汇报、通用演示
 */

import { OpenAI } from '@llamaindex/openai';
import { configureLLM } from '../../llm/config';

// ==================== 场景类型 ====================

/** 场景类型 */
export type SceneType = 'k12_teaching' | 'tech_training' | 'product_launch' | 'business_report' | 'company_training' | 'general';

/** 场景配置 */
interface SceneConfig {
  name: string;
  types: string[];
  prompt: string;
}

/** 场景配置表 */
const SCENE_CONFIGS: Record<SceneType, SceneConfig> = {
  k12_teaching: {
    name: 'K12 教学',
    types: ['intro', 'concept', 'example', 'exercise', 'summary', 'transition'],
    prompt: `你是一位资深的教研专家。请阅读以下教材内容，从教师的角度进行教学规划。

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
4. 请直接输出 JSON，不要有其他解释文字`,
  },

  tech_training: {
    name: '技术培训',
    types: ['intro', 'background', 'architecture', 'demo', 'code', 'best_practices', 'qa', 'summary'],
    prompt: `你是一位资深的技术培训专家。请阅读以下技术内容，规划一场技术培训/分享。

## 主题
标题：{chapterTitle}

## 技术内容
{chapterContent}

## 任务
1. 确定培训目标和受众定位
2. 识别核心技术点和前置知识
3. 规划合理的讲解顺序（由浅入深）
4. 设计演示和代码示例

## 输出格式 (JSON)
{
  "chapter": "培训主题",
  "teaching_goals": ["掌握xxx的使用", "理解xxx原理"],
  "key_concepts": ["核心概念1", "核心API"],
  "prerequisites": ["前置技术栈"],
  "sections": [
    {
      "type": "intro",
      "title": "开场：为什么需要学习这个技术",
      "key_points": ["痛点", "应用场景"],
      "duration_minutes": 5
    },
    {
      "type": "background",
      "title": "背景知识：相关概念回顾",
      "key_points": ["基础概念", "技术背景"],
      "duration_minutes": 8
    },
    {
      "type": "architecture",
      "title": "架构设计：整体设计思路",
      "key_points": ["架构图", "核心模块"],
      "duration_minutes": 10
    },
    {
      "type": "demo",
      "title": "演示：实际效果展示",
      "key_points": ["功能演示", "效果对比"],
      "duration_minutes": 8
    },
    {
      "type": "code",
      "title": "代码讲解：核心实现",
      "key_points": ["关键代码", "实现思路"],
      "duration_minutes": 15
    },
    {
      "type": "best_practices",
      "title": "最佳实践：注意事项",
      "key_points": ["常见问题", "优化建议"],
      "duration_minutes": 8
    },
    {
      "type": "qa",
      "title": "Q&A：问答环节",
      "key_points": ["预留时间"],
      "duration_minutes": 5
    },
    {
      "type": "summary",
      "title": "总结：回顾要点",
      "key_points": ["核心收获", "延伸资源"],
      "duration_minutes": 5
    }
  ],
  "constraints": {
    "grade": "开发者",
    "subject": "技术培训",
    "duration": "60min",
    "difficulty": "medium"
  },
  "notes": "培训建议"
}

## 注意
1. sections 的 type 必须是: intro, background, architecture, demo, code, best_practices, qa, summary 之一
2. 每个 section 都要有明确的 key_points
3. 请直接输出 JSON，不要有其他解释文字`,
  },

  product_launch: {
    name: '产品发布',
    types: ['intro', 'problem', 'solution', 'features', 'demo', 'pricing', 'roadmap', 'cta'],
    prompt: `你是一位产品发布专家。请阅读以下产品内容，规划一场产品发布/介绍演示。

## 产品
标题：{chapterTitle}

## 产品内容
{chapterContent}

## 任务
1. 明确产品定位和目标用户
2. 提炼核心卖点和差异化优势
3. 设计有说服力的演示流程
4. 规划行动号召

## 输出格式 (JSON)
{
  "chapter": "产品名称",
  "teaching_goals": ["让用户了解产品价值", "引导用户采取行动"],
  "key_concepts": ["核心功能", "差异化优势"],
  "prerequisites": ["目标用户背景"],
  "sections": [
    {
      "type": "intro",
      "title": "开场：引起共鸣",
      "key_points": ["吸引注意", "建立连接"],
      "duration_minutes": 3
    },
    {
      "type": "problem",
      "title": "痛点：现有问题",
      "key_points": ["用户痛点", "市场问题"],
      "duration_minutes": 5
    },
    {
      "type": "solution",
      "title": "方案：我们的解决方案",
      "key_points": ["核心理念", "解决思路"],
      "duration_minutes": 5
    },
    {
      "type": "features",
      "title": "功能：产品亮点",
      "key_points": ["核心功能1", "核心功能2", "核心功能3"],
      "duration_minutes": 10
    },
    {
      "type": "demo",
      "title": "演示：实际体验",
      "key_points": ["使用流程", "效果展示"],
      "duration_minutes": 8
    },
    {
      "type": "pricing",
      "title": "定价：套餐方案",
      "key_points": ["价格方案", "价值对比"],
      "duration_minutes": 3
    },
    {
      "type": "roadmap",
      "title": "规划：未来展望",
      "key_points": ["近期计划", "长期愿景"],
      "duration_minutes": 3
    },
    {
      "type": "cta",
      "title": "行动：立即开始",
      "key_points": ["行动号召", "联系方式"],
      "duration_minutes": 3
    }
  ],
  "constraints": {
    "grade": "目标用户",
    "subject": "产品发布",
    "duration": "40min",
    "difficulty": "easy"
  },
  "notes": "演示建议"
}

## 注意
1. sections 的 type 必须是: intro, problem, solution, features, demo, pricing, roadmap, cta 之一
2. 每个 section 都要有明确的 key_points
3. 请直接输出 JSON，不要有其他解释文字`,
  },

  business_report: {
    name: '商业汇报',
    types: ['intro', 'background', 'analysis', 'findings', 'recommendations', 'action_items', 'summary'],
    prompt: `你是一位商业分析专家。请阅读以下内容，规划一场商业汇报演示。

## 主题
标题：{chapterTitle}

## 汇报内容
{chapterContent}

## 任务
1. 明确汇报目的和受众
2. 提炼关键数据和发现
3. 形成清晰的结论和建议
4. 规划下一步行动

## 输出格式 (JSON)
{
  "chapter": "汇报主题",
  "teaching_goals": ["传达关键信息", "推动决策"],
  "key_concepts": ["核心发现", "关键指标"],
  "prerequisites": ["背景信息"],
  "sections": [
    {
      "type": "intro",
      "title": "开场：汇报背景",
      "key_points": ["汇报目的", "主要结论预览"],
      "duration_minutes": 3
    },
    {
      "type": "background",
      "title": "背景：项目/市场概况",
      "key_points": ["背景信息", "分析范围"],
      "duration_minutes": 5
    },
    {
      "type": "analysis",
      "title": "分析：数据与方法",
      "key_points": ["数据来源", "分析方法"],
      "duration_minutes": 8
    },
    {
      "type": "findings",
      "title": "发现：关键洞察",
      "key_points": ["发现1", "发现2", "发现3"],
      "duration_minutes": 12
    },
    {
      "type": "recommendations",
      "title": "建议：应对策略",
      "key_points": ["建议1", "建议2"],
      "duration_minutes": 8
    },
    {
      "type": "action_items",
      "title": "行动计划：下一步",
      "key_points": ["具体行动", "时间节点", "责任人"],
      "duration_minutes": 5
    },
    {
      "type": "summary",
      "title": "总结：要点回顾",
      "key_points": ["核心结论", "期望支持"],
      "duration_minutes": 3
    }
  ],
  "constraints": {
    "grade": "决策层",
    "subject": "商业汇报",
    "duration": "45min",
    "difficulty": "medium"
  },
  "notes": "汇报建议"
}

## 注意
1. sections 的 type 必须是: intro, background, analysis, findings, recommendations, action_items, summary 之一
2. 每个 section 都要有明确的 key_points
3. 请直接输出 JSON，不要有其他解释文字`,
  },

  company_training: {
    name: '公司制度培训',
    types: ['intro', 'overview', 'policy', 'process', 'cases', 'qa', 'compliance', 'summary'],
    prompt: `你是一位企业培训专家。请阅读以下公司制度/规范内容，规划一场员工培训。

## 主题
标题：{chapterTitle}

## 制度内容
{chapterContent}

## 任务
1. 明确培训目标和适用人群
2. 提炼制度要点和关键条款
3. 设计易于理解的讲解流程
4. 准备案例和常见问题

## 输出格式 (JSON)
{
  "chapter": "培训主题",
  "teaching_goals": ["理解制度要点", "掌握执行规范"],
  "key_concepts": ["核心条款", "关键流程"],
  "prerequisites": ["员工背景"],
  "sections": [
    {
      "type": "intro",
      "title": "开场：为什么要学习这项制度",
      "key_points": ["制度背景", "重要性"],
      "duration_minutes": 5
    },
    {
      "type": "overview",
      "title": "概述：制度框架",
      "key_points": ["整体结构", "适用范围"],
      "duration_minutes": 8
    },
    {
      "type": "policy",
      "title": "要点：核心条款解读",
      "key_points": ["条款1", "条款2", "条款3"],
      "duration_minutes": 15
    },
    {
      "type": "process",
      "title": "流程：执行步骤",
      "key_points": ["操作流程", "审批节点"],
      "duration_minutes": 10
    },
    {
      "type": "cases",
      "title": "案例：实际场景",
      "key_points": ["正确做法", "违规案例"],
      "duration_minutes": 10
    },
    {
      "type": "qa",
      "title": "答疑：常见问题",
      "key_points": ["FAQ", "特殊情况"],
      "duration_minutes": 8
    },
    {
      "type": "compliance",
      "title": "合规：注意事项",
      "key_points": ["违规后果", "举报渠道"],
      "duration_minutes": 5
    },
    {
      "type": "summary",
      "title": "总结：要点回顾",
      "key_points": ["核心要求", "执行要点"],
      "duration_minutes": 4
    }
  ],
  "constraints": {
    "grade": "全体员工",
    "subject": "制度培训",
    "duration": "60min",
    "difficulty": "easy"
  },
  "notes": "培训建议"
}

## 注意
1. sections 的 type 必须是: intro, overview, policy, process, cases, qa, compliance, summary 之一
2. 每个 section 都要有明确的 key_points
3. 语言要通俗易懂，避免过于法律化的表述
4. 请直接输出 JSON，不要有其他解释文字`,
  },

  general: {
    name: '通用演示',
    types: ['intro', 'main', 'details', 'examples', 'summary', 'next_steps'],
    prompt: `你是一位演示文稿规划专家。请阅读以下内容，规划一个清晰有效的演示文稿。

## 主题
标题：{chapterTitle}

## 内容
{chapterContent}

## 任务
1. 确定演示目的和核心信息
2. 提炼要点，组织逻辑
3. 设计清晰的演示结构
4. 确保内容有条理、易理解

## 输出格式 (JSON)
{
  "chapter": "演示主题",
  "teaching_goals": ["传达核心信息", "达成演示目的"],
  "key_concepts": ["核心概念1", "核心概念2"],
  "prerequisites": ["受众背景"],
  "sections": [
    {
      "type": "intro",
      "title": "开场：主题引入",
      "key_points": ["吸引注意", "说明目的"],
      "duration_minutes": 5
    },
    {
      "type": "main",
      "title": "主体：核心内容",
      "key_points": ["要点1", "要点2"],
      "duration_minutes": 15
    },
    {
      "type": "details",
      "title": "详解：深入说明",
      "key_points": ["细节1", "细节2"],
      "duration_minutes": 10
    },
    {
      "type": "examples",
      "title": "案例：具体示例",
      "key_points": ["案例1", "案例2"],
      "duration_minutes": 10
    },
    {
      "type": "summary",
      "title": "总结：要点回顾",
      "key_points": ["核心收获"],
      "duration_minutes": 5
    },
    {
      "type": "next_steps",
      "title": "后续：下一步行动",
      "key_points": ["行动建议", "资源链接"],
      "duration_minutes": 5
    }
  ],
  "constraints": {
    "grade": "通用",
    "subject": "演示",
    "duration": "50min",
    "difficulty": "medium"
  },
  "notes": "演示建议"
}

## 注意
1. sections 的 type 必须是: intro, main, details, examples, summary, next_steps 之一
2. 每个 section 都要有明确的 key_points
3. 请直接输出 JSON，不要有其他解释文字`,
  },
};

// ==================== 类型定义 ====================

/** 课程节次规划 */
export interface SectionPlan {
  type: string;  // 动态类型，根据场景不同
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
    grade: string;                    // 年级/受众
    subject: string;                  // 学科/领域
    duration: string;                 // 建议时长，如 "45min"
    difficulty: 'easy' | 'medium' | 'hard';
  };
  notes: string;                      // 教学建议
  sceneType?: SceneType;              // 场景类型
}

/** 规划输入 */
export interface PlanningInput {
  chapterTitle: string;
  chapterContent: string;
  sceneType?: SceneType;              // 场景类型，默认 general
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

    const prompt = sceneConfig.prompt
      .replace('{chapterTitle}', input.chapterTitle)
      .replace('{grade}', input.metadata?.grade || '未知')
      .replace('{subject}', input.metadata?.subject || '未知')
      .replace('{chapterContent}', truncateContent(input.chapterContent, 8000));

    console.log('[TeachingPlanner] Generating plan for:', input.chapterTitle, 'scene:', sceneType);

    const response = await llm.complete({ prompt });
    const text = response.text.trim();

    // 解析 JSON
    const plan = parseTeachingPlan(text, sceneType, sceneConfig.types);
    
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
      goals: plan.teaching_goals.length,
      sections: plan.sections.length,
      sceneType,
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
function parseTeachingPlan(text: string, sceneType: SceneType, validTypes: string[]): TeachingPlan | null {
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
      sections: normalizeSections(parsed.sections, validTypes),
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
function normalizeSections(sections: any[], validTypes: string[]): SectionPlan[] {
  return sections.map((s: any) => ({
    type: validTypes.includes(s.type) ? s.type : validTypes[0],
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
