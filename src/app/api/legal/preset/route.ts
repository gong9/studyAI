/**
 * 预置法律知识库 API
 * 
 * GET  - 获取预置法律库信息（及其章节/文档列表）
 * POST - 初始化预置法律库（从 /public/law/ 导入法律文档并构建索引）
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { LLMService } from '@/lib/llm';
import * as fs from 'fs-extra';
import * as path from 'path';

/**
 * GET - 获取预置法律库信息
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    // 查找预置法律库
    const presetKB = await prisma.knowledgeBase.findFirst({
      where: { isPreset: true, type: 'legal' },
      include: {
        documents: {
          select: { id: true, name: true, status: true, wordCount: true },
          orderBy: { name: 'asc' },
        },
        chapters: {
          where: { level: 1 }, // 只返回顶级章节（即各部法律）
          select: { id: true, title: true, contentPreview: true },
          orderBy: { orderIndex: 'asc' },
        },
        manuscripts: {
          select: { 
            id: true, 
            status: true, 
            createdAt: true,
            chapter: { 
              select: { title: true, metadata: true } 
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 20, // 只返回最近 20 条
        },
        _count: {
          select: { documents: true, chapters: true, manuscripts: true },
        },
      },
    });

    if (!presetKB) {
      return NextResponse.json({ 
        exists: false, 
        message: '预置法律库尚未初始化' 
      });
    }

    // 检查是否所有文档都已处理完成
    const allCompleted = presetKB.documents.every(d => d.status === 'completed');
    const processingCount = presetKB.documents.filter(d => d.status === 'processing').length;

    return NextResponse.json({
      exists: true,
      id: presetKB.id,
      name: presetKB.name,
      documents: presetKB.documents,
      chapters: presetKB.chapters,
      manuscripts: presetKB.manuscripts,
      counts: presetKB._count,
      indexReady: allCompleted && presetKB.documents.length > 0,
      processingCount,
    });
  } catch (error: any) {
    console.error('[Preset Legal] GET error:', error);
    return NextResponse.json({ error: '获取预置法律库失败' }, { status: 500 });
  }
}

/**
 * POST - 初始化预置法律库（包含索引构建）
 */
export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const userId = (session.user as any).id;

    // 检查是否已存在
    let presetKB = await prisma.knowledgeBase.findFirst({
      where: { isPreset: true, type: 'legal' },
      include: { documents: true },
    });

    // 如果已存在且有文档，检查是否需要重建索引
    if (presetKB && presetKB.documents.length > 0) {
      const allCompleted = presetKB.documents.every(d => d.status === 'completed');
      if (allCompleted) {
        return NextResponse.json({ 
          message: '预置法律库已就绪',
          id: presetKB.id,
          indexReady: true,
        });
      }
    }

    // 检查法律文档目录
    const lawDir = path.join(process.cwd(), 'public', 'law');
    if (!await fs.pathExists(lawDir)) {
      return NextResponse.json({ 
        error: '法律文档目录不存在: /public/law/' 
      }, { status: 400 });
    }

    // 读取法律文档
    const files = await fs.readdir(lawDir);
    const docxFiles = files.filter(f => f.endsWith('.docx'));

    if (docxFiles.length === 0) {
      return NextResponse.json({ 
        error: '法律文档目录为空，请先放入 .docx 文件' 
      }, { status: 400 });
    }

    console.log(`[Preset Legal] Found ${docxFiles.length} law documents`);

    // 如果知识库不存在，创建它
    if (!presetKB) {
      presetKB = await prisma.knowledgeBase.create({
        data: {
          name: '法律法规知识库（系统预置）',
          description: '包含《劳动法》《民法典》《民事诉讼法》等常用法律',
          type: 'legal',
          isPreset: true,
          userId,
        },
        include: { documents: true },
      });
      console.log(`[Preset Legal] Created preset KB: ${presetKB.id}`);
    }

    // 创建上传目录
    const uploadDir = path.join(
      process.env.UPLOAD_DIR || './uploads',
      `kb_${presetKB.id}`,
    );
    await fs.ensureDir(uploadDir);

    // 导入每个法律文档（如果尚未导入）
    const existingNames = presetKB.documents.map(d => d.name);
    const importedDocs = [];
    
    for (const fileName of docxFiles) {
      // 跳过已存在的文档
      if (existingNames.includes(fileName)) {
        console.log(`[Preset Legal] Skipping existing: ${fileName}`);
        continue;
      }

      const sourcePath = path.join(lawDir, fileName);
      const destPath = path.join(uploadDir, fileName);

      // 复制文件到上传目录
      await fs.copy(sourcePath, destPath);

      // 创建文档记录
      const doc = await prisma.document.create({
        data: {
          name: fileName,
          path: destPath,
          status: 'pending',
          knowledgeBaseId: presetKB.id,
        },
      });

      importedDocs.push({ id: doc.id, name: fileName });
      console.log(`[Preset Legal] Imported: ${fileName}`);
    }

    // 构建向量索引（处理所有文档）
    console.log(`[Preset Legal] Building vector index...`);
    
    try {
      await LLMService.createOrUpdateIndex(
        presetKB.id,
        uploadDir,
        (progress, message) => {
          console.log(`[Preset Legal] Index progress: ${progress}% - ${message}`);
        }
      );

      // 更新所有文档状态为完成
      await prisma.document.updateMany({
        where: { knowledgeBaseId: presetKB.id },
        data: { status: 'completed' },
      });

      console.log(`[Preset Legal] Index built successfully!`);

      return NextResponse.json({
        success: true,
        message: `预置法律库初始化成功！导入并索引了 ${docxFiles.length} 部法律`,
        id: presetKB.id,
        documents: docxFiles.map(f => ({ name: f, status: 'completed' })),
        indexReady: true,
      });
    } catch (indexError: any) {
      console.error('[Preset Legal] Index build error:', indexError);
      
      // 更新文档状态为失败
      await prisma.document.updateMany({
        where: { knowledgeBaseId: presetKB.id },
        data: { status: 'failed', errorMessage: indexError.message },
      });

      return NextResponse.json({
        success: false,
        message: '文档导入成功，但索引构建失败',
        id: presetKB.id,
        error: indexError.message,
        indexReady: false,
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error('[Preset Legal] POST error:', error);
    return NextResponse.json({ 
      error: '初始化预置法律库失败: ' + error.message 
    }, { status: 500 });
  }
}
