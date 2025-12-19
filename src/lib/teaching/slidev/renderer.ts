/**
 * Slidev 渲染服务
 * 
 * 提供 Slidev 的构建和导出功能
 * - 生成 Slidev 项目文件
 * - 使用 pptxgenjs 生成 PPTX
 * - 输出 PDF / PPTX
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import PptxGenJS from 'pptxgenjs';

// ==================== 类型定义 ====================

export interface RenderOptions {
  outputDir?: string;
  format?: 'pdf' | 'pptx' | 'html';
}

export interface RenderResult {
  success: boolean;
  outputPath?: string;
  error?: string;
}

// ==================== 核心函数 ====================

/**
 * 创建 Slidev 项目并渲染
 */
export async function renderSlidev(
  slidevMd: string,
  manuscriptId: string,
  options: RenderOptions = {}
): Promise<RenderResult> {
  const { format = 'pdf' } = options;
  
  // 创建临时目录
  const baseDir = path.join(process.cwd(), 'tmp', 'slidev', manuscriptId);
  const outputDir = path.join(baseDir, 'dist');

  try {
    // 确保目录存在
    await fs.mkdir(baseDir, { recursive: true });
    await fs.mkdir(outputDir, { recursive: true });

    if (format === 'pptx') {
      // 使用 pptxgenjs 生成 PPTX
      const outputPath = path.join(outputDir, 'slides.pptx');
      await generatePptx(slidevMd, outputPath);
      
      console.log('[SlidevRenderer] PPTX generated:', outputPath);
      
      return {
        success: true,
        outputPath,
      };
    } else {
      // PDF 暂时不支持，返回错误
      return {
        success: false,
        error: 'PDF 导出暂不支持，请使用 PPTX 格式',
      };
    }

  } catch (error: any) {
    console.error('[SlidevRenderer] Error:', error);
    return {
      success: false,
      error: error.message || '渲染失败',
    };
  }
}

/**
 * 使用 pptxgenjs 生成 PPTX
 */
