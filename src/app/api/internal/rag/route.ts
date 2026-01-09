/**
 * POST /api/internal/rag
 * 
 * 内部 RAG API - 供 Python deepagents 服务调用
 * 提供混合搜索能力（向量 + 关键词）
 */

import { NextRequest, NextResponse } from 'next/server';
import { loadIndex } from '@/lib/llm/index-manager';
import { hybridSearch, type HybridSearchOptions, type HybridSearchResult } from '@/lib/hybrid-search';

// 内部 API 密钥验证（可选，用于服务间认证）
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

export interface RAGSearchRequest {
  knowledgeBaseId: string;
  query: string;
  options?: {
    vectorTopK?: number;
    keywordLimit?: number;
    useKeyword?: boolean;
    minVectorScore?: number;
    preset?: 'document' | 'code';
  };
}

export interface RAGSearchResponse {
  success: boolean;
  results: HybridSearchResult[];
  error?: string;
  metadata?: {
    totalResults: number;
    queryTime: number;
  };
}

export async function POST(request: NextRequest): Promise<NextResponse<RAGSearchResponse>> {
  const startTime = Date.now();
  
  try {
    // 可选：验证内部 API 密钥
    if (INTERNAL_API_KEY) {
      const authHeader = request.headers.get('x-internal-api-key');
      if (authHeader !== INTERNAL_API_KEY) {
        return NextResponse.json(
          { success: false, results: [], error: 'Unauthorized' },
          { status: 401 }
        );
      }
    }

    const body: RAGSearchRequest = await request.json();
    const { knowledgeBaseId, query, options } = body;

    // 参数验证
    if (!knowledgeBaseId) {
      return NextResponse.json(
        { success: false, results: [], error: '缺少 knowledgeBaseId 参数' },
        { status: 400 }
      );
    }

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { success: false, results: [], error: '缺少有效的 query 参数' },
        { status: 400 }
      );
    }

    // 加载索引
    const index = await loadIndex(knowledgeBaseId);

    // 构建搜索选项
    const searchOptions: HybridSearchOptions = {
      vectorTopK: options?.vectorTopK ?? 5,
      keywordLimit: options?.keywordLimit ?? 3,
      useKeyword: options?.useKeyword ?? true,
      minVectorScore: options?.minVectorScore ?? 0.3,
      preset: options?.preset ?? 'document',
    };

    // 执行混合搜索
    const results = await hybridSearch(index, knowledgeBaseId, query, searchOptions);

    const queryTime = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      results,
      metadata: {
        totalResults: results.length,
        queryTime,
      },
    });

  } catch (error: any) {
    console.error('[Internal RAG API] Error:', error);
    
    // 区分不同类型的错误
    if (error.message?.includes('Index not found')) {
      return NextResponse.json(
        { success: false, results: [], error: '知识库索引不存在' },
        { status: 404 }
      );
    }
    
    if (error.message?.includes('Index not ready')) {
      return NextResponse.json(
        { success: false, results: [], error: '知识库索引正在构建中，请稍后重试' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { success: false, results: [], error: error.message || '内部服务错误' },
      { status: 500 }
    );
  }
}

// 健康检查接口
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: 'ok',
    service: 'internal-rag-api',
    timestamp: new Date().toISOString(),
  });
}

