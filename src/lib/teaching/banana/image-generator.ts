/**
 * @deprecated 此模块已废弃，请使用 @/lib/teaching/remotion/slide-generator 代替
 * 
 * Banana PPT 图片生成器（旧版）
 * 
 * 使用 Gemini 图像模型根据 Slidev Markdown 内容生成精美的 PPT 页面图片
 * 此方案成本较高且灵活性有限，已被 Remotion HTML 方案替代。
 * 
 * 保留此文件是为了兼容已使用旧方案发布的课程。
 * 新课程请使用 Remotion HTML 方案（通过 /api/teaching/manuscript/[id]/banana 自动使用新方案）
 * 
 * 环境变量配置（独立于主项目的 OpenAI 配置）：
 * - BANANA_API_KEY: API 密钥（默认使用 NANO_BANANA_KEY）
 * - BANANA_API_BASE: API 基础 URL（默认 https://aihubmix.com/v1）
 * - BANANA_IMAGE_MODEL: 图像生成模型（默认 gemini-2.0-flash-exp-image-generation）
 */

import OpenAI from "openai";
import * as fs from "fs/promises";
import * as path from "path";

// Initialize OpenAI client with Banana-specific configuration
// 使用独立的环境变量，避免与主项目的 OPENAI_* 配置冲突
const client = new OpenAI({
  apiKey: process.env.BANANA_API_KEY || process.env.NANO_BANANA_KEY,
  baseURL: process.env.BANANA_API_BASE || "https://aihubmix.com/v1",
});

const IMAGE_MODEL = process.env.BANANA_IMAGE_MODEL || "gemini-2.0-flash-exp-image-generation";

// ==================== 类型定义 ====================

export interface SlideContent {
  title: string;
  content: string;
  index: number;
}

export interface GenerateProgress {
  current: number;
  total: number;
  message: string;
}

// ==================== 解析函数 ====================

/**
 * 从 Slidev Markdown 解析出每页内容
 */
export function parseSlidevToSlides(slidevMd: string): SlideContent[] {
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
      
      for (const line of lines) {
        const trimmed = line.trim();
        // 提取标题
        if ((trimmed.startsWith('# ') || trimmed.startsWith('## ')) && !title) {
          title = trimmed.replace(/^#+\s*/, '');
        } 
        // 跳过 visual/diagram 等标记
        else if (trimmed && !trimmed.startsWith('>')) {
          contentLines.push(trimmed);
        }
      }
      
      return {
        title: title || `第 ${index + 1} 页`,
        content: contentLines.join('\n'),
        index,
      };
    })
    .filter(Boolean) as SlideContent[];
}

// ==================== 图片生成 ====================

/**
 * 生成单页 PPT 的图片 prompt
 */
export function generateImagePrompt(
  slide: SlideContent,
  allSlides: SlideContent[],
  totalSlides: number
): string {
  const outlineText = allSlides
    .map((s, i) => `${i + 1}. ${s.title}`)
    .join('\n');

  return `
你是一位专家级UI UX演示设计师，专注于生成设计良好的PPT页面。

当前PPT页面的页面描述如下:
<page_description>
页面标题：${slide.title}
页面文字：
${slide.content}
</page_description>

整个PPT的大纲为：
${outlineText}

当前是第 ${slide.index + 1}/${totalSlides} 页

<design_guidelines>
- 【重要】输出超高清 4K 分辨率图像（3840×2160 像素），确保文字边缘锐利清晰，无任何模糊。
- 画面比例严格为 16:9。
- 配色和设计语言和模板图片严格相似。
- 根据内容自动设计最完美的构图，不重不漏地渲染"页面描述"中的文本。
- 文字排版要专业，字体大小适中，行距舒适，确保在投影时清晰可读。
- 如非必要，禁止出现 markdown 格式符号（如 # 和 * 等）。
- 只参考模板的风格设计，禁止出现模板中的原有文字。
- 使用大小恰当的装饰性图形或插画对空缺位置进行填补。
- PPT文字使用全中文。
</design_guidelines>
`;
}

/**
 * 生成单页 PPT 图片
 */
export async function generatePageImage(
  prompt: string,
  templateBase64: string
): Promise<string> {
  const response = await client.chat.completions.create({
    model: IMAGE_MODEL,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: {
              url: `data:image/png;base64,${templateBase64}`,
            },
          },
        ],
      },
    ],
  });

  // Extract image from response
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const message = response.choices[0]?.message as any;
  
  // Gemini returns image in multi_mod_content[].inline_data.data
  if (message?.multi_mod_content && Array.isArray(message.multi_mod_content)) {
    for (const item of message.multi_mod_content) {
      if (item?.inline_data?.data) {
        return item.inline_data.data;
      }
    }
  }
  
  // Fallback: check content field
  const content = message?.content;
  if (content && content.length > 0) {
    // Check if it's a base64 image data URL
    if (content.includes("data:image")) {
      const match = content.match(/data:image\/[^;]+;base64,([A-Za-z0-9+/=]+)/);
      if (match) {
        return match[1];
      }
    }
    // Return raw content if it looks like base64
    if (/^[A-Za-z0-9+/=]+$/.test(content.substring(0, 100))) {
      return content;
    }
  }
  
  console.error("[Banana] No image content found in response:", JSON.stringify(message).substring(0, 500));
  throw new Error("Failed to generate image");
}

/**
 * 读取模板图片
 */
export async function loadTemplate(templateId: string = "default"): Promise<string> {
  // 尝试不同的扩展名
  const extensions = ['.png', '.jpg', '.jpeg'];
  
  for (const ext of extensions) {
    const templatePath = path.join(process.cwd(), "public/templates", `${templateId}${ext}`);
    try {
      const templateBuffer = await fs.readFile(templatePath);
      console.log(`[Banana] Loaded template: ${templatePath}`);
      return templateBuffer.toString("base64");
    } catch {
      // 继续尝试下一个扩展名
    }
  }
  
  throw new Error(`Template not found: ${templateId}`);
}

/**
 * 批量生成所有页面图片
 */
export async function generateAllSlideImages(
  slidevMd: string,
  templateId: string = "default",
  onProgress?: (progress: GenerateProgress) => void
): Promise<string[]> {
  const slides = parseSlidevToSlides(slidevMd);
  const totalSlides = slides.length;
  
  if (totalSlides === 0) {
    throw new Error("No slides found in markdown");
  }
  
  console.log(`[Banana] Parsing complete: ${totalSlides} slides`);
  
  // 读取模板图片
  const templateBase64 = await loadTemplate(templateId);
  
  const images: string[] = [];
  
  // 逐页生成（避免并发过高导致 API 限流）
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    
    onProgress?.({
      current: i + 1,
      total: totalSlides,
      message: `正在生成第 ${i + 1}/${totalSlides} 页: ${slide.title}`,
    });
    
    console.log(`[Banana] Generating slide ${i + 1}/${totalSlides}: ${slide.title}`);
    
    const prompt = generateImagePrompt(slide, slides, totalSlides);
    const image = await generatePageImage(prompt, templateBase64);
    
    images.push(image);
    
    console.log(`[Banana] Slide ${i + 1} generated successfully`);
  }
  
  return images;
}

