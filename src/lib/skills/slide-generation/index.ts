/**
 * Skill: Slide Generation
 * 
 * 将手稿内容转换为精美 HTML 幻灯片
 */

export {
  generateHtmlSlides,
  type HtmlSlide,
  type SlideTheme,
  type HtmlSlideGeneratorInput,
  type HtmlSlideGeneratorOutput,
} from './html-slide-generator';

// 技能元数据（供 Agent 发现使用）
export const skillMetadata = {
  name: 'slide-generation',
  description: '将 Markdown 手稿转换为精美 HTML 幻灯片，支持多种主题风格和 AI 智能设计',
  version: '1.0.0',
  capabilities: [
    '将 Markdown 转换为 HTML 幻灯片',
    '支持 tech/policy/legal 等多种主题',
    'AI 智能选择最佳设计风格',
    '生成 Remotion 兼容的幻灯片',
  ],
  inputSchema: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'Markdown 格式的手稿内容（用 --- 分隔页面）',
      },
      knowledgeBaseType: {
        type: 'string',
        enum: ['tech', 'policy', 'legal'],
        description: '知识库类型，用于自动选择主题',
      },
      theme: {
        type: 'string',
        enum: ['tech', 'policy', 'legal', 'dark', 'light', 'auto'],
        description: '主题风格',
      },
      smartStyle: {
        type: 'boolean',
        description: '是否启用 AI 智能风格（默认 true）',
      },
    },
    required: ['content'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      slides: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            index: { type: 'number' },
            title: { type: 'string' },
            html: { type: 'string' },
          },
        },
      },
      slideCount: { type: 'number' },
    },
  },
};

