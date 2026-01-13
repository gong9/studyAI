"""FastAPI 主入口"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routes import teaching, hitl, trace, storytelling, render_stream

# 配置日志
logging.basicConfig(
    level=logging.DEBUG if get_settings().debug else logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    logger.info("Teaching Agents service starting...")
    logger.info(f"Next.js URL: {get_settings().nextjs_url}")
    logger.info(f"LLM Model: {get_settings().openai_model}")
    yield
    logger.info("Teaching Agents service shutting down...")


app = FastAPI(
    title="Teaching Agents API",
    description="Deep Agents for Teaching Manuscript Generation",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境应限制
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(teaching.router, prefix="/api/v1/teaching", tags=["teaching"])
app.include_router(render_stream.router, prefix="/api/v1/teaching", tags=["teaching"])
app.include_router(hitl.router, prefix="/api/v1/hitl", tags=["hitl"])
app.include_router(trace.router, prefix="/api/v1/trace", tags=["trace"])
app.include_router(storytelling.router, tags=["storytelling"])


@app.get("/health")
async def health_check():
    """健康检查"""
    return {
        "status": "ok",
        "service": "teaching-agents",
        "model": get_settings().openai_model,
    }


@app.get("/")
async def root():
    """根路由"""
    return {
        "message": "Teaching Agents API",
        "docs": "/docs",
        "health": "/health",
    }


if __name__ == "__main__":
    import uvicorn
    
    settings = get_settings()
    uvicorn.run(
        "src.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )

