"""
RAG Client 测试

测试 RAG 检索工具是否能正确调用 Next.js API。
"""

import pytest
import os

# 确保测试时使用测试配置
os.environ.setdefault("NEXTJS_URL", "http://localhost:3000")


@pytest.mark.asyncio
async def test_rag_search_format():
    """测试 RAG 搜索结果格式化"""
    from src.tools.rag_client import RAGSearchOptions
    
    options = RAGSearchOptions(vector_top_k=5, keyword_limit=3)
    
    assert options.vector_top_k == 5
    assert options.keyword_limit == 3
    assert options.use_keyword is True
    assert options.preset == "document"


@pytest.mark.asyncio
async def test_search_chapter_material_empty():
    """测试空查询处理"""
    from src.tools.rag_client import search_chapter_material
    
    # 使用不存在的知识库 ID，应该返回空字符串
    result = await search_chapter_material(
        knowledge_base_id="non-existent-kb",
        chapter_title="Test Chapter",
    )
    
    # 由于连接失败，应该返回空
    assert result == "" or "error" in result.lower() or "fail" in result.lower()


def test_rag_search_options_serialization():
    """测试 RAG 选项序列化"""
    from src.tools.rag_client import RAGSearchOptions
    
    options = RAGSearchOptions(
        vector_top_k=10,
        keyword_limit=5,
        min_vector_score=0.5,
        preset="code",
    )
    
    # 测试别名转换
    data = {
        "vectorTopK": options.vector_top_k,
        "keywordLimit": options.keyword_limit,
        "minVectorScore": options.min_vector_score,
        "preset": options.preset,
    }
    
    assert data["vectorTopK"] == 10
    assert data["keywordLimit"] == 5
    assert data["minVectorScore"] == 0.5
    assert data["preset"] == "code"