async function generatePptx(slidevMd: string, outputPath: string): Promise<void> {
  const pptx = new PptxGenJS();
  
  // 设置演示文稿属性
  pptx.layout = 'LAYOUT_16x9';
  pptx.author = 'AI 备课助手';
  pptx.title = '教学课件';
  pptx.subject = '自动生成的教学课件';
  
  // 页面高度限制（英寸，16:9 布局高度约 5.625 英寸，留 0.5 的边距）
  const MAX_Y_POS = 5.0;
  
  // 解析 Markdown 分割幻灯片
  let slides = slidevMd.split(/\n---\n/);
  
  // 跳过 frontmatter
  if (slides[0].startsWith('---')) {
    slides = slides.slice(1);
  }
  
  for (const slideContent of slides) {
    if (!slideContent.trim()) continue;
    
    let slide = pptx.addSlide();
    let yPos = 0.5; // 起始 Y 位置
    let slideTitle = ''; // 保存当前幻灯片标题
    
    // 解析幻灯片内容
    const lines = slideContent.trim().split('\n');
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;
      
      // 检查是否需要新页面（内容超出）
      const checkAndAddNewSlide = (requiredHeight: number) => {
        if (yPos + requiredHeight > MAX_Y_POS) {
          // 创建新页面
          slide = pptx.addSlide();
          yPos = 0.5;
          
          // 如果有标题，在新页面显示 "续" 标识
          if (slideTitle) {
            slide.addText(`${slideTitle}（续）`, {
              x: 0.5, y: yPos, w: '90%', h: 0.6,
              fontSize: 20, bold: true, color: '6b7280',
            });
            yPos += 0.8;
          }
        }
      };
      
      // 处理一级标题
      if (trimmedLine.startsWith('# ')) {
        slideTitle = trimmedLine.substring(2);
        checkAndAddNewSlide(1.0);
        slide.addText(slideTitle, {
          x: 0.5, y: yPos, w: '90%', h: 0.8,
          fontSize: 28, bold: true, color: '0f766e',
        });
        yPos += 1.0;
      } 
      // 处理二级标题
      else if (trimmedLine.startsWith('## ')) {
        const title = trimmedLine.substring(3);
        if (!slideTitle) slideTitle = title;
        checkAndAddNewSlide(0.8);
        slide.addText(title, {
          x: 0.5, y: yPos, w: '90%', h: 0.5,
          fontSize: 22, bold: true, color: '0f766e',
        });
        yPos += 0.7;
      } 
      // 处理三级标题
      else if (trimmedLine.startsWith('### ')) {
        checkAndAddNewSlide(0.6);
        slide.addText(trimmedLine.substring(4), {
          x: 0.5, y: yPos, w: '90%', h: 0.4,
          fontSize: 18, bold: true, color: '4f46e5',
        });
        yPos += 0.6;
      }
      // 处理列表项
      else if (trimmedLine.startsWith('- ') || trimmedLine.match(/^\d+\.\s/)) {
        checkAndAddNewSlide(0.45);
        const text = trimmedLine.startsWith('- ') 
          ? trimmedLine.substring(2) 
          : trimmedLine.replace(/^\d+\.\s/, '');
        slide.addText(text, {
          x: 0.7, y: yPos, w: '85%', h: 0.35,
          fontSize: 14, bullet: { type: 'bullet' }, color: '374151',
        });
        yPos += 0.45;
      }
      // 处理图片
      else if (trimmedLine.match(/!\[([^\]]*)\]\(([^)]+)\)/)) {
        const match = trimmedLine.match(/!\[([^\]]*)\]\(([^)]+)\)/);
        if (match) {
          const [, alt, src] = match;
          checkAndAddNewSlide(2.0);
          try {
            slide.addImage({
              path: src,
              x: 1.5, y: yPos, w: 3.5, h: 2,
            });
            yPos += 2.2;
          } catch (e) {
            // 如果图片加载失败，显示占位符
            slide.addText(`[图片: ${alt}]`, {
              x: 1, y: yPos, w: 4, h: 0.5,
              fontSize: 11, color: '9ca3af', italic: true,
            });
            yPos += 0.6;
          }
        }
      }
      // 跳过表格分隔行
      else if (trimmedLine.match(/^\|[\s\-:]+\|$/)) {
        continue;
      }
      // 处理表格行
      else if (trimmedLine.startsWith('|') && trimmedLine.endsWith('|')) {
        // 简单处理：将表格行转为文本
        const cells = trimmedLine.split('|').filter(c => c.trim());
        const tableText = cells.join('  |  ');
        checkAndAddNewSlide(0.4);
        slide.addText(tableText, {
          x: 0.5, y: yPos, w: '90%', h: 0.35,
          fontSize: 12, color: '374151', fontFace: 'Courier New',
        });
        yPos += 0.4;
      }
      // 处理普通文本（跳过 visual/diagram 标记）
      else if (!trimmedLine.startsWith('>')) {
        // 清理 Markdown 格式
        let text = trimmedLine
          .replace(/\*\*([^*]+)\*\*/g, '$1')
          .replace(/\*([^*]+)\*/g, '$1')
          .replace(/`([^`]+)`/g, '$1');
        
        // 长文本可能需要多行
        const estimatedLines = Math.ceil(text.length / 60);
        const textHeight = Math.max(0.4, estimatedLines * 0.35);
        
        checkAndAddNewSlide(textHeight);
        slide.addText(text, {
          x: 0.5, y: yPos, w: '90%', h: textHeight,
          fontSize: 14, color: '374151',
          valign: 'top',
        });
        yPos += textHeight + 0.1;
      }
    }
  }
  
  // 写入文件
  const buffer = await pptx.write({ outputType: 'nodebuffer' }) as Buffer;
  await fs.writeFile(outputPath, buffer);
}

/**
 * 清理临时文件
 */
export async function cleanupSlidevTemp(manuscriptId: string): Promise<void> {
  const baseDir = path.join(process.cwd(), 'tmp', 'slidev', manuscriptId);
  try {
    await fs.rm(baseDir, { recursive: true, force: true });
    console.log('[SlidevRenderer] Cleaned up:', baseDir);
  } catch (error) {
    console.warn('[SlidevRenderer] Cleanup failed:', error);
  }
}

/**
 * 获取 Slidev 预览 HTML（用于内嵌预览）
 */
export function getSlidevPreviewHtml(slidevMd: string): string {
  // 简单的 Markdown 到 HTML 转换（用于快速预览）
  // 实际项目中可以使用更完善的渲染方案
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Slidev Preview</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .slide {
      background: white;
      padding: 40px;
      margin: 20px 0;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      min-height: 400px;
    }
    .slide h1 { font-size: 2em; margin-bottom: 0.5em; }
    .slide h2 { font-size: 1.5em; margin-bottom: 0.5em; }
    .slide ul { padding-left: 1.5em; }
    .slide code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; }
    .visual-placeholder, .diagram-container {
      background: #f9f9f9;
      border: 2px dashed #ddd;
      padding: 20px;
      text-align: center;
      margin: 10px 0;
    }
  </style>
</head>
<body>
  ${slidevMd.split('\n---\n').map((slide, i) => `
    <div class="slide">
      <div class="slide-number">${i + 1}</div>
      <div class="slide-content">${markdownToHtml(slide)}</div>
    </div>
  `).join('')}
</body>
</html>
`;
}

/**
 * 简单的 Markdown 转 HTML
 */
function markdownToHtml(md: string): string {
  let html = md
    // 标题
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // 粗体
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // 斜体
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // 代码
    .replace(/`(.+?)`/g, '<code>$1</code>')
    // 列表
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    // 段落
    .replace(/\n\n/g, '</p><p>')
    // 换行
    .replace(/\n/g, '<br>');

  // 包装列表
  html = html.replace(/(<li>.+<\/li>)+/g, '<ul>$&</ul>');

  return `<p>${html}</p>`;
}



