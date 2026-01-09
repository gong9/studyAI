/**
 * 阶段2：教学手稿生成 Agent
 * 
 * 职责：
 * - 根据教学规划生成 Markdown 格式的教学手稿
 * - 手稿是老师真正会写的讲课草稿
 * - 关注"怎么讲、先讲什么、怎么过渡"
 * 
 * 优化：
 * - 使用 RAG 检索每个节次的相关教材内容
 * - 结合章节重点（keyPoints）生成更充实的手稿
 */

import { OpenAI } from '@llamaindex/openai';
import { configureLLM } from '../../llm/config';
import { loadIndex } from '../../llm/index-manager';
import { hybridSearch } from '../../hybrid-search';
import type { TeachingPlan, SectionPlan } from './teaching-planner';
import type { KeyPoint } from './chapter-analyzer';

// ==================== 类型定义 ====================

/** 手稿生成输入 */
export interface ManuscriptInput {
  plan: TeachingPlan;
  knowledgeBaseId: string;       // 新增：用于 RAG 检索
  chapterKeyPoints?: KeyPoint[]; // 新增：章节重点
  chapterSummary?: string;       // 新增：章节摘要
  chapterContent?: string;       // 保留：作为备选
}

/** 手稿生成结果 */
export interface ManuscriptResult {
  success: boolean;
  markdown: string | null;
  error?: string;
}

// ==================== 场景化 Prompt 模板 ====================

/** 场景 Prompt 配置 */
interface ScenePromptConfig {
  name: string;
  audienceLabel: string;
  speakingStyle: string;
  prompt: string;
}

