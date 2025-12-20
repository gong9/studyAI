/**
 * LLM 讲解 Agent
 * 根据幻灯片内容生成讲解指令
 */
//@ts-ignore
import OpenAI from 'openai';
import type { 
  LectureAction, 
  LectureAgentInput, 
  LectureAgentOutput,
  SlideInfo,
  SlideElement 
} from './types';

const client = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
});

const LECTURE_PROMPT = `你是一位专业的教学讲解助手。你的任务是根据当前幻灯片的内容，生成讲解指令序列。

## 输入信息
- 当前幻灯片内容和元素
- 已讲解的元素列表
- 是否为第一页/最后一页

## 输出要求
你需要输出一个 JSON 对象，包含 actions 数组。每个 action 是以下类型之一：

1. **speak** - 语音讲解
   {"action": "speak", "text": "要讲解的内容"}
   
2. **highlight** - 高亮元素
   {"action": "highlight", "target": "元素ID"}
   
3. **next_slide** - 翻到下一页
   {"action": "next_slide"}
   
4. **end** - 结束讲解
   {"action": "end"}

## 讲解原则
1. 每个幻灯片先讲标题，再按顺序讲解各个元素
2. 讲解前先高亮对应元素，让学生知道在讲什么
3. 讲解语言要口语化、亲切，像老师在课堂上讲课
4. 遇到公式或专业术语要解释清楚
5. 一个幻灯片讲完后再翻页
6. 最后一页讲完后输出 end

## 重要：根据页面位置调整开场白
- **第一页**：用欢迎语开场，如"同学们，今天我们来学习..."
- **中间页**：直接讲内容，如"接下来我们看..."、"好，下面讲..."
- **最后一页**：讲完内容后总结，如"好，这节课就到这里..."

## 输出格式（严格 JSON）

### 第一页示例：
{
  "actions": [
    {"action": "highlight", "target": "slide-0-el-0"},
    {"action": "speak", "text": "同学们，今天我们来学习小数的认识"},
    {"action": "highlight", "target": "slide-0-el-1"},
    {"action": "speak", "text": "首先，我们看第一个知识点..."},
    {"action": "next_slide"}
  ]
}

### 中间页示例（不要用欢迎语！）：
{
  "actions": [
    {"action": "highlight", "target": "slide-1-el-0"},
    {"action": "speak", "text": "接下来我们看小数的读法"},
    {"action": "highlight", "target": "slide-1-el-1"},
    {"action": "speak", "text": "读小数时，整数部分按整数读法读..."},
    {"action": "next_slide"}
  ]
}`;

// 解析幻灯片内容，提取元素信息
export function parseSlideElements(content: string, slideIndex: number): SlideElement[] {
  const elements: SlideElement[] = [];
  let elementIndex = 0;
  
  const lines = content.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    // 标题
    const titleMatch = trimmed.match(/^(#+)\s+(.+)$/);
    if (titleMatch) {
      elements.push({
        id: `slide-${slideIndex}-el-${elementIndex++}`,
        type: 'title',
        content: titleMatch[2],
      });
      continue;
    }
    
    // 列表项
    if (trimmed.startsWith('- ') || /^\d+\.\s/.test(trimmed)) {
      elements.push({
        id: `slide-${slideIndex}-el-${elementIndex++}`,
        type: 'list',
        content: trimmed.replace(/^[-\d.]+\s*/, ''),
      });
      continue;
    }
    
    // 图片
    const imageMatch = trimmed.match(/!\[([^\]]*)\]\(([^)]+)\)/);
    if (imageMatch) {
      elements.push({
        id: `slide-${slideIndex}-el-${elementIndex++}`,
        type: 'image',
        content: imageMatch[1] || '图片',
      });
      continue;
    }
    
    // 公式
    if (trimmed.includes('$') || trimmed.includes('\\frac')) {
      elements.push({
        id: `slide-${slideIndex}-el-${elementIndex++}`,
        type: 'formula',
        content: trimmed,
      });
      continue;
    }
    
    // 表格
    if (trimmed.startsWith('|')) {
      // 简单处理：把表格作为一个元素
      if (!elements.find(e => e.type === 'table')) {
        elements.push({
          id: `slide-${slideIndex}-el-${elementIndex++}`,
          type: 'table',
          content: '表格内容',
        });
      }
      continue;
    }
    
    // 普通文本
    if (trimmed.length > 10) {  // 忽略太短的行
      elements.push({
        id: `slide-${slideIndex}-el-${elementIndex++}`,
        type: 'text',
        content: trimmed,
      });
    }
  }
  
  return elements;
}

