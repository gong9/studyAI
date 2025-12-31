/**
 * AI 幻灯片生成器
 * 
 * 使用 AI 将 Slidev Markdown 转换为 SlideData[] 结构
 * 替代原有的图像生成方案，成本更低、更灵活
 */

import OpenAI from 'openai';
import type {
  SlideData,
  SlideType,
  SlideStyle,
  ContentBlock,
  SlideGeneratorInput,
  SlideGeneratorOutput,
  ParsedSlide,
  SlideGeneratorConfig,
} from './types';

// 使用与主项目相同的 OpenAI 配置
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_API_BASE || 'https://api.openai.com/v1',
});

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// ==================== 解析 Slidev Markdown ====================

/**
 * 从 Slidev Markdown 解析出每页内容
 */
export function parseSlidevMarkdown(slidevMd: string): ParsedSlide[] {
  let sections = slidevMd.split(/\n---\n/);
  
  // 跳过 frontmatter
  if (sections[0].trim().startsWith('---') || sections[0].includes('theme:')) {
    sections = sections.slice(1);
  }
  
  return sections
    .map((section, index) => {
      if (!section.trim()) return null;
      
      const lines = section.trim().split('\n');
      let title = '';
      const contentLines: string[] = [];
      const elements: ParsedSlide['elements'] = [];
      
      for (const line of lines) {
        const trimmed = line.trim();
        
        // 提取标题
        if ((trimmed.startsWith('# ') || trimmed.startsWith('## ')) && !title) {
          title = trimmed.replace(/^#+\s*/, '');
          elements.push({
            id: `title-${index}`,
            type: 'title',
            content: title,
          });
        }
        // 列表项
        else if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || /^\d+\.\s/.test(trimmed)) {
          const listContent = trimmed.replace(/^[-*]\s|^\d+\.\s/, '');
          elements.push({
            id: `list-${index}-${elements.length}`,
            type: 'list',
            content: listContent,
          });
          contentLines.push(trimmed);
        }
        // 代码块
        else if (trimmed.startsWith('```')) {
          elements.push({
            id: `code-${index}-${elements.length}`,
            type: 'code',
            content: trimmed,
          });
          contentLines.push(trimmed);
        }
        // 图片
        else if (trimmed.startsWith('![')) {
          elements.push({
            id: `image-${index}-${elements.length}`,
            type: 'image',
            content: trimmed,
          });
          contentLines.push(trimmed);
        }
        // 公式
        else if (trimmed.startsWith('$') || trimmed.includes('\\(') || trimmed.includes('\\[')) {
          elements.push({
            id: `formula-${index}-${elements.length}`,
            type: 'formula',
            content: trimmed,
          });
          contentLines.push(trimmed);
        }
        // 普通文本
        else if (trimmed && !trimmed.startsWith('>')) {
          elements.push({
            id: `text-${index}-${elements.length}`,
            type: 'text',
            content: trimmed,
          });
          contentLines.push(trimmed);
        }
      }
      
      return {
        index,
        title: title || `第 ${index + 1} 页`,
        content: contentLines.join('\n'),
        elements,
      };
    })
    .filter(Boolean) as ParsedSlide[];
}

// ==================== AI 生成 SlideData ====================

/**
 * 使用 AI 将解析后的幻灯片转换为 SlideData 结构
 */
export async function generateSlideData(
  parsedSlides: ParsedSlide[],
  config?: SlideGeneratorConfig
): Promise<SlideData[]> {
  const systemPrompt = `你是一位专业的 PPT 设计师，擅长将内容转换为结构化的幻灯片数据。

你需要将输入的幻灯片内容转换为 JSON 格式的 SlideData 数组。

## 可用的幻灯片类型 (type)：
- title: 标题页，用于课程开头或章节标题
- content: 内容页，用于列表、要点等
- twoColumn: 双栏布局，用于对比或图文混排
- quote: 引用页，用于名言或重点结论
- code: 代码页，用于展示代码片段

## 可用的风格 (style)：
- dark: 深色主题，适合大多数内容
- light: 浅色主题，适合正式场合
- gradient: 渐变背景，适合标题页
- minimal: 极简风格，适合专业内容
- vibrant: 活力配色，适合年轻化内容

## 内容块类型 (content 数组中的元素)：
- { "type": "text", "content": "纯文本内容" } - 普通文本段落
- { "type": "list", "items": ["项目1", "项目2"], "ordered": false } - 列表
- { "type": "formula", "latex": "V = \\pi r^2 h" } - 数学公式，使用 LaTeX 语法

## 输出格式：
返回一个 JSON 对象，包含 slides 数组：
{
  "slides": [
    {
      "type": "content",
      "style": "dark",
      "title": "幻灯片标题（不要带 # 号）",
      "content": [
        { "type": "text", "content": "文本内容" },
        { "type": "list", "items": ["项目1", "项目2"], "ordered": false },
        { "type": "formula", "latex": "V = \\pi r^2 h" }
      ]
    }
  ]
}

## 重要规则：
1. **标题不要带 # 号**：title 字段应该是纯文本，不要包含 Markdown 格式
2. **公式使用 formula 类型**：数学公式要用 { "type": "formula", "latex": "..." } 格式，不要放在 text 中
3. **LaTeX 公式要完整**：公式必须是完整的，如 "V = \\pi r^2 h"，不要截断
4. **列表项要简洁**：每个列表项应该是简洁的文本，不要包含 Markdown 格式
5. **不要嵌套结构**：content 数组中的元素应该是扁平的，不要嵌套
6. 第一页通常是 title 类型，使用 gradient 风格
7. 保持风格一致，推荐全部使用 dark 风格
8. 内容要简洁，每页不超过 5-7 个要点`;

  const userPrompt = `请将以下幻灯片内容转换为 SlideData JSON 数组：

${parsedSlides.map((slide, i) => `
### 第 ${i + 1} 页
标题：${slide.title}
内容：
${slide.content}
`).join('\n')}

${config?.defaultStyle ? `偏好风格：${config.defaultStyle}` : ''}

请直接返回 JSON 数组，不要包含其他内容。`;

  try {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content || '{"slides": []}';
    const parsed = JSON.parse(content);
    
    // 处理可能的不同返回格式
    const slides = Array.isArray(parsed) ? parsed : (parsed.slides || []);
    
    // 验证并修复数据
    return slides.map((slide: Partial<SlideData>, index: number) => 
      validateAndFixSlideData(slide, parsedSlides[index])
    );
  } catch (error) {
    console.error('[SlideGenerator] AI 生成失败，使用回退方案:', error);
    // 回退：使用简单的规则转换
    return parsedSlides.map((parsed, index) => 
      fallbackConvert(parsed, index, parsedSlides.length, config)
    );
  }
}