/** 场景 Prompt 模板表 */
const SCENE_PROMPTS: Record<string, ScenePromptConfig> = {
  k12_teaching: {
    name: 'K12 教学',
    audienceLabel: '学生',
    speakingStyle: '亲切、循循善诱',
    prompt: `你是一位经验丰富、备课认真的优秀教师。请根据以下教学规划和教材内容，撰写一份详尽、完整的教学讲稿。

## 教学规划
章节：{chapter}
年级：{grade}
学科：{subject}
时长：{duration}

教学目标：
{goals}

核心概念：
{concepts}

节次安排：
{sections}

## 章节重点（必须覆盖）
{keyPoints}

## 章节摘要
{summary}

## 教材相关内容（RAG 检索结果）
{ragContent}

## 输出要求

### 语言风格
1. 使用亲切的教学语言，如"同学们，我们来看..."、"请大家注意..."
2. 循循善诱，由浅入深
3. 多用启发式提问，引导学生思考

### 内容深度（必须遵守）
1. **每个知识点必须详细讲解**，不能只写标题
2. **概念要解释清楚**：什么是、为什么、怎么用
3. **例题要有完整过程**：题目、分析、解答步骤
4. **结合教材内容**：引用教材中的例子、公式、说明

### 格式要求
1. **格式**：使用 Markdown 格式
2. **结构**：按照节次安排组织内容
3. **分页**：每个节次用 \`---\` 分隔（幻灯片分页标记）
4. **公式**：用 LaTeX 语法，如 \`$y = kx + b$\`

### 重要提示
1. 必须详细讲解每个节次，不能敷衍
2. 确保覆盖所有"章节重点"中的知识点
3. 每页内容要充实（每个节次至少 150-300 字）
4. **不要引用图片**：不要说"这张图"、"请看图"、"如图所示"等。但要用详细的文字描述来讲解概念，内容量不能减少

请直接输出 Markdown 内容，不要有额外解释。`,
  },

  tech_training: {
    name: '技术培训',
    audienceLabel: '开发者/技术人员',
    speakingStyle: '专业、务实',
    prompt: `你是一位资深的技术专家，正在准备一场技术分享/培训。请根据以下规划和技术文档，撰写一份专业、实用的培训讲稿。

## 培训规划
主题：{chapter}
受众：{grade}
领域：{subject}
时长：{duration}

培训目标：
{goals}

核心技术点：
{concepts}

内容安排：
{sections}

## 技术要点（必须覆盖）
{keyPoints}

## 内容摘要
{summary}

## 技术文档内容（RAG 检索结果）
{ragContent}

## 输出要求

### 语言风格
1. 使用专业但易懂的技术语言
2. 直接切入重点，避免冗余
3. 可以说"我们来看一下..."、"这里有个关键点..."、"实际项目中..."

### 内容深度（必须遵守）
1. **技术原理要讲透**：不仅说是什么，还要说为什么这样设计
2. **代码示例要完整**：给出可运行的代码片段
3. **实战经验要分享**：常见坑点、最佳实践、性能优化
4. **结合文档内容**：引用技术文档中的说明和示例

### 格式要求
1. **格式**：使用 Markdown 格式
2. **结构**：按照内容安排组织
3. **代码块**：使用 \`\`\`language 格式
4. **分页**：每个部分用 \`---\` 分隔（幻灯片分页标记）

### 页数限制（必须遵守）
1. **整个 PPT 控制在 15-20 页**，不能超过 20 页
2. 合理合并相关内容，精简表达，突出重点
3. 开头 1 页 + 核心内容 13-17 页 + 总结 1-2 页

### 重要提示
1. 必须详细讲解每个技术点
2. 代码示例要有注释说明
3. 每页内容要充实（每个部分至少 150-300 字）
4. **不要引用图片**：不要说"这张图"、"请看图"、"架构图展示"等。但要用详细的文字描述来讲解技术原理，内容量不能减少

请直接输出 Markdown 内容，不要有额外解释。`,
  },

  company_training: {
    name: '制度培训',
    audienceLabel: '员工',
    speakingStyle: '严谨、规范、权威',
    prompt: `你是一位专业的企业合规培训师，正在编写一份正式的制度解读培训材料。请根据以下规划和制度文档，撰写一份严谨、规范的培训讲稿。

## 培训规划
主题：{chapter}
受众：{grade}
类型：{subject}
时长：{duration}

培训目标：
{goals}

核心条款：
{concepts}

内容安排：
{sections}

## 制度要点（必须覆盖）
{keyPoints}

## 内容摘要
{summary}

## 制度文档内容（RAG 检索结果）
{ragContent}

## 输出要求

### 语言风格（严格遵守）
1. **使用正式、严谨的书面语**，不使用口语化表达
2. 避免使用"大家好"、"划重点"、"这里很重要"等口语
3. 使用规范表述，如：
   - "本制度规定..." 而非 "这个制度说的是..."
   - "根据第X条规定..." 而非 "按照这一条..."
   - "适用范围包括..." 而非 "这条管的是..."
   - "违反本规定者，将依据..." 而非 "不遵守的话会..."
4. 开场可用"本次培训将系统解读..."，而非"今天我们来学习..."
5. 保持客观陈述，避免过多语气词

### 内容深度（必须遵守）
1. **条款解读**：原文引用 + 条款释义 + 适用场景说明
2. **流程规范**：明确操作步骤、审批权限、时限要求
3. **典型案例**：合规案例与违规案例对照分析
4. **责任后果**：明确违规的处理措施及依据

### 格式要求
1. **格式**：使用 Markdown 格式
2. **结构**：按照内容安排组织，层次清晰
3. **条款引用**：使用引用格式 \`> 第X条：原文内容\`
4. **重点标注**：关键条款用 **加粗** 强调
5. **分页**：每个部分用 \`---\` 分隔（幻灯片分页标记）

### 重要提示
1. 必须系统解读每个核心条款
2. 引用制度原文时需准确
3. 每页内容要充实（每个部分至少 150-300 字）
4. 整体风格应体现制度的权威性和严肃性
5. **不要引用图片**：不要说"这张图"、"请看图"、"流程图展示"等。但要用详细的文字描述来讲解流程和制度，内容量不能减少

请直接输出 Markdown 内容，不要有额外解释。`,
  },

  legal_training: {
    name: '普法讲座',
    audienceLabel: '普通群众',
    speakingStyle: '通俗易懂、生动有趣',
    prompt: `你是一位经验丰富的普法讲师，擅长用通俗易懂的语言向普通群众讲解法律知识。请根据以下规划和法律条文，撰写一份生动、实用的普法讲座讲稿。

## 讲座规划
主题：{chapter}
受众：{grade}
类型：{subject}
时长：{duration}

讲座目标：
{goals}

核心法条：
{concepts}

内容安排：
{sections}

## 法律要点（必须覆盖）
{keyPoints}

## 内容摘要
{summary}

## 法律条文内容（RAG 检索结果）
{ragContent}

## 输出要求

### 语言风格（必须遵守）
1. **使用通俗易懂的大白话**，避免过多法律术语
2. 多用生活化的比喻和例子，如：
   - "这就好比我们平时买东西..."
   - "打个比方说..."
   - "大家可能都遇到过这种情况..."
3. 适当使用互动性语言：
   - "大家想一想..."
   - "有没有遇到过这种情况？"
   - "这里要划重点了..."
4. 可以用幽默轻松的方式讲严肃的法律问题
5. 每讲一个法条，都要用"翻译成大白话就是..."来解释

### 内容结构（必须遵守）
1. **法条引用**：先引用原文，格式为 \`> 第X条：原文内容\`
2. **通俗解读**：紧跟"翻译成大白话"的解释
3. **生活案例**：每个重点法条配一个生活中的小故事或案例
4. **维权指南**：告诉听众遇到问题应该怎么做

### 格式要求
1. **格式**：使用 Markdown 格式
2. **结构**：按照内容安排组织，层次清晰
3. **法条引用**：使用引用格式 \`> 第X条：原文内容\`
4. **重点标注**：关键信息用 **加粗** 强调
5. **分页**：每个部分用 \`---\` 分隔（幻灯片分页标记）

### 重要提示
1. 必须让普通人能听懂，不能太专业
2. 多讲故事、少念条文
3. 每页内容要充实（每个部分至少 150-300 字）
4. 让听众觉得"法律和我有关"、"学到了有用的东西"
5. **不要引用图片**：不要说"这张图"、"请看图"、"如图所示"等。但要用通俗的文字和案例来详细讲解，内容量不能减少

请直接输出 Markdown 内容，不要有额外解释。`,
  },

  general: {
    name: '通用演示',
    audienceLabel: '受众',
    speakingStyle: '清晰、专业',
    prompt: `你是一位专业的演示文稿撰写专家。请根据以下规划和内容资料，撰写一份清晰、有条理的演示讲稿。

## 演示规划
主题：{chapter}
受众：{grade}
领域：{subject}
时长：{duration}

演示目标：
{goals}

核心要点：
{concepts}

内容安排：
{sections}

## 内容要点（必须覆盖）
{keyPoints}

## 内容摘要
{summary}

## 相关资料（RAG 检索结果）
{ragContent}

## 输出要求

### 语言风格
1. 使用清晰、专业的语言
2. 逻辑清晰，层次分明
3. 适当使用过渡语，如"接下来我们看..."、"这里有个重点..."

### 内容深度（必须遵守）
1. **每个要点必须详细展开**，不能只写标题
2. **概念要解释清楚**：是什么、为什么重要
3. **有数据/案例支撑**：增加说服力

### 格式要求
1. **格式**：使用 Markdown 格式
2. **结构**：按照内容安排组织
3. **分页**：每个部分用 \`---\` 分隔（幻灯片分页标记）

### 重要提示
1. 必须详细讲解每个部分
2. 每页内容要充实（每个部分至少 150-300 字）
3. **不要引用图片**：不要说"这张图"、"请看图"、"如图所示"等。但要用详细的文字描述来讲解概念，内容量不能减少

请直接输出 Markdown 内容，不要有额外解释。`,
  },
};

