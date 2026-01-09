/**
 * 创建讲书项目 API
 *
 * POST /api/storytelling/create
 * - 上传 PDF
 * - 提取章节（PDF 书签）
 * - 创建项目记录
 * - 触发 Python Agent 准备流程
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { extractPdfOutline, outlineToChapterBoundaries } from "@/lib/document-parser/pdf-outline";
import { parsePdfBufferByPage } from "@/lib/document-parser/page-parser";

// Python Agent 服务地址
const PYTHON_AGENT_URL = process.env.PYTHON_AGENT_URL || "http://localhost:8000";

interface CreateRequest {
  title?: string;
  targetDurationMinutes?: number;
}

interface Chapter {
  title: string;
  content: string;
  startPage: number;
  endPage: number;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const configStr = formData.get("config") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // 验证文件类型
    if (!file.type.includes("pdf")) {
      return NextResponse.json(
        { error: "Only PDF files are supported" },
        { status: 400 }
      );
    }

    const config: CreateRequest = configStr ? JSON.parse(configStr) : {};
    const bookId = randomUUID();
    const bookTitle = config.title || file.name.replace(/\.pdf$/i, "");
    const targetDurationMinutes = config.targetDurationMinutes || 10;

    // 读取 PDF 内容
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 1. 提取 PDF 书签（章节目录）
    const outlineResult = await extractPdfOutline(buffer);
    let chapters: Chapter[] = [];

    if (outlineResult.success && outlineResult.hasOutline && outlineResult.items.length > 0) {
      // 使用书签划分章节 - 先获取总页数
      const pdfDoc = await parsePdfBufferByPage(buffer, file.name);
      const totalPages = pdfDoc.totalPages;
      
      const boundaries = outlineToChapterBoundaries(
        outlineResult.items,
        totalPages
      );

      // 2. 解析各章内容
      for (const boundary of boundaries) {
        const chapterPages = pdfDoc.pages.filter(
          (p) => p.pageNumber >= boundary.startPage && p.pageNumber <= boundary.endPage
        );
        const content = chapterPages.map((p) => p.text).join("\n\n");

        chapters.push({
          title: boundary.title,
          content,
          startPage: boundary.startPage,
          endPage: boundary.endPage,
        });
      }
    } else {
      // 无书签，按页返回（简化处理）
      const pdfDoc = await parsePdfBufferByPage(buffer, file.name);
      
      // 合并成一个大章节（实际使用中可以做更复杂的章节检测）
      chapters.push({
        title: bookTitle,
        content: pdfDoc.pages.map((p) => p.text).join("\n\n"),
        startPage: 1,
        endPage: pdfDoc.totalPages,
      });
    }

    // 3. 调用 Python Agent 准备流程（异步，不等待）
    // 使用 fire-and-forget 模式，让后端在后台处理
    fetch(`${PYTHON_AGENT_URL}/api/v1/storytelling/prepare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        book_id: bookId,
        book_title: bookTitle,
        chapters: chapters.map((c) => ({ title: c.title, content: c.content })),
        target_duration_minutes: targetDurationMinutes,
      }),
    }).catch((error) => {
      console.error("Failed to trigger Python Agent prepare:", error);
    });

    // 立即返回，让前端通过 SSE 监控进度
    return NextResponse.json({
      success: true,
      bookId,
      title: bookTitle,
      chapterCount: chapters.length,
      chapters: chapters.map((c) => ({
        title: c.title,
        startPage: c.startPage,
        endPage: c.endPage,
      })),
    });
  } catch (error) {
    console.error("Create storytelling project failed:", error);
    return NextResponse.json(
      { error: "Failed to create project", details: String(error) },
      { status: 500 }
    );
  }
}

