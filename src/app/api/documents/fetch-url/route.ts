/**
 * POST /api/documents/fetch-url
 * 从 URL 抓取文章内容并创建文档
 * 
 * 使用直接抓取 + 本地清洗，稳定可靠
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// 从 HTML 中提取标题
function extractTitle(html: string, url: string): string {
  const patterns = [
    /<title[^>]*>([^<]+)<\/title>/i,
    /<h1[^>]*>([^<]+)<\/h1>/i,
    /<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      return match[1].trim().slice(0, 100);
    }
  }

  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return '导入的文章';
  }
}

// 清洗 HTML，提取正文
function cleanHtml(html: string): string {
  return html
    // 移除 script 和 style
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
    // 移除注释
    .replace(/<!--[\s\S]*?-->/g, '')
    // 移除 nav、header、footer 等非正文区域
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '')
    // 保留段落和标题的换行
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    // 移除所有其他标签
    .replace(/<[^>]+>/g, '')
    // 解码 HTML 实体
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&#\d+;/g, '')
    // 清理多余空白
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/^\s+/gm, '')
    .trim();
}

// 针对特定网站提取正文
function extractContent(html: string, url: string): string {
  let content = '';
  
  // 知乎
  if (url.includes('zhihu.com')) {
    const match = html.match(/<div[^>]*class="[^"]*RichContent-inner[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
      || html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    if (match) content = cleanHtml(match[1]);
  }
  // 掘金
  else if (url.includes('juejin.cn')) {
    const match = html.match(/<article[^>]*class="[^"]*article[^"]*"[^>]*>([\s\S]*?)<\/article>/i)
      || html.match(/<div[^>]*class="[^"]*markdown-body[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (match) content = cleanHtml(match[1]);
  }
  // CSDN
  else if (url.includes('csdn.net')) {
    const match = html.match(/<div[^>]*id="content_views"[^>]*>([\s\S]*?)<\/div>/i)
      || html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    if (match) content = cleanHtml(match[1]);
  }
  // 微信公众号
  else if (url.includes('mp.weixin.qq.com')) {
    const match = html.match(/<div[^>]*id="js_content"[^>]*>([\s\S]*?)<\/div>/i);
    if (match) content = cleanHtml(match[1]);
  }
  // 简书
  else if (url.includes('jianshu.com')) {
    const match = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    if (match) content = cleanHtml(match[1]);
  }
  
  // 通用提取
  if (!content || content.length < 200) {
    // 尝试 article 标签
    const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    if (articleMatch) {
      content = cleanHtml(articleMatch[1]);
    }
  }
  
  if (!content || content.length < 200) {
    // 尝试 main 标签
    const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    if (mainMatch) {
      content = cleanHtml(mainMatch[1]);
    }
  }
  
  if (!content || content.length < 200) {
    // 最后回退：清洗整个 body
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
      content = cleanHtml(bodyMatch[1]);
    } else {
      content = cleanHtml(html);
    }
  }
  
  // 限制长度
  if (content.length > 50000) {
    content = content.slice(0, 50000) + '\n\n[内容过长，已截断]';
  }
  
  return content;
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const body = await request.json();
    const { knowledgeBaseId, url } = body;

    if (!knowledgeBaseId) {
      return NextResponse.json({ error: '缺少知识库 ID' }, { status: 400 });
    }

    if (!url || !url.trim()) {
      return NextResponse.json({ error: 'URL 不能为空' }, { status: 400 });
    }

    // 验证 URL 格式
    let validUrl: URL;
    try {
      validUrl = new URL(url.trim());
      if (!['http:', 'https:'].includes(validUrl.protocol)) {
        throw new Error('Invalid protocol');
      }
    } catch {
      return NextResponse.json({ error: '无效的 URL 格式' }, { status: 400 });
    }

    // 验证知识库所有权
    const knowledgeBase = await prisma.knowledgeBase.findUnique({
      where: { id: knowledgeBaseId },
    });

    if (!knowledgeBase) {
      return NextResponse.json({ error: '知识库不存在' }, { status: 404 });
    }

    if (knowledgeBase.userId !== userId) {
      return NextResponse.json({ error: '无权访问此知识库' }, { status: 403 });
    }


    // 直接抓取网页
    const response = await fetch(validUrl.href, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
      },
      signal: AbortSignal.timeout(15000), // 15 秒超时
    });

    if (!response.ok) {
      return NextResponse.json({ 
        error: `抓取失败: HTTP ${response.status}` 
      }, { status: 400 });
    }

    const html = await response.text();
    
    if (!html || html.length < 500) {
      return NextResponse.json({ error: '网页内容为空' }, { status: 400 });
    }

    // 提取标题和内容
    const title = extractTitle(html, validUrl.href);
    const content = extractContent(html, validUrl.href);

    if (!content || content.length < 100) {
      return NextResponse.json({ 
        error: '无法提取文章内容，可能是动态加载的页面或需要登录' 
      }, { status: 400 });
    }


    // 创建文档记录
    const fileName = `${title.slice(0, 50)}.txt`;
    const fullContent = `# ${title}\n\n> 来源: ${validUrl.href}\n\n---\n\n${content}`;

    const document = await prisma.document.create({
      data: {
        name: fileName,
        path: null,
        content: fullContent,
        wordCount: fullContent.length,
        knowledgeBaseId,
        status: 'pending',
      },
    });


    return NextResponse.json(document, { status: 201 });
  } catch (error: any) {
    console.error('[FetchURL] Error:', error);
    
    if (error.name === 'TimeoutError' || error.message?.includes('timeout')) {
      return NextResponse.json({ 
        error: '抓取超时，请检查链接是否可访问' 
      }, { status: 408 });
    }
    
    return NextResponse.json({ 
      error: error.message || '抓取失败' 
    }, { status: 500 });
  }
}
