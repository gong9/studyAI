/**
 * POST /api/teaching/orchestrator/execute
 * 
 * AI 小秘书 - 任务执行 API（SSE 流式响应）
 * 逐步执行任务，实时返回进度和结果
 */

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { TaskExecutorService, getPlan, updatePlan, type TaskPlan, type SSEEvent } from '@/lib/teaching/orchestrator';

// SSE 辅助函数
function createSSEResponse(stream: ReadableStream) {
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

function sendSSEEvent(controller: ReadableStreamDefaultController, event: SSEEvent) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  controller.enqueue(new TextEncoder().encode(data));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { planId, fromTaskIndex = 0 } = body;

    if (!planId) {
      return new Response(JSON.stringify({ error: '缺少 planId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 获取计划
    const stored = getPlan(planId);
    if (!stored) {
      return new Response(JSON.stringify({ error: '计划不存在或已过期' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { plan, chapterData } = stored;

    console.log('[Orchestrator] Executing plan:', planId, 'from task:', fromTaskIndex);

    // 创建 SSE 流
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // 更新计划状态
          plan.status = 'executing';
          plan.currentTaskIndex = fromTaskIndex;

          // 发送开始事件
          sendSSEEvent(controller, {
            type: 'plan_start',
            planId,
            data: {
              message: '开始执行任务计划',
              plan,
            },
            timestamp: new Date().toISOString(),
          });

          // 创建执行器
          const executor = new TaskExecutorService(plan, chapterData, {
            onEvent: (event) => sendSSEEvent(controller, event),
          });

          // 逐个执行任务
          for (let i = fromTaskIndex; i < plan.tasks.length; i++) {
            const task = plan.tasks[i];
            plan.currentTaskIndex = i;
            
            task.status = 'running';
            task.startedAt = new Date().toISOString();

            try {
              const result = await executor.executeTask(task);
              
              task.status = 'awaiting_confirm';
              task.result = result;
              task.completedAt = new Date().toISOString();

              // 更新存储
              updatePlan(planId, { plan });

              // 发送等待确认事件
              sendSSEEvent(controller, {
                type: 'await_confirm',
                planId,
                taskId: task.id,
                data: {
                  message: `任务完成，等待确认: ${task.title}`,
                  result,
                },
                timestamp: new Date().toISOString(),
              });

              // 暂停执行，等待用户确认
              plan.status = 'paused';
              break;

            } catch (error: any) {
              task.status = 'failed';
              task.error = error.message;
              plan.status = 'failed';

              sendSSEEvent(controller, {
                type: 'task_error',
                planId,
                taskId: task.id,
                data: {
                  message: `任务失败: ${task.title}`,
                  error: error.message,
                },
                timestamp: new Date().toISOString(),
              });

              break;
            }
          }

          // 检查是否全部完成
          if (plan.tasks.every(t => t.status === 'completed')) {
            plan.status = 'completed';
            
            // 保存到数据库并获取 manuscriptId
            const manuscriptId = await saveToDatabase(plan, chapterData);

            sendSSEEvent(controller, {
              type: 'all_complete',
              planId,
              data: {
                message: '所有任务已完成！',
                plan,
                manuscriptId, // 返回 manuscriptId 用于跳转
              },
              timestamp: new Date().toISOString(),
            });
          }

          controller.close();
        } catch (error: any) {
          console.error('[Orchestrator] Execute error:', error);
          
          sendSSEEvent(controller, {
            type: 'error',
            planId,
            data: {
              error: error.message || '执行出错',
            },
            timestamp: new Date().toISOString(),
          });

          controller.close();
        }
      },
    });

    return createSSEResponse(stream);

  } catch (error: any) {
    console.error('[Orchestrator] Execute error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * 保存执行结果到数据库，返回 manuscriptId
 */
async function saveToDatabase(plan: TaskPlan, chapterData: any): Promise<string | null> {
  try {
    // 提取各阶段结果
    const teachingPlan = plan.context.teachingPlan;
    const manuscript = plan.context.enrichedContent?.markdown || plan.context.manuscript?.markdown;
    const slidev = plan.context.slidev?.markdown;

    if (!manuscript) return null;

    // 创建或更新手稿记录
    const existing = await prisma.teachingManuscript.findFirst({
      where: { chapterId: chapterData.id },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      await prisma.teachingManuscript.update({
        where: { id: existing.id },
        data: {
          teachingPlan: teachingPlan ? JSON.stringify(teachingPlan) : existing.teachingPlan,
          draftContent: manuscript,
          enrichedContent: plan.context.enrichedContent?.markdown,
          slidevMd: slidev,
          status: 'completed',
          updatedAt: new Date(),
        },
      });
      console.log('[Orchestrator] Updated manuscript:', existing.id);
      return existing.id;
    } else {
      const newManuscript = await prisma.teachingManuscript.create({
        data: {
          knowledgeBaseId: plan.knowledgeBaseId,
          chapterId: chapterData.id,
          teachingPlan: teachingPlan ? JSON.stringify(teachingPlan) : null,
          draftContent: manuscript,
          enrichedContent: plan.context.enrichedContent?.markdown,
          slidevMd: slidev,
          status: 'completed',
        },
      });
      console.log('[Orchestrator] Created manuscript:', newManuscript.id);
      return newManuscript.id;
    }
  } catch (error) {
    console.error('[Orchestrator] Save to DB error:', error);
    return null;
  }
}

