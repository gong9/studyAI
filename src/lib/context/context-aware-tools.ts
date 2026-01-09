/**
 * 上下文感知的工具包装器
 * 在工具执行后自动检查并更新上下文
 */

import { FunctionTool } from 'llamaindex';
import { AdaptiveContextManager } from './adaptive-context';

/**
 * 工具上下文（扩展版，支持自适应更新）
 */
export interface ContextAwareToolContext {
  /** 自适应上下文管理器 */
  contextManager: AdaptiveContextManager | null;
  /** 共享的增强上下文（会被动态更新） */
  enhancedContext: string;
  /** 是否启用自适应更新 */
  adaptiveEnabled: boolean;
}

/**
 * 包装工具函数，添加上下文感知能力
 */
export function wrapToolWithContextAwareness<T extends (...args: any[]) => any>(
  toolFn: T,
  toolName: string,
  sharedContext: ContextAwareToolContext
): T {
  return (async (...args: Parameters<T>) => {
    const input = JSON.stringify(args);
    
    // 执行原始工具
    const result = await toolFn(...args);
    const output = typeof result === 'string' ? result : JSON.stringify(result);
    
    // 如果启用了自适应上下文
    if (sharedContext.adaptiveEnabled && sharedContext.contextManager) {
      // 记录工具调用
      sharedContext.contextManager.recordToolCall(toolName, input, output);
      
      // 检查是否需要更新
      const { needUpdate, reason } = sharedContext.contextManager.shouldUpdate();
      
      if (needUpdate) {
        
        try {
          await sharedContext.contextManager.updateContext();
          // 更新共享的增强上下文
          sharedContext.enhancedContext = sharedContext.contextManager.getEnhancedContextString();
        } catch (error) {
          console.error(`[ContextAwareTool] Context update failed:`, error);
        }
      }
    }
    
    return result;
  }) as T;
}

/**
 * 包装 LlamaIndex FunctionTool
 * 使用 any 类型绕过复杂的泛型约束
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function wrapFunctionTool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tool: FunctionTool<any, any>,
  sharedContext: ContextAwareToolContext
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): FunctionTool<any, any> {
  const originalFn = tool.call.bind(tool);
  const toolName = tool.metadata.name;
  
  // 创建新的 call 方法
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wrappedCall = async (input: any): Promise<any> => {
    const inputStr = typeof input === 'string' ? input : JSON.stringify(input);
    
    // 执行原始工具
    const result = await originalFn(input);
    const outputStr = typeof result === 'string' ? result : JSON.stringify(result);
    
    // 如果启用了自适应上下文
    if (sharedContext.adaptiveEnabled && sharedContext.contextManager) {
      // 记录工具调用
      sharedContext.contextManager.recordToolCall(toolName, inputStr, outputStr);
      
      // 检查是否需要更新
      const { needUpdate, reason } = sharedContext.contextManager.shouldUpdate();
      
      if (needUpdate) {
        
        try {
          await sharedContext.contextManager.updateContext();
          sharedContext.enhancedContext = sharedContext.contextManager.getEnhancedContextString();
          
          const stats = sharedContext.contextManager.getStats();
        } catch (error) {
          console.error(`[ContextAwareTool] ❌ Context update failed:`, error);
        }
      }
    }
    
    return result;
  };
  
  // 返回包装后的工具（保持原有元数据）
  return new FunctionTool(wrappedCall, {
    name: tool.metadata.name,
    description: tool.metadata.description,
    parameters: tool.metadata.parameters,
  });
}

/**
 * 批量包装工具数组
 */
export function wrapAllTools(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools: FunctionTool<any, any>[],
  sharedContext: ContextAwareToolContext
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): FunctionTool<any, any>[] {
  return tools.map(tool => wrapFunctionTool(tool, sharedContext));
}

/**
 * 创建上下文感知工具上下文
 */
export function createContextAwareToolContext(
  contextManager: AdaptiveContextManager | null,
  initialContext: string,
  enabled: boolean = true
): ContextAwareToolContext {
  return {
    contextManager,
    enhancedContext: initialContext,
    adaptiveEnabled: enabled,
  };
}