/** 获取场景 Prompt */
function getScenePrompt(sceneType: string): string {
  const config = SCENE_PROMPTS[sceneType] || SCENE_PROMPTS.general;
  return config.prompt;
}

// ==================== 核心函数 ====================

/**
 * 生成教学手稿（带 RAG 检索）
 */
export async function generateManuscript(input: ManuscriptInput): Promise<ManuscriptResult> {
  try {
    configureLLM();

    const llm = new OpenAI({
      model: process.env.OPENAI_MODEL || 'qwen-plus',
      apiKey: process.env.OPENAI_API_KEY!,
      baseURL: process.env.OPENAI_API_BASE || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });

    const { plan, knowledgeBaseId, chapterKeyPoints, chapterSummary, chapterContent } = input;

    // 1. 格式化章节重点
    const keyPointsStr = formatKeyPoints(chapterKeyPoints);

    // 2. 通过 RAG 检索每个节次的相关教材内容
    let ragContent = '';
    if (knowledgeBaseId) {
      ragContent = await fetchSectionMaterials(knowledgeBaseId, plan);
    }

    // 如果 RAG 内容不足，使用传入的 chapterContent 作为备选
    if (ragContent.length < 500 && chapterContent) {
      ragContent = chapterContent; // 不再截断，保留完整内容
    }

    // 3. 根据场景类型获取对应的 Prompt 模板
    const sceneType = plan.sceneType || 'general';
    const promptTemplate = getScenePrompt(sceneType);
    
    // 验证场景类型是否有效
    if (!SCENE_PROMPTS[sceneType]) {
      console.warn(`[ManuscriptGenerator] Unknown scene type: ${sceneType}, falling back to general`);
    }

    // 4. 构建 prompt
    const prompt = promptTemplate
      .replace('{chapter}', plan.chapter)
      .replace('{grade}', plan.constraints.grade)
      .replace('{subject}', plan.constraints.subject)
      .replace('{duration}', plan.constraints.duration)
      .replace('{goals}', plan.teaching_goals.map((g, i) => `${i + 1}. ${g}`).join('\n'))
      .replace('{concepts}', plan.key_concepts.join('、'))
      .replace('{sections}', formatSections(plan.sections))
      .replace('{keyPoints}', keyPointsStr || '（暂无，请根据内容自行提取）')
      .replace('{summary}', chapterSummary || '（暂无）')
      .replace('{ragContent}', ragContent || '（暂无检索结果，请根据规划生成）');


    const response = await llm.complete({ prompt });
    let markdown = response.text.trim();

    // 清理可能的 markdown 代码块包装
    markdown = cleanMarkdown(markdown);


    return {
      success: true,
      markdown,
    };
  } catch (error: any) {
    console.error('[ManuscriptGenerator] Error:', error);
    return {
      success: false,
      markdown: null,
      error: error.message || '讲稿生成失败',
    };
  }
}

