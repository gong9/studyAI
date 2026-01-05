/**
 * 翻译服务
 * 
 * 将中文 HTML 幻灯片和演讲稿翻译成英文
 * 保持 HTML 结构不变，只翻译文本内容
 */

import OpenAI from 'openai';

// 使用阿里云 DashScope
const client = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
});

// ==================== 类型定义 ====================

export interface HtmlSlide {
  index: number;
  title: string;
  html: string;
}

export interface LectureAction {
  action: 'speak' | 'highlight' | 'next_slide' | 'end';
  text?: string;
  target?: string;
}

export interface LectureSlide {
  index: number;
  actions: LectureAction[];
}

export interface LectureScript {
  slides: LectureSlide[];
}

// 进度回调
export type TranslateProgressCallback = (progress: {
  stage: 'slides' | 'script' | 'done';
  current: number;
  total: number;
  message: string;
}) => void;

// ==================== 翻译函数 ====================

/**
 * 翻译单个文本
 */
export async function translateText(text: string): Promise<string> {
  if (!text || text.trim().length === 0) {
    return text;
  }

  const response = await client.chat.completions.create({
    model: 'qwen-plus',
    messages: [
      {
        role: 'system',
        content: `你是专业的翻译专家。请将中文翻译成流畅、自然的英文。

规则：
1. 保持专业术语的准确性
2. 翻译要口语化、自然，适合演讲场景
3. 只输出翻译结果，不要添加任何解释`,
      },
      {
        role: 'user',
        content: text,
      },
    ],
    temperature: 0.3,
    max_tokens: 2000,
  });

  return response.choices[0]?.message?.content?.trim() || text;
}

/**
 * 翻译单个 HTML 幻灯片
 * 保持 HTML 结构和样式不变，只翻译文本内容
 */
export async function translateHtmlSlide(html: string): Promise<string> {
  if (!html || html.trim().length === 0) {
    return html;
  }

  const response = await client.chat.completions.create({
    model: 'qwen-plus',
    messages: [
      {
        role: 'system',
        content: `你是专业的翻译专家。请将以下 HTML 中的中文文本翻译成英文。

**关键规则：**
1. 只翻译文本内容，保持所有 HTML 标签和 style 属性完全不变
2. 保持专业术语的准确性（如 Multi-Agent System、LLM 等保持英文）
3. 页码格式改为英文（如 "第 1 页，共 12 页" -> "Page 1 of 12"）
4. "第X页" -> "Page X"
5. 直接输出翻译后的完整 HTML，不要添加任何解释或 markdown 标记
6. 不要改变任何 HTML 结构、class、style 属性
7. 如果文本已经是英文，保持不变`,
      },
      {
        role: 'user',
        content: html,
      },
    ],
    temperature: 0.2,
    max_tokens: 8000,
  });

  let result = response.choices[0]?.message?.content?.trim() || html;
  
  // 清理可能的 markdown 代码块标记
  result = result.replace(/^```html?\n?/i, '').replace(/\n?```$/i, '').trim();
  
  return result;
}

/**
 * 批量翻译所有 HTML 幻灯片
 */
export async function translateHtmlSlides(
  slides: HtmlSlide[],
  onProgress?: TranslateProgressCallback
): Promise<HtmlSlide[]> {
  const translatedSlides: HtmlSlide[] = [];

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    
    onProgress?.({
      stage: 'slides',
      current: i + 1,
      total: slides.length,
      message: `翻译幻灯片 ${i + 1}/${slides.length}: ${slide.title}`,
    });

    console.log(`[Translate] 翻译幻灯片 ${i + 1}/${slides.length}: ${slide.title}`);

    try {
      const translatedTitle = await translateText(slide.title);
      const translatedHtml = await translateHtmlSlide(slide.html);

      translatedSlides.push({
        index: slide.index,
        title: translatedTitle,
        html: translatedHtml,
      });
    } catch (error: any) {
      console.error(`[Translate] 翻译幻灯片 ${i + 1} 失败:`, error.message);
      // 翻译失败时保留原文
      translatedSlides.push(slide);
    }

    // 避免请求过快
    if (i < slides.length - 1) {
      await delay(500);
    }
  }

  return translatedSlides;
}

/**
 * 翻译演讲稿中的所有 speak 文本
 */
export async function translateLectureScript(
  script: LectureScript,
  onProgress?: TranslateProgressCallback
): Promise<LectureScript> {
  // 收集所有需要翻译的文本
  const textsToTranslate: { slideIdx: number; actionIdx: number; text: string }[] = [];

  for (const slide of script.slides) {
    for (let actionIdx = 0; actionIdx < slide.actions.length; actionIdx++) {
      const action = slide.actions[actionIdx];
      if (action.action === 'speak' && action.text) {
        textsToTranslate.push({
          slideIdx: slide.index,
          actionIdx,
          text: action.text,
        });
      }
    }
  }

  console.log(`[Translate] 需要翻译 ${textsToTranslate.length} 条演讲文本`);

  // 翻译所有文本
  const translations = new Map<string, string>();

  for (let i = 0; i < textsToTranslate.length; i++) {
    const item = textsToTranslate[i];
    const key = `${item.slideIdx}-${item.actionIdx}`;

    onProgress?.({
      stage: 'script',
      current: i + 1,
      total: textsToTranslate.length,
      message: `翻译演讲稿 ${i + 1}/${textsToTranslate.length}`,
    });

    console.log(`[Translate] 翻译演讲稿 ${i + 1}/${textsToTranslate.length}: ${item.text.substring(0, 30)}...`);

    try {
      const translated = await translateText(item.text);
      translations.set(key, translated);
    } catch (error: any) {
      console.error(`[Translate] 翻译失败:`, error.message);
      translations.set(key, item.text); // 失败时保留原文
    }

    // 避免请求过快
    if (i < textsToTranslate.length - 1) {
      await delay(500);
    }
  }

  // 构建翻译后的 script
  const translatedSlides = script.slides.map((slide) => ({
    ...slide,
    actions: slide.actions.map((action, actionIdx) => {
      if (action.action === 'speak' && action.text) {
        const key = `${slide.index}-${actionIdx}`;
        return {
          ...action,
          text: translations.get(key) || action.text,
        };
      }
      return action;
    }),
  }));

  return { slides: translatedSlides };
}

/**
 * 完整翻译流程：翻译幻灯片 + 演讲稿
 */
export async function translateCourseContent(
  slides: HtmlSlide[],
  script: LectureScript,
  onProgress?: TranslateProgressCallback
): Promise<{
  translatedSlides: HtmlSlide[];
  translatedScript: LectureScript;
}> {
  // 1. 翻译幻灯片
  const translatedSlides = await translateHtmlSlides(slides, onProgress);

  // 2. 翻译演讲稿
  const translatedScript = await translateLectureScript(script, onProgress);

  onProgress?.({
    stage: 'done',
    current: 1,
    total: 1,
    message: '翻译完成',
  });

  return {
    translatedSlides,
    translatedScript,
  };
}

// ==================== 辅助函数 ====================

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

