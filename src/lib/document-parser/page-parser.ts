/**
 * 按页解析PDF文档
 * 
 * 使用 pdf-parse 实现按页解析，保留页码结构
 * 用于"链路B：全书理解"流程
 * 
 * 注意：pdfjs-dist 在 Next.js RSC 环境中有兼容性问题，
 * 因此改用 pdf-parse 并通过分页符分割来实现按页解析
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import pdfParse from 'pdf-parse';

// ==================== 类型定义 ====================

/** 单页内容 */
export interface PageContent {
  /** 页码（从1开始） */
  pageNumber: number;
  /** 页面文本内容 */
  text: string;
  /** 字数统计 */
  wordCount: number;
}

/** 按页解析的文档结果 */
export interface PageParsedDocument {
  /** 文件名 */
  fileName: string;
  /** 总页数 */
  totalPages: number;
  /** 每页内容 */
  pages: PageContent[];
  /** 完整文本（用于兼容现有流程） */
  fullText: string;
}

/** 解析选项 */
export interface ParseOptions {
  /** 起始页（从1开始，默认1） */
  startPage?: number;
  /** 结束页（默认到最后一页） */
  endPage?: number;
  /** 进度回调 */
  onProgress?: (current: number, total: number) => void;
}

// ==================== 核心函数 ====================

/**
 * 按页解析PDF文件
 * 
 * @param filePath PDF文件路径
 * @param options 解析选项
 * @returns 按页解析的文档结果
 */
export async function parsePdfByPage(
  filePath: string,
  options: ParseOptions = {}
): Promise<PageParsedDocument> {
  // 检查文件是否存在
  if (!await fs.pathExists(filePath)) {
    throw new Error(`文件不存在: ${filePath}`);
  }

  const fileName = path.basename(filePath);
  const buffer = await fs.readFile(filePath);

  return parsePdfBufferByPage(buffer, fileName, options);
}

/**
 * 按页解析PDF Buffer
 * 
 * 使用 pdf-parse 并通过自定义 pagerender 按页提取文本
 * 
 * @param buffer PDF文件的Buffer
 * @param fileName 文件名
 * @param options 解析选项
 * @returns 按页解析的文档结果
 */
export async function parsePdfBufferByPage(
  buffer: Buffer,
  fileName: string,
  options: ParseOptions = {}
): Promise<PageParsedDocument> {
  const { startPage = 1, endPage, onProgress } = options;

  const pages: PageContent[] = [];
  let currentPageNum = 0;
  let totalPages = 0;

  // 自定义页面渲染函数，逐页提取文本
  const pageRenderer = async (pageData: any): Promise<string> => {
    currentPageNum++;
    
    // 获取页面文本
    const textContent = await pageData.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str || '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    // 检查是否在目标范围内
    const actualEndPage = endPage || Infinity;
    if (currentPageNum >= startPage && currentPageNum <= actualEndPage) {
      pages.push({
        pageNumber: currentPageNum,
        text: pageText,
        wordCount: countWords(pageText),
      });

      // 进度回调
      if (onProgress && totalPages > 0) {
        const processed = currentPageNum - startPage + 1;
        const toProcess = Math.min(actualEndPage, totalPages) - startPage + 1;
        onProgress(processed, toProcess);
      }
    }

    return pageText;
  };

  try {
    // 解析 PDF
    const pdfData = await pdfParse(buffer, {
      pagerender: pageRenderer,
      max: endPage || 0, // 0 表示所有页面
    });

    totalPages = pdfData.numpages;

    // 如果 pagerender 没有被调用（某些 PDF），使用分页符分割
    if (pages.length === 0 && pdfData.text) {
      const splitPages = splitByPageBreaks(pdfData.text, totalPages);
      pages.push(...splitPages);
    }

    // 过滤范围
    const actualEndPage = Math.min(endPage || totalPages, totalPages);
    const filteredPages = pages.filter(
      p => p.pageNumber >= startPage && p.pageNumber <= actualEndPage
    );

    // 生成完整文本
    const fullText = filteredPages
      .map(p => `[第${p.pageNumber}页]\n${p.text}`)
      .join('\n\n');


    return {
      fileName,
      totalPages,
      pages: filteredPages,
      fullText,
    };
  } catch (error: any) {
    console.error('[PageParser] Error:', error.message);
    
    // 降级：使用简单解析
    const pdfData = await pdfParse(buffer);
    const simplePages = splitByPageBreaks(pdfData.text, pdfData.numpages);
    
    return {
      fileName,
      totalPages: pdfData.numpages,
      pages: simplePages,
      fullText: pdfData.text,
    };
  }
}

