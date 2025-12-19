/**
 * 图片生成器
 * 
 * 使用 Nano Banana API 生成教学配图
 */

const API_URL = 'https://hk-api.gptbest.vip/v1/images/generations';
const API_KEY = process.env.NANO_BANANA_API_KEY || 'sk-CWpBoOij0IdTKEDMu7cj5iwWeR2rBabsGjHfkjmSoWiVsXu7';

export interface ImageGenerationResult {
  success: boolean;
  imageUrl?: string;
  error?: string;
}

/**
 * 生成单张图片
 */
export async function generateImage(prompt: string): Promise<ImageGenerationResult> {
  try {
    console.log('[ImageGenerator] Generating image with prompt:', prompt.substring(0, 100) + '...');
    
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: 'nano-banana',
        prompt: prompt,
        response_format: 'url',
        aspect_ratio: '16:9',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[ImageGenerator] API error:', response.status, errorText);
      return {
        success: false,
        error: `API error: ${response.status}`,
      };
    }

    const data = await response.json();
    
    // DALL-E 格式返回
    if (data.data && data.data[0] && data.data[0].url) {
      console.log('[ImageGenerator] Image generated successfully');
      return {
        success: true,
        imageUrl: data.data[0].url,
      };
    }

    console.error('[ImageGenerator] Unexpected response:', data);
    return {
      success: false,
      error: 'Unexpected response format',
    };
  } catch (error: any) {
    console.error('[ImageGenerator] Error:', error);
    return {
      success: false,
      error: error.message || 'Failed to generate image',
    };
  }
}

/**
 * 将教学意图转换为图片生成 prompt
 * @param visualIntent 视觉意图描述
 * @param markerType 标记类型：visual, diagram, image
 */
export function createImagePrompt(visualIntent: string, markerType: string = 'visual'): string {
  const basePrompt = `Educational illustration for teaching: ${visualIntent}.`;
  
  // 根据类型添加特定风格指导
  const styleGuides: Record<string, string> = {
    diagram: `Style: Clean diagram or flowchart. Clear structure showing relationships and hierarchy. 
Use arrows, boxes, and simple geometric shapes. Minimalist design with clear visual hierarchy.
Colors: Professional blue and gray tones with accent colors for emphasis.`,
    visual: `Style: Clean, simple, suitable for classroom presentation. 
Realistic but friendly illustration style.
Colors: Bright, engaging colors.`,
    image: `Style: Photorealistic or high-quality illustration. 
Detailed and visually appealing.
Colors: Natural, vibrant colors.`,
  };
  
  const style = styleGuides[markerType] || styleGuides.visual;
  
  return `${basePrompt}
${style}
No text or labels in the image.
High quality, professional educational illustration.`;
}

/**
 * 处理 Markdown 中的视觉标记并生成图片
 * 支持多种格式：
 * - visual: 描述
 * - > visual: 描述
 * - diagram: 描述
 * - > diagram: 描述
 * - image: 描述
 * - > image: 描述
 */
export async function processVisualMarkers(markdown: string): Promise<string> {
  // 匹配多种格式的视觉标记
  // 支持 visual:、diagram:、image: 三种关键词
  // 支持有或没有 > 引用前缀
  const visualRegex = /^(?:>\s*)?(visual|diagram|image):\s*(.+)$/gim;
  const matches = [...markdown.matchAll(visualRegex)];
  
  if (matches.length === 0) {
    console.log('[ImageGenerator] No visual markers found');
    return markdown;
  }
  
  console.log(`[ImageGenerator] Found ${matches.length} visual markers`);
  
  let result = markdown;
  
  // 限制并发数
  const concurrency = 3;
  const chunks = [];
  for (let i = 0; i < matches.length; i += concurrency) {
    chunks.push(matches.slice(i, i + concurrency));
  }
  
  for (const chunk of chunks) {
    const promises = chunk.map(async (match) => {
      const fullMatch = match[0];
      const markerType = match[1].toLowerCase(); // visual, diagram, image
      const description = match[2].trim();
      
      // 根据类型调整 prompt
      const prompt = createImagePrompt(description, markerType);
      const imageResult = await generateImage(prompt);
      
      if (imageResult.success && imageResult.imageUrl) {
        // 替换标记为图片
        return {
          original: fullMatch,
          replacement: `![${description}](${imageResult.imageUrl})`,
        };
      } else {
        // 保留原始标记作为占位符
        return {
          original: fullMatch,
          replacement: `> 📷 ${description}（图片生成失败）`,
        };
      }
    });
    
    const results = await Promise.all(promises);
    
    for (const { original, replacement } of results) {
      result = result.replace(original, replacement);
    }
    
    // 防止 API 限流
    if (chunks.indexOf(chunk) < chunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  return result;
}