// ==================== RAG 检索函数 ====================

/**
 * 通过 RAG 检索每个节次的相关教材内容
 */
async function fetchSectionMaterials(
  knowledgeBaseId: string,
  plan: TeachingPlan
): Promise<string> {
  try {
    const index = await loadIndex(knowledgeBaseId);
    const allContent: string[] = [];
    const seenContent = new Set<string>();

    // 对每个节次进行检索
    for (const section of plan.sections) {
      // 构造查询：节次标题 + 要点
      const queryParts = [section.title];
      if (section.key_points.length > 0) {
        queryParts.push(...section.key_points.slice(0, 3));
      }
      const query = queryParts.join(' ');


      const results = await hybridSearch(index, knowledgeBaseId, query, {
        vectorTopK: 4,
        keywordLimit: 2,
        minVectorScore: 0.3,
      });

      for (const result of results) {
        // 去重
        const contentKey = result.content.substring(0, 80);
        if (!seenContent.has(contentKey)) {
          seenContent.add(contentKey);
          allContent.push(`【${section.title}相关】\n${result.content}`);
        }
      }
    }

    // 再做一次整体检索（章节标题 + 核心概念）
    const overallQuery = `${plan.chapter} ${plan.key_concepts.slice(0, 3).join(' ')}`;
    const overallResults = await hybridSearch(index, knowledgeBaseId, overallQuery, {
      vectorTopK: 5,
      keywordLimit: 3,
      minVectorScore: 0.35,
    });

    for (const result of overallResults) {
      const contentKey = result.content.substring(0, 80);
      if (!seenContent.has(contentKey)) {
        seenContent.add(contentKey);
        allContent.push(`【章节概述相关】\n${result.content}`);
      }
    }

    // 拼接所有内容（不再截断）
    const combined = allContent.join('\n\n---\n\n');
    return combined;

  } catch (error: any) {
    console.error('[ManuscriptGenerator] RAG fetch error:', error);
    return '';
  }
}

// ==================== 辅助函数 ====================

/**
 * 格式化章节重点
 */
function formatKeyPoints(keyPoints?: KeyPoint[]): string {
  if (!keyPoints || keyPoints.length === 0) {
    return '';
  }

  const typeLabels: Record<string, string> = {
    concept: '📚 概念',
    formula: '📐 公式',
    example: '📝 例题',
    pitfall: '⚠️ 易错点',
    method: '💡 方法',
  };

  return keyPoints.map(kp => {
    const typeLabel = typeLabels[kp.type] || kp.type;
    const importance = kp.importance === 'high' ? '【重要】' : '';
    return `- ${typeLabel}${importance}：${kp.title}\n  ${kp.content}`;
  }).join('\n\n');
}

/**
 * 格式化节次安排
 */
function formatSections(sections: SectionPlan[]): string {
  return sections.map((s, i) => {
    const duration = s.duration_minutes ? `（${s.duration_minutes}分钟）` : '';
    const points = s.key_points.length > 0 ? `\n   要点: ${s.key_points.join('、')}` : '';
    return `${i + 1}. [${s.type}] ${s.title}${duration}${points}`;
  }).join('\n');
}

/**
 * 清理 Markdown 输出
 */
function cleanMarkdown(text: string): string {
  // 移除可能的代码块包装
  let cleaned = text;
  
  // 移除开头的 ```markdown
  if (cleaned.startsWith('```markdown')) {
    cleaned = cleaned.slice('```markdown'.length);
  } else if (cleaned.startsWith('```md')) {
    cleaned = cleaned.slice('```md'.length);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  
  // 移除结尾的 ```
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  
  return cleaned.trim();
}

/**
 * 截断内容
 */
function truncateContent(content: string, maxLength: number): string {
  if (content.length <= maxLength) {
    return content;
  }
  return content.slice(0, maxLength) + '\n\n...[内容过长，已截断]';
}
