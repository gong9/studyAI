/**
 * SSE 状态监听 API
 * 
 * 代理 Python 端的 /watch/{book_id} 接口
 */

import { NextRequest } from "next/server";

const PYTHON_AGENT_URL = process.env.PYTHON_AGENT_URL || "http://localhost:8000";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;

  // 创建一个 ReadableStream 来转发 SSE
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await fetch(`${PYTHON_AGENT_URL}/api/v1/storytelling/watch/${id}`, {
          headers: {
            'Accept': 'text/event-stream',
          },
        });

        if (!response.ok || !response.body) {
          controller.enqueue(new TextEncoder().encode(`data: {"error": "Failed to connect"}\n\n`));
          controller.close();
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const text = decoder.decode(value, { stream: true });
          controller.enqueue(new TextEncoder().encode(text));
        }

        controller.close();
      } catch (error) {
        console.error('SSE proxy error:', error);
        controller.enqueue(new TextEncoder().encode(`data: {"error": "Connection failed"}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

