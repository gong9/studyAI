/**
 * PDF 书签/大纲提取器
 * 
 * 使用 pdf-lib 提取 PDF 的内置书签结构（Outlines/Bookmarks）
 * 书签是 PDF 的结构化元数据，比 LLM 分析文本更准确
 */

import { PDFDocument, PDFDict, PDFName, PDFString, PDFArray, PDFNumber, PDFRef } from 'pdf-lib';

// ==================== 类型定义 ====================

/** 书签节点 */
export interface OutlineItem {
  /** 书签标题 */
  title: string;
  /** 目标页码（从1开始） */
  pageNumber: number;
  /** 层级（从1开始） */
  level: number;
  /** 子书签 */
  children: OutlineItem[];
}

/** 提取结果 */
export interface OutlineResult {
  /** 是否成功 */
  success: boolean;
  /** 是否有书签 */
  hasOutline: boolean;
  /** 书签列表 */
  items: OutlineItem[];
  /** 错误信息 */
  error?: string;
}

// ==================== 核心函数 ====================

/**
 * 从 PDF Buffer 提取书签结构
 */
export async function extractPdfOutline(buffer: Buffer): Promise<OutlineResult> {
  try {
    const pdfDoc = await PDFDocument.load(buffer, {
      ignoreEncryption: true,
      updateMetadata: false,
    });

    const catalog = pdfDoc.catalog;
    const outlinesRef = catalog.get(PDFName.of('Outlines'));

    if (!outlinesRef) {
      return {
        success: true,
        hasOutline: false,
        items: [],
      };
    }

    const outlines = catalog.lookup(PDFName.of('Outlines'));
    if (!(outlines instanceof PDFDict)) {
      return {
        success: true,
        hasOutline: false,
        items: [],
      };
    }

    // 获取页面引用到页码的映射
    const pageMap = buildPageMap(pdfDoc);

    // 提取书签树
    const items = extractOutlineItems(outlines, pdfDoc, pageMap, 1);


    return {
      success: true,
      hasOutline: items.length > 0,
      items,
    };
  } catch (error: any) {
    console.error('[PdfOutline] Error extracting outline:', error.message);
    return {
      success: false,
      hasOutline: false,
      items: [],
      error: error.message,
    };
  }
}

/**
 * 将书签结构转换为扁平的章节边界格式
 * 兼容现有的 ChapterBoundary 类型
 */
export function outlineToChapterBoundaries(
  items: OutlineItem[],
  totalPages: number
): Array<{
  title: string;
  level: number;
  startPage: number;
  endPage: number;
  sections?: any[];
}> {
  const result: any[] = [];

  function processItems(items: OutlineItem[], siblings: OutlineItem[], parentEndPage: number) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const nextItem = items[i + 1];
      
      // 计算结束页：下一个同级或父级结束页
      let endPage = parentEndPage;
      if (nextItem) {
        endPage = nextItem.pageNumber - 1;
      }
      if (endPage < item.pageNumber) {
        endPage = item.pageNumber;
      }

      const chapter: any = {
        title: item.title,
        level: item.level,
        startPage: item.pageNumber,
        endPage: endPage,
      };

      if (item.children.length > 0) {
        chapter.sections = [];
        processItemsNested(item.children, chapter.sections, endPage);
      }

      result.push(chapter);
    }
  }

  function processItemsNested(items: OutlineItem[], target: any[], parentEndPage: number) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const nextItem = items[i + 1];

      let endPage = parentEndPage;
      if (nextItem) {
        endPage = nextItem.pageNumber - 1;
      }
      if (endPage < item.pageNumber) {
        endPage = item.pageNumber;
      }

      const section: any = {
        title: item.title,
        level: item.level,
        startPage: item.pageNumber,
        endPage: endPage,
      };

      if (item.children.length > 0) {
        section.sections = [];
        processItemsNested(item.children, section.sections, endPage);
      }

      target.push(section);
    }
  }

  processItems(items, items, totalPages);
  return result;
}

// ==================== 辅助函数 ====================

/**
 * 构建页面引用到页码的映射
 */
function buildPageMap(pdfDoc: PDFDocument): Map<string, number> {
  const map = new Map<string, number>();
  const pages = pdfDoc.getPages();
  
  pages.forEach((page, index) => {
    const ref = pdfDoc.context.getObjectRef(page.node);
    if (ref) {
      map.set(ref.toString(), index + 1);
    }
  });

  return map;
}

/**
 * 递归提取书签项
 */
function extractOutlineItems(
  outlineDict: PDFDict,
  pdfDoc: PDFDocument,
  pageMap: Map<string, number>,
  level: number
): OutlineItem[] {
  const items: OutlineItem[] = [];

  // 获取第一个子项
  let firstRef = outlineDict.get(PDFName.of('First'));
  if (!firstRef) {
    return items;
  }

  let currentRef = firstRef;
  let maxIterations = 1000; // 防止无限循环

  while (currentRef && maxIterations-- > 0) {
    const current = pdfDoc.context.lookup(currentRef);
    if (!(current instanceof PDFDict)) {
      break;
    }

    // 提取标题
    const titleObj = current.get(PDFName.of('Title'));
    let title = '';
    if (titleObj instanceof PDFString) {
      title = titleObj.decodeText();
    } else if (titleObj) {
      const lookedUp = pdfDoc.context.lookup(titleObj);
      if (lookedUp instanceof PDFString) {
        title = lookedUp.decodeText();
      }
    }

    // 提取目标页码
    let pageNumber = 1;
    const dest = current.get(PDFName.of('Dest'));
    const action = current.get(PDFName.of('A'));

    if (dest) {
      pageNumber = getPageFromDest(dest, pdfDoc, pageMap);
    } else if (action) {
      const actionDict = pdfDoc.context.lookup(action);
      if (actionDict instanceof PDFDict) {
        const actionDest = actionDict.get(PDFName.of('D'));
        if (actionDest) {
          pageNumber = getPageFromDest(actionDest, pdfDoc, pageMap);
        }
      }
    }

    // 递归处理子项
    const children = extractOutlineItems(current, pdfDoc, pageMap, level + 1);

    if (title) {
      items.push({
        title: title.trim(),
        pageNumber,
        level,
        children,
      });
    }

    // 移动到下一个兄弟项
    const nextRef = current.get(PDFName.of('Next'));
    if (!nextRef || nextRef === currentRef) {
      break;
    }
    currentRef = nextRef;
  }

  return items;
}

/**
 * 从目标引用获取页码
 */
function getPageFromDest(
  dest: any,
  pdfDoc: PDFDocument,
  pageMap: Map<string, number>
): number {
  try {
    // 目标可能是数组或名称引用
    let destArray: any = null;

    if (dest instanceof PDFArray) {
      destArray = dest;
    } else if (dest instanceof PDFName) {
      // 命名目标，需要从 Names 字典查找
      const names = pdfDoc.catalog.get(PDFName.of('Names'));
      if (names) {
        const namesDict = pdfDoc.context.lookup(names);
        if (namesDict instanceof PDFDict) {
          const dests = namesDict.get(PDFName.of('Dests'));
          if (dests) {
            // 复杂的查找逻辑，这里简化处理
            return 1;
          }
        }
      }
      return 1;
    } else {
      const lookedUp = pdfDoc.context.lookup(dest);
      if (lookedUp instanceof PDFArray) {
        destArray = lookedUp;
      }
    }

    if (destArray && destArray.size() > 0) {
      const pageRef = destArray.get(0);
      if (pageRef instanceof PDFRef) {
        const pageNum = pageMap.get(pageRef.toString());
        if (pageNum) {
          return pageNum;
        }
      }
      // 直接是页码数字
      if (pageRef instanceof PDFNumber) {
        return pageRef.asNumber() + 1;
      }
    }
  } catch (e) {
    // 忽略错误，返回默认值
  }

  return 1;
}

/**
 * 统计书签项数量
 */
function countItems(items: OutlineItem[]): number {
  let count = items.length;
  for (const item of items) {
    count += countItems(item.children);
  }
  return count;
}

