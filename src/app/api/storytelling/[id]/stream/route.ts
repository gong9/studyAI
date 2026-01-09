/**
 * 流式进度推送 API
 *
 * GET /api/storytelling/[id]/stream
 *
 * 使用 SSE 推送处理进度。
 */

import { NextRequest } from "next/server";

const PYTHON_AGENT_URL = process.env.PYTHON_AGENT_URL || "http://localhost:8000";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;

  // 创建 SSE 流
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // 定时轮询状态并推送
      let isRunning = true;
      let lastStatus = "";

      const poll = async () => {
        while (isRunning) {
          try {
            const response = await fetch(
              `${PYTHON_AGENT_URL}/api/v1/storytelling/status/${id}`
            );

            if (response.ok) {
              const status = await response.json();
              const statusStr = JSON.stringify(status);

              // 只有状态变化时才推送
              if (statusStr !== lastStatus) {
                lastStatus = statusStr;
                controller.enqueue(
                  encoder.encode(`data: ${statusStr}\n\n`)
                );

                // 如果完成或出错，停止轮询
                if (status.status === "completed" || status.status === "error") {
                  isRunning = false;
                  controller.close();
                  return;
                }
              }
            }
          } catch (error) {
            console.error("Poll status error:", error);
          }

          // 每 2 秒轮询一次
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      };

      // 处理客户端断开
      request.signal.addEventListener("abort", () => {
        isRunning = false;
      });

      poll();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

