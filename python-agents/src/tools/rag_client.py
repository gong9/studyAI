"""
RAG 检索工具

通过 HTTP 调用 Next.js 的 RAG API，复用现有的向量检索能力。
"""

import logging
from typing import Optional

import httpx
from langchain_core.tools import tool
from pydantic import BaseModel, Field

from ..config import get_settings

logger = logging.getLogger(__name__)


class RAGSearchResult(BaseModel):
    """RAG 检索结果"""
    id: str
    document_name: str = Field(alias="documentName")
    content: str
    score: float
    source: str  # 'vector' | 'keyword' | 'both'
    content_type: str = Field(alias="contentType")  # 'document' | 'memory' | 'code'
    
    class Config:
        populate_by_name = True


class RAGSearchOptions(BaseModel):
    """RAG 检索选项"""
    vector_top_k: int = Field(default=5, alias="vectorTopK")
    keyword_limit: int = Field(default=3, alias="keywordLimit")
    use_keyword: bool = Field(default=True, alias="useKeyword")
    min_vector_score: float = Field(default=0.3, alias="minVectorScore")
    preset: str = "document"  # 'document' | 'code'
    
    class Config:
        populate_by_name = True


async def _call_rag_api(
    knowledge_base_id: str,
    query: str,
    options: Optional[RAGSearchOptions] = None,
) -> list[dict]:
    """
    调用 Next.js RAG API
    
    Args:
        knowledge_base_id: 知识库 ID
        query: 搜索查询
        options: 搜索选项
        
    Returns:
        检索结果列表
    """
    settings = get_settings()
    url = f"{settings.nextjs_url}/api/internal/rag"
    
    # 构建请求体
    payload = {
        "knowledgeBaseId": knowledge_base_id,
        "query": query,
    }
    
    if options:
        payload["options"] = {
            "vectorTopK": options.vector_top_k,
            "keywordLimit": options.keyword_limit,
            "useKeyword": options.use_keyword,
            "minVectorScore": options.min_vector_score,
            "preset": options.preset,
        }
    
    # 构建请求头
    headers = {"Content-Type": "application/json"}
    if settings.internal_api_key:
        headers["x-internal-api-key"] = settings.internal_api_key
    
    logger.debug(f"Calling RAG API: {url}")
    logger.debug(f"Query: {query[:100]}...")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            
            data = response.json()
            
            if not data.get("success"):
                error = data.get("error", "Unknown error")
                logger.error(f"RAG API error: {error}")
                raise Exception(f"RAG search failed: {error}")
            
            results = data.get("results", [])
            logger.info(f"RAG search returned {len(results)} results")
            
            return results
            
        except httpx.HTTPStatusError as e:
            logger.error(f"RAG API HTTP error: {e.response.status_code}")
            raise Exception(f"RAG API error: {e.response.status_code}")
        except httpx.RequestError as e:
            logger.error(f"RAG API request error: {e}")
            raise Exception(f"RAG API connection error: {e}")


@tool
async def rag_search(
    knowledge_base_id: str,
    query: str,
    top_k: int = 5,
) -> str:
    """
    搜索知识库中与查询相关的内容。
    
    使用混合搜索（向量 + 关键词）从知识库中检索相关文档片段。
    返回格式化的检索结果，可用于生成教学内容。
    
    Args:
        knowledge_base_id: 知识库 ID
        query: 搜索查询，例如 "线性方程组的解法" 或 "React Hooks 使用方法"
        top_k: 返回结果数量，默认 5
        
    Returns:
        格式化的检索结果文本
    """
    options = RAGSearchOptions(vector_top_k=top_k, keyword_limit=min(top_k, 3))
    
    try:
        results = await _call_rag_api(knowledge_base_id, query, options)
        
        if not results:
            return f"未找到与 '{query}' 相关的内容。"
        
        # 格式化结果
        formatted = []
        for i, r in enumerate(results[:top_k], 1):
            doc_name = r.get("documentName", "未知文档")
            content = r.get("content", "")
            source = r.get("source", "unknown")
            
            # 来源标记
            source_icon = {"vector": "📊", "keyword": "🔤", "both": "🎯"}.get(source, "📄")
            
            formatted.append(f"【来源{i}: {doc_name}】{source_icon}\n{content}")
        
        return "\n\n---\n\n".join(formatted)
        
    except Exception as e:
        logger.error(f"RAG search error: {e}")
        return f"检索失败: {e}"


async def search_chapter_material(
    knowledge_base_id: str,
    chapter_title: str,
    queries: Optional[list[str]] = None,
) -> str:
    """
    检索章节相关的教材内容
    
    执行多个查询以获取全面的章节内容。
    
    Args:
        knowledge_base_id: 知识库 ID
        chapter_title: 章节标题
        queries: 额外的查询列表，如果不提供则自动生成
        
    Returns:
        合并后的检索结果
    """
    # 默认查询策略
    if queries is None:
        queries = [
            chapter_title,
            f"{chapter_title} 定义 概念",
            f"{chapter_title} 例题 练习",
            f"{chapter_title} 公式 方法",
        ]
    
    all_content = []
    seen_content = set()
    
    for query in queries:
        try:
            results = await _call_rag_api(
                knowledge_base_id,
                query,
                RAGSearchOptions(vector_top_k=5, keyword_limit=3),
            )
            
            for r in results:
                content = r.get("content", "")
                # 去重（用内容前100字符作为key）
                content_key = content[:100]
                if content_key not in seen_content:
                    seen_content.add(content_key)
                    all_content.append(content)
                    
        except Exception as e:
            logger.warning(f"Query '{query}' failed: {e}")
            continue
    
    if not all_content:
        return ""
    
    # 合并内容
    combined = "\n\n---\n\n".join(all_content)
    
    # 限制总长度
    max_length = 8000
    if len(combined) > max_length:
        combined = combined[:max_length] + "\n\n[内容已截断...]"
    
    return combined