// 生成讲解指令
export async function generateLectureActions(
  input: LectureAgentInput
): Promise<LectureAgentOutput> {
  const { currentSlide, lecturedElements, isFirstSlide, isLastSlide } = input;
  
  // 构建上下文
  const slideContext = `
## 当前幻灯片（第 ${currentSlide.index + 1} 页）

### 标题
${currentSlide.title}

### 元素列表
${currentSlide.elements.map(el => `- [${el.id}] (${el.type}): ${el.content}`).join('\n')}

### 状态
- 位置：${isFirstSlide ? '第一页' : isLastSlide ? '最后一页' : '中间页'}
- 已讲解元素：${lecturedElements.length > 0 ? lecturedElements.join(', ') : '无'}
`;

  try {
    const response = await client.chat.completions.create({
      model: 'qwen-turbo',
      messages: [
        { role: 'system', content: LECTURE_PROMPT },
        { role: 'user', content: slideContext },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 1500,
    });

    const content = response.choices[0]?.message?.content || '{}';
    const result = JSON.parse(content);
    
    return {
      actions: result.actions || [],
    };
  } catch (error: any) {
    console.error('[LectureAgent] Error:', error);
    
    // 降级：生成简单的讲解指令
    return generateFallbackActions(currentSlide, isLastSlide, isFirstSlide);
  }
}

// 降级方案：生成简单的讲解指令
function generateFallbackActions(
  slide: SlideInfo, 
  isLastSlide: boolean,
  isFirstSlide: boolean = false
): LectureAgentOutput {
  const actions: LectureAction[] = [];
  
  // 讲解标题
  const titleElement = slide.elements.find(e => e.type === 'title');
  if (titleElement) {
    actions.push({ action: 'highlight', target: titleElement.id });
    // 第一页用欢迎语，其他页直接讲
    if (isFirstSlide) {
      actions.push({ action: 'speak', text: `同学们，今天我们来学习：${titleElement.content}` });
    } else {
      actions.push({ action: 'speak', text: `接下来我们看：${titleElement.content}` });
    }
  }
  
  // 讲解其他元素
  for (const element of slide.elements) {
    if (element.type === 'title') continue;
    
    actions.push({ action: 'highlight', target: element.id });
    
    switch (element.type) {
      case 'list':
        actions.push({ action: 'speak', text: element.content });
        break;
      case 'image':
        actions.push({ action: 'speak', text: `请看这张图：${element.content}` });
        break;
      case 'formula':
        actions.push({ action: 'speak', text: `这里有一个公式，${element.content}` });
        break;
      case 'table':
        actions.push({ action: 'speak', text: '请看表格中的内容' });
        break;
      default:
        actions.push({ action: 'speak', text: element.content });
    }
  }
  
  // 翻页或结束
  if (isLastSlide) {
    actions.push({ action: 'speak', text: '好，这节课的内容就讲到这里，同学们有什么问题吗？' });
    actions.push({ action: 'end' });
  } else {
    actions.push({ action: 'speak', text: '好，我们继续看下一页' });
    actions.push({ action: 'next_slide' });
  }
  
  return { actions };
}

// 快速生成单页讲解（用于测试）
export async function generateQuickLecture(
  slideContent: string,
  slideIndex: number,
  isLast: boolean = false
): Promise<LectureAction[]> {
  const elements = parseSlideElements(slideContent, slideIndex);
  const titleElement = elements.find(e => e.type === 'title');
  
  const slideInfo: SlideInfo = {
    index: slideIndex,
    content: slideContent,
    title: titleElement?.content || `第 ${slideIndex + 1} 页`,
    elements,
  };
  
  const result = await generateLectureActions({
    currentSlide: slideInfo,
    lecturedElements: [],
    isFirstSlide: slideIndex === 0,
    isLastSlide: isLast,
  });
  
  return result.actions;
}

// ====== 完整演讲稿生成 ======

const FULL_SCRIPT_PROMPT = `你是一位优秀的小学数学老师，正在准备一堂精彩的课。

## 你的任务
根据提供的 PPT 幻灯片内容，生成一份完整的、专业的演讲稿。

## 输入
你会收到所有幻灯片的内容和元素列表。每个元素都有一个唯一的 ID（如 slide-0-el-0）。

## 输出要求
生成一个 JSON 对象，包含 slides 数组。每个 slide 包含该页的讲解指令序列。

## 讲解原则
1. **不要照着 PPT 读！** 要像真正的老师一样，用自己的话讲解
2. **扩展内容**：PPT 上写"小数的认识"，你要解释什么是小数、为什么要学、生活中哪里用到
3. **循序渐进**：先引入概念，再举例说明，最后总结
4. **互动引导**：适当加入"同学们想一想"、"大家看这里"等引导语
5. **高亮配合**：讲到某个知识点时，先高亮对应元素，再开始讲解
6. **过渡自然**：页与页之间要有过渡语

## 指令类型
1. {"action": "speak", "text": "讲解内容"} - 语音讲解（内容要丰富、口语化）
2. {"action": "highlight", "target": "slide-X-el-Y"} - 高亮元素
3. {"action": "next_slide"} - 翻页
4. {"action": "end"} - 结束

## 输出格式
{
  "slides": [
    {
      "index": 0,
      "actions": [
        {"action": "speak", "text": "同学们好！今天我们来学习一个非常有趣的数学知识——小数。大家在生活中见过小数吗？比如超市里的价格标签，3.5元、2.8元，这些就是小数。"},
        {"action": "highlight", "target": "slide-0-el-0"},
        {"action": "speak", "text": "我们先来看今天要学习的主题：小数的认识。"},
        {"action": "highlight", "target": "slide-0-el-1"},
        {"action": "speak", "text": "那什么是小数呢？简单来说，小数就是用来表示不满一个整数的数..."},
        {"action": "next_slide"}
      ]
    },
    {
      "index": 1,
      "actions": [
        {"action": "speak", "text": "好，我们继续。刚才我们了解了什么是小数，现在来看看小数怎么读。"},
        {"action": "highlight", "target": "slide-1-el-0"},
        ...
      ]
    }
  ]
}

## 注意
- 每页的讲解内容要有深度，不是简单复述 PPT
- 讲解时长要合适，每页大约 30-60 秒的讲解内容
- 最后一页要有课堂总结`;

// 进度回调类型
export type ProgressCallback = (progress: {
  stage: 'parsing' | 'generating' | 'validating' | 'done';
  message: string;
  percent: number;
}) => void;

// 生成完整演讲稿（包含所有页的指令）
export async function generateFullLectureScript(
  slides: SlideInfo[],
  onProgress?: ProgressCallback
): Promise<{ slides: { index: number; actions: LectureAction[] }[] }> {
  
  // 发送进度
  onProgress?.({ stage: 'parsing', message: '正在分析幻灯片内容...', percent: 10 });
  
  // 构建所有幻灯片的内容
  const slidesContext = slides.map((slide, idx) => {
    const position = idx === 0 ? '【第一页/开场】' : 
                    idx === slides.length - 1 ? '【最后一页/总结】' : 
                    `【第 ${idx + 1} 页】`;
    
    return `
${position}
标题: ${slide.title}
元素列表:
${slide.elements.map(el => `  - [${el.id}] (${el.type}): ${el.content}`).join('\n')}
原始内容:
${slide.content.slice(0, 500)}${slide.content.length > 500 ? '...' : ''}
`;
  }).join('\n---\n');

  const userMessage = `
## 幻灯片内容（共 ${slides.length} 页）

${slidesContext}

请生成完整的演讲稿，记住：
1. 不要照读 PPT，要用老师的口吻讲解
2. 每讲一个知识点前先高亮对应元素
3. 讲解内容要比 PPT 文字丰富
4. 页与页之间要有过渡
`;

  try {
    console.log('[LectureAgent] 生成完整演讲稿...');
    onProgress?.({ stage: 'generating', message: `正在为 ${slides.length} 页幻灯片生成讲解稿...`, percent: 30 });
    
    const response = await client.chat.completions.create({
      model: 'qwen-plus', // 用更强的模型生成完整演讲稿
      messages: [
        { role: 'system', content: FULL_SCRIPT_PROMPT },
        { role: 'user', content: userMessage },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.8,
      max_tokens: 8000,
    });

    onProgress?.({ stage: 'validating', message: 'AI 生成完成，正在验证格式...', percent: 80 });

    const content = response.choices[0]?.message?.content || '{}';
    const result = JSON.parse(content);
    
    console.log(`[LectureAgent] 演讲稿生成完成，共 ${result.slides?.length || 0} 页`);
    
    // 验证并补全
    if (!result.slides || !Array.isArray(result.slides)) {
      throw new Error('生成的演讲稿格式不正确');
    }
    
    // 确保每页都有 actions，并补充 next_slide
    const validatedSlides = result.slides.map((slide: any, idx: number) => {
      const actions = slide.actions || [];
      
      // 确保最后有翻页或结束指令
      const lastAction = actions[actions.length - 1];
      if (idx < slides.length - 1) {
        if (!lastAction || lastAction.action !== 'next_slide') {
          actions.push({ action: 'next_slide' });
        }
      } else {
        if (!lastAction || lastAction.action !== 'end') {
          actions.push({ action: 'speak', text: '好，今天的课就到这里，同学们下课后可以做做练习巩固一下。有问题随时问老师，下课！' });
          actions.push({ action: 'end' });
        }
      }
      
      return {
        index: idx,
        actions,
      };
    });
    
    onProgress?.({ stage: 'done', message: '演讲稿准备就绪！', percent: 100 });
    
    return { slides: validatedSlides };
    
  } catch (error: any) {
    console.error('[LectureAgent] 生成演讲稿失败:', error);
    
    // 降级：为每页生成简单讲解
    console.log('[LectureAgent] 降级到逐页生成模式');
    const fallbackSlides = slides.map((slide, idx) => {
      const isFirst = idx === 0;
      const isLast = idx === slides.length - 1;
      const result = generateFallbackActions(slide, isLast, isFirst);
      return {
        index: idx,
        actions: result.actions,
      };
    });
    
    return { slides: fallbackSlides };
  }
}

