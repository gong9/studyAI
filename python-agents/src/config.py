"""配置模块"""

import os
from functools import lru_cache

from dotenv import load_dotenv
from pydantic_settings import BaseSettings

# 加载 .env 文件
load_dotenv()


class Settings(BaseSettings):
    """应用配置"""
    
    # LLM 配置
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    openai_api_base: str = os.getenv("OPENAI_API_BASE", "https://dashscope.aliyuncs.com/compatible-mode/v1")
    openai_model: str = os.getenv("OPENAI_MODEL", "qwen-plus")
    
    # Next.js 服务地址
    nextjs_url: str = os.getenv("NEXTJS_URL", "http://localhost:3000")
    
    # 内部 API 密钥
    internal_api_key: str = os.getenv("INTERNAL_API_KEY", "")
    
    # 服务配置
    host: str = os.getenv("HOST", "0.0.0.0")
    port: int = int(os.getenv("PORT", "8000"))
    debug: bool = os.getenv("DEBUG", "false").lower() == "true"
    
    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    """获取配置单例"""
    return Settings()

