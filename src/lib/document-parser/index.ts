/**
 * 文档解析模块
 * 
 * 提供多种文档解析能力，支持：
 * - 按页解析PDF（保留页码结构）
 * - PDF书签/大纲提取（精确层级结构）
 * - 传统全文解析（兼容现有流程）
 */

export {
  parsePdfByPage,
  parsePdfBufferByPage,
  getPageRangeContent,
  getPageRangeWordCount,
  findPagesWithKeyword,
  isLikelyTocPage,
  isLikelyChapterStart,
  type PageContent,
  type PageParsedDocument,
  type ParseOptions,
} from './page-parser';

export {
  extractPdfOutline,
  outlineToChapterBoundaries,
  type OutlineItem,
  type OutlineResult,
} from './pdf-outline';