/**
 * 通过分页符分割文本
 */
function splitByPageBreaks(text: string, estimatedPages: number): PageContent[] {
  // 尝试通过换页符分割
  const pageBreakPatterns = [
    /\f/g,                    // 换页符
    /\n{4,}/g,                // 多个连续换行
    /\n\s*-\s*\d+\s*-\s*\n/g, // 页码格式 " - 1 - "
  ];

  let segments: string[] = [];

  for (const pattern of pageBreakPatterns) {
    segments = text.split(pattern).filter(s => s.trim());
    if (segments.length > 1) {
      break;
    }
  }

  // 如果没有找到分页符，按估计的页数均分
  if (segments.length <= 1 && estimatedPages > 1) {
    const avgLength = Math.ceil(text.length / estimatedPages);
    segments = [];
    for (let i = 0; i < text.length; i += avgLength) {
      segments.push(text.substring(i, i + avgLength));
    }
  }

  // 如果还是只有一段，作为单页处理
  if (segments.length === 0) {
    segments = [text];
  }

  return segments.map((segment, index) => ({
    pageNumber: index + 1,
    text: segment.trim(),
    wordCount: countWords(segment),
  }));
}

/**
 * 获取指定页范围的内容
 * 
 * @param doc 已解析的文档
 * @param startPage 起始页
 * @param endPage 结束页
 * @returns 合并后的文本
 */
export function getPageRangeContent(
  doc: PageParsedDocument,
  startPage: number,
  endPage: number
): string {
  const relevantPages = doc.pages.filter(
    p => p.pageNumber >= startPage && p.pageNumber <= endPage
  );

  return relevantPages.map(p => p.text).join('\n\n');
}

/**
 * 获取指定页范围的字数
 */
export function getPageRangeWordCount(
  doc: PageParsedDocument,
  startPage: number,
  endPage: number
): number {
  return doc.pages
    .filter(p => p.pageNumber >= startPage && p.pageNumber <= endPage)
    .reduce((sum, p) => sum + p.wordCount, 0);
}

/**
 * 查找包含特定关键词的页面
 */
export function findPagesWithKeyword(
  doc: PageParsedDocument,
  keyword: string
): number[] {
  const keywordLower = keyword.toLowerCase();
  return doc.pages
    .filter(p => p.text.toLowerCase().includes(keywordLower))
    .map(p => p.pageNumber);
}

// ==================== 辅助函数 ====================

/**
 * 统计字数（支持中英文）
 */
function countWords(text: string): number {
  if (!text) return 0;
  
  // 中文字符数
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  
  // 英文单词数
  const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
  
  return chineseChars + englishWords;
}

/**
 * 判断页面是否可能是目录页
 */
export function isLikelyTocPage(pageText: string): boolean {
  const tocIndicators = [
    /目\s*录/,
    /contents/i,
    /table of contents/i,
    /\.\.\.\s*\d+/,  // 点线加页码 "... 15"
    /…+\s*\d+/,      // 省略号加页码
  ];

  const lineCount = pageText.split('\n').length;
  const hasPageNumbers = /\d+\s*$/.test(pageText);
  
  // 包含目录关键词，或有多行且包含页码
  return tocIndicators.some(p => p.test(pageText)) || 
         (lineCount > 5 && hasPageNumbers && /第.章|Chapter/i.test(pageText));
}

/**
 * 判断页面是否可能是章节开头
 */
export function isLikelyChapterStart(pageText: string): boolean {
  const chapterPatterns = [
    /^第[一二三四五六七八九十\d]+章/m,
    /^Chapter\s+\d+/im,
    /^第[一二三四五六七八九十\d]+节/m,
    /^Part\s+\d+/im,
  ];

  return chapterPatterns.some(p => p.test(pageText));
}
