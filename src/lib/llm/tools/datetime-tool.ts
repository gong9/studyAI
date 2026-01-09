/**
 * 日期时间工具
 */
import { FunctionTool } from 'llamaindex';
import type { ToolContext } from './types';

/**
 * 创建日期时间工具
 */
export function createDateTimeTool(ctx: ToolContext) {
  return FunctionTool.from(
    async (): Promise<string> => {
      const now = new Date();
      
      // 格式化日期时间（中国时区）
      const options: Intl.DateTimeFormatOptions = {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      };
      
      const formatter = new Intl.DateTimeFormat('zh-CN', options);
      const formatted = formatter.format(now);
      
      // 额外提供一些有用信息
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const day = now.getDate();
      const dayOfYear = Math.ceil((now.getTime() - new Date(year, 0, 1).getTime()) / 86400000);
      const weekNumber = Math.ceil(dayOfYear / 7);
      
      const result = `当前日期时间：${formatted}
- 公历日期：${year}年${month}月${day}日
- 今天是 ${year} 年的第 ${dayOfYear} 天
- 今天是 ${year} 年的第 ${weekNumber} 周`;
      
      ctx.toolCalls.push({ tool: 'get_current_datetime', input: '', output: result });
      return result;
    },
    {
      name: 'get_current_datetime',
      description: '获取当前的日期和时间。当用户询问"今天是几号"、"现在几点"、"今天星期几"、"什么时候"等与日期时间相关的问题时使用此工具。',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    }
  );
}

