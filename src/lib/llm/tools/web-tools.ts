/**
 * 网络搜索工具模块
 * 包含 web_search 和 fetch_webpage
 */
import { FunctionTool, Settings } from 'llamaindex';
import { getWebSearchConfig, type ToolContext } from './types';

/**
 * 创建网络搜索工具
 */
export function createWebSearchTool(ctx: ToolContext) {
  const config = getWebSearchConfig();
  let invalidCallCount = 0;
  
  return FunctionTool.from(
    async (params: { query: string } | string): Promise<string> => {
      // 兼容不同的参数格式
      let query: string;
      if (typeof params === 'string' && params.trim()) {
        query = params.trim();
      } else if (params && typeof params === 'object' && params.query && params.query.trim()) {
        query = params.query.trim();
      } else {
        invalidCallCount++;
        
        if (invalidCallCount >= config.maxInvalidCalls) {
          return '[ERROR] 网络搜索工具调用失败次数过多，请停止调用此工具，直接基于已有信息回答。';
        }
        return '搜索参数无效，请提供有效的搜索关键词，格式为 {"query": "搜索内容"}';
      }
      
      // 有效调用，重置计数器
      invalidCallCount = 0;
      
      
      // 用 LLM 分析用户意图，生成最佳搜索词
      let optimizedQuery = query;
      try {
        const llm = Settings.llm;
        const intentResponse = await llm.complete({
          prompt: `你是一个搜索优化专家。用户想搜索的内容是："${query}"

请分析用户意图，生成一个最适合在搜索引擎中使用的简洁搜索词。

要求：
1. 只输出搜索词本身，不要任何解释
2. 搜索词要简洁有效，通常 2-5 个关键词
3. 去掉口语化的词（如"啊"、"呢"、"吗"）
4. 如果是查天气，格式为"城市名+天气"
5. 如果是查新闻，加上时间词如"最新"

直接输出搜索词：`,
        });
        
        optimizedQuery = intentResponse.text.trim().replace(/["""'']/g, '');
      } catch (e) {
      }
      
      // 遍历 SearXNG 实例
      for (const instance of config.instances) {
        try {
          const url = `${instance}/search?q=${encodeURIComponent(optimizedQuery)}&format=json&language=zh-CN`;
          
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), config.timeout);
          
          const response = await fetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
              'Accept': 'application/json',
            },
            signal: controller.signal,
          });
          
          clearTimeout(timeoutId);
          
          if (!response.ok) {
            continue;
          }
          
          const data = await response.json();
          
          if (!data.results || data.results.length === 0) {
            continue;
          }
          
          const results = data.results.slice(0, 3);
          const top3 = results.map((r: any, i: number) => 
            `[${i + 1}] ${r.title || '无标题'}\n${r.content || r.description || '无描述'}\n来源: ${r.url}`
          ).join('\n\n');
          
          
          // 自动抓取第一个结果的网页内容
          if (results.length > 0 && results[0].url) {
            try {
              const pageResponse = await fetch(results[0].url, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                  'Accept': 'text/html',
                },
                signal: AbortSignal.timeout(8000),
              });
              
              if (pageResponse.ok) {
                let pageText = await pageResponse.text();
                // 简单清理 HTML
                pageText = pageText
                  .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                  .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                  .replace(/<[^>]+>/g, ' ')
                  .replace(/\s+/g, ' ')
                  .trim()
                  .substring(0, 2000);
                
                
                return `搜索结果摘要:\n${top3}\n\n第一个网页的详细内容:\n${pageText}`;
              }
            } catch (e) {
            }
          }
          
          return top3;
        } catch (error: any) {
          continue;
        }
      }
      
      return '网络搜索暂时不可用，所有搜索节点均无响应';
    },
    {
      name: 'web_search',
      description: '搜索互联网获取最新信息。当知识库中没有答案，或需要实时资讯、新闻、最新技术动态时使用。',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜索关键词',
          },
        },
        required: ['query'],
      },
    }
  );
}

/**
 * 创建网页抓取工具
 */
export function createFetchWebpageTool(_ctx: ToolContext) {
  return FunctionTool.from(
    async (params: { url: string } | string): Promise<string> => {
      // 兼容不同的参数格式
      let url: string;
      if (typeof params === 'string') {
        url = params;
      } else if (params && typeof params === 'object' && params.url) {
        url = params.url;
      } else {
        return '网页URL参数无效';
      }
      
      
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          },
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          return `无法访问该网页: HTTP ${response.status}`;
        }
        
        const html = await response.text();
        
        // 提取正文内容
        let text = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/\s+/g, ' ')
          .trim();
        
        // 限制长度
        if (text.length > 3000) {
          text = text.substring(0, 3000) + '...(内容已截断)';
        }
        
        return text || '网页内容为空';
      } catch (error: any) {
        console.error(`[LLM] 📄 Fetch webpage failed: ${error.message}`);
        return `抓取网页失败: ${error.message}`;
      }
    },
    {
      name: 'fetch_webpage',
      description: '抓取指定网页的内容。当 web_search 返回的摘要不够详细时，使用此工具获取网页的完整内容。输入网页 URL，返回网页正文。',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: '要抓取的网页 URL',
          },
        },
        required: ['url'],
      },
    }
  );
}