/**
 * 验证并修复 SlideData
 */
function validateAndFixSlideData(
  slide: Partial<SlideData>,
  originalParsed?: ParsedSlide
): SlideData {
  const validTypes: SlideType[] = ['title', 'content', 'twoColumn', 'imageText', 'quote', 'code'];
  const validStyles: SlideStyle[] = ['dark', 'light', 'gradient', 'minimal', 'vibrant'];

  return {
    type: validTypes.includes(slide.type as SlideType) ? slide.type as SlideType : 'content',
    style: validStyles.includes(slide.style as SlideStyle) ? slide.style as SlideStyle : 'dark',
    title: slide.title || originalParsed?.title || '',
    subtitle: slide.subtitle,
    content: Array.isArray(slide.content) ? slide.content : undefined,
    leftContent: Array.isArray(slide.leftContent) ? slide.leftContent : undefined,
    rightContent: Array.isArray(slide.rightContent) ? slide.rightContent : undefined,
    quote: slide.quote,
    author: slide.author,
    codeBlocks: Array.isArray(slide.codeBlocks) ? slide.codeBlocks : undefined,
    background: slide.background,
    animations: slide.animations,
  };
}

/**
 * 回退转换方案：使用简单规则
 */
function fallbackConvert(
  parsed: ParsedSlide,
  index: number,
  total: number,
  config?: SlideGeneratorConfig
): SlideData {
  const defaultStyle = config?.defaultStyle || 'dark';
  
  // 第一页作为标题页
  if (index === 0) {
    return {
      type: 'title',
      style: 'gradient',
      title: parsed.title,
      subtitle: parsed.elements.find(e => e.type === 'text')?.content,
    };
  }

  // 检测是否有代码
  const hasCode = parsed.elements.some(e => e.type === 'code');
  if (hasCode) {
    return {
      type: 'code',
      style: defaultStyle,
      title: parsed.title,
      codeBlocks: parsed.elements
        .filter(e => e.type === 'code')
        .map(e => ({
          type: 'code' as const,
          code: e.content.replace(/```\w*\n?|\n?```/g, ''),
          language: e.content.match(/```(\w+)/)?.[1] || 'text',
        })),
    };
  }

  // 检测是否有引用/金句特征
  const isQuote = parsed.elements.length <= 2 && 
    parsed.content.length < 100 &&
    !parsed.elements.some(e => e.type === 'list');
  
  if (isQuote && index === total - 1) {
    return {
      type: 'quote',
      style: 'gradient',
      quote: parsed.title || parsed.elements[0]?.content || '',
      author: parsed.elements[1]?.content,
    };
  }

  // 默认内容页
  const content: ContentBlock[] = [];
  let currentList: string[] = [];

  for (const element of parsed.elements) {
    if (element.type === 'title') continue;
    
    if (element.type === 'list') {
      currentList.push(element.content);
    } else {
      // 如果有累积的列表项，先添加
      if (currentList.length > 0) {
        content.push({ type: 'list', items: [...currentList] });
        currentList = [];
      }
      
      if (element.type === 'text') {
        content.push({ type: 'text', content: element.content });
      } else if (element.type === 'image') {
        const match = element.content.match(/!\[(.*?)\]\((.*?)\)/);
        if (match) {
          content.push({ type: 'image', src: match[2], alt: match[1] });
        }
      } else if (element.type === 'formula') {
        content.push({ type: 'formula', latex: element.content });
      }
    }
  }

  // 添加剩余的列表项
  if (currentList.length > 0) {
    content.push({ type: 'list', items: currentList });
  }

  return {
    type: 'content',
    style: defaultStyle,
    title: parsed.title,
    content,
  };
}

// ==================== 主入口函数 ====================

/**
 * 生成幻灯片数据
 * 
 * @param input - 输入配置
 * @returns 生成的幻灯片数据
 */
export async function generateSlides(
  input: SlideGeneratorInput
): Promise<SlideGeneratorOutput> {
  console.log('[SlideGenerator] 开始生成幻灯片...');
  
  // 1. 解析 Slidev Markdown
  const parsedSlides = parseSlidevMarkdown(input.slidevMd);
  console.log(`[SlideGenerator] 解析完成: ${parsedSlides.length} 页`);
  
  if (parsedSlides.length === 0) {
    throw new Error('没有可解析的幻灯片内容');
  }
  
  // 2. 使用 AI 生成 SlideData
  const slides = await generateSlideData(parsedSlides, input.config);
  console.log(`[SlideGenerator] 生成完成: ${slides.length} 页`);
  
  return {
    slides,
    totalDuration: slides.length * 30000, // 预估每页 30 秒
  };
}

/**
 * 导出用于直接测试的函数
 */
export { parseSlidevMarkdown as parseSlides };

