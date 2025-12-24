/**
 * Slidev 预处理器
 * 
 * 将教学手稿 Markdown 转换为 Slidev 格式
 * - 处理分页（---）
 * - 处理 > diagram: 和 > visual: 标记
 * - 生成 Slidev 前置配置
 */

// ==================== 类型定义 ====================

export interface PreprocessResult {
  slidevMd: string;
  slideCount: number;
}

// ==================== 核心函数 ====================

/**
 * 将教学手稿转换为 Slidev 格式
 */
export function preprocessToSlidev(
  enrichedContent: string,
  options: {
    title?: string;
    author?: string;
    theme?: string;
  } = {}
): PreprocessResult {
  const { title = '教学课件', author = '', theme = 'default' } = options;

  // 1. 生成 Slidev 前置配置
  const frontmatter = generateFrontmatter(title, author, theme);

  // 2. 处理 Markdown 内容
  let processedContent = enrichedContent;

  // 2.1 处理 > visual: 标记 -> 转换为图片占位符
  processedContent = processVisualMarkers(processedContent);

  // 2.2 处理 > diagram: 标记 -> 转换为 SVG 组件
  processedContent = processDiagramMarkers(processedContent);

  // 2.3 处理 > animation: 标记 -> 添加 Slidev 动画类
  processedContent = processAnimationMarkers(processedContent);

  // 2.4 处理 > emphasis: 标记 -> 高亮样式
  processedContent = processEmphasisMarkers(processedContent);

  // 2.5 确保幻灯片分隔符格式正确
  processedContent = normalizeSlideBreaks(processedContent);

  // 3. 合并输出
  const slidevMd = `${frontmatter}\n\n${processedContent}`;

  // 4. 统计幻灯片数量
  const slideCount = (slidevMd.match(/\n---\n/g) || []).length + 1;

  return {
    slidevMd,
    slideCount,
  };
}

// ==================== 辅助函数 ====================

/**
 * 生成 Slidev 前置配置
 */
function generateFrontmatter(title: string, author: string, theme: string): string {
  return `---
theme: ${theme}
title: ${title}
${author ? `author: ${author}` : ''}
layout: cover
---

# ${title}

${author ? `<p class="text-gray-400">${author}</p>` : ''}`;
}

/**
 * 处理 > visual: 标记
 */
function processVisualMarkers(content: string): string {
  // > visual: 描述 -> 图片占位符
  return content.replace(
    /> visual:\s*(.+)/g,
    (_, desc) => `\n<div class="visual-placeholder p-4 bg-gray-100 rounded-lg text-center">\n  <span class="text-gray-500">📷 ${desc.trim()}</span>\n</div>\n`
  );
}

/**
 * 处理 > diagram: 标记
 */
function processDiagramMarkers(content: string): string {
  // > diagram: 描述 -> SVG 占位符（后续可扩展为实际 SVG 生成）
  return content.replace(
    /> diagram:\s*(.+)/g,
    (_, desc) => `\n<div class="diagram-container p-4 border border-gray-300 rounded-lg text-center bg-white">\n  <span class="text-gray-600">📊 ${desc.trim()}</span>\n  <!-- TODO: 生成 SVG 图表 -->\n</div>\n`
  );
}

/**
 * 处理 > animation: 标记
 */
function processAnimationMarkers(content: string): string {
  // > animation: 描述 -> 添加 v-click 动画
  return content.replace(
    /> animation:\s*(.+)/g,
    (_, desc) => `\n<div v-click class="animate-fade-in">\n  <!-- ${desc.trim()} -->\n</div>\n`
  );
}

/**
 * 处理 > emphasis: 标记
 */
function processEmphasisMarkers(content: string): string {
  // > emphasis: 内容 -> 高亮样式
  return content.replace(
    /> emphasis:\s*(.+)/g,
    (_, text) => `\n<span class="text-red-500 font-bold">${text.trim()}</span>\n`
  );
}

/**
 * 规范化幻灯片分隔符
 */
function normalizeSlideBreaks(content: string): string {
  // 确保 --- 前后有足够的空行
  let normalized = content;

  // 先保护表格中的分隔线（|---|---| 这种格式）
  // 用占位符替换
  const TABLE_SEP_PLACEHOLDER = '___TABLE_SEPARATOR___';
  normalized = normalized.replace(/\|[\s\-:]+\|/g, (match) => {
    // 把表格分隔行中的内容保护起来
    return match.replace(/-+/g, TABLE_SEP_PLACEHOLDER);
  });

  // 将独立的 --- 替换为分页符（只匹配独立成行的 ---）
  // 必须是行首或换行后，且 --- 后面是换行或行尾
  normalized = normalized.replace(/(\n|^)---+(\n|$)/g, '\n\n---\n\n');

  // 处理标题后的分隔
  normalized = normalized.replace(/^(#{1,2}\s+.+)\n{0,2}---/gm, '$1\n\n---');

  // 恢复表格分隔线
  normalized = normalized.replace(new RegExp(TABLE_SEP_PLACEHOLDER, 'g'), '---');

  // 移除空白页（只有空白字符或单个 | 的页）
  normalized = normalized.replace(/\n---\n\n\s*\|?\s*\n\n---\n/g, '\n\n---\n\n');
  
  // 移除末尾的空页
  normalized = normalized.replace(/\n---\n\n\s*\|?\s*$/g, '');

  return normalized;
}

/**
 * 从 Slidev Markdown 提取幻灯片列表（用于预览）
 */
export function extractSlides(slidevMd: string): Array<{
  index: number;
  title: string;
  content: string;
}> {
  const slides = slidevMd.split(/\n---\n/).map((content, index) => {
    // 提取标题
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1] : `第 ${index + 1} 页`;

    return {
      index,
      title,
      content: content.trim(),
    };
  });

  return slides;
}

