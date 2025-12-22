/**
 * Banana PPTX 导出器
 * 
 * 将 base64 图片数组打包成 PPTX 文件
 */

import PptxGenJS from "pptxgenjs";

/**
 * 从 base64 图片数组创建 PPTX 文件
 * 每张图片成为一页全屏幻灯片，16:9 比例
 */
export async function createPptxFromImages(
  imageBase64List: string[]
): Promise<Buffer> {
  const pptx = new PptxGenJS();
  
  // Set standard widescreen 16:9 aspect ratio (13.333 x 7.5 inches = 1280 x 720 at 96 DPI)
  pptx.defineLayout({ name: "WIDESCREEN", width: 13.333, height: 7.5 });
  pptx.layout = "WIDESCREEN";
  
  // Set presentation properties
  pptx.author = "AI 备课助手";
  pptx.title = "AI 智能演示文稿";
  pptx.subject = "由 AI 备课助手生成";

  for (const base64 of imageBase64List) {
    const slide = pptx.addSlide();
    
    // Add image to fill entire slide - no sizing to preserve original quality
    slide.addImage({
      data: base64.startsWith("data:") ? base64 : `data:image/png;base64,${base64}`,
      x: 0,
      y: 0,
      w: "100%",
      h: "100%",
    });
  }

  // Generate PPTX as buffer
  const data = await pptx.write({ outputType: "nodebuffer" });
  return data as Buffer;
}

/**
 * 从 base64 图片数组创建 PPTX 并返回 base64 字符串
 */
export async function createPptxBase64(
  imageBase64List: string[]
): Promise<string> {
  const pptx = new PptxGenJS();
  
  pptx.defineLayout({ name: "WIDESCREEN", width: 13.333, height: 7.5 });
  pptx.layout = "WIDESCREEN";
  pptx.author = "AI 备课助手";
  pptx.title = "AI 智能演示文稿";

  for (const base64 of imageBase64List) {
    const slide = pptx.addSlide();
    slide.addImage({
      data: base64.startsWith("data:") ? base64 : `data:image/png;base64,${base64}`,
      x: 0,
      y: 0,
      w: "100%",
      h: "100%",
    });
  }

  const data = await pptx.write({ outputType: "base64" });
  return data as string;
}

