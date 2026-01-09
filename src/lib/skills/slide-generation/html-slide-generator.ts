/**
 * AI HTML 幻灯片生成器
 * 
 * 使用 Gemini（via AIHubMix）直接生成精美的 HTML 幻灯片
 * 每页幻灯片都是独立的 HTML 代码
 */

//@ts-ignore
import OpenAI from 'openai';

// 使用 AIHubMix 的 Gemini
const client = new OpenAI({
  apiKey: process.env.BANANA_API_KEY,
  baseURL: process.env.BANANA_API_BASE || 'https://aihubmix.com/v1',
  timeout: 120000, // 增加超时时间到 120 秒
  maxRetries: 2,   // 自动重试 2 次
});

const MODEL = 'gemini-3-flash-preview';

// ==================== 类型定义 ====================

export interface HtmlSlide {
  index: number;
  title: string;
  html: string;  // 完整的 HTML 代码
}

// 主题类型：根据知识库类型自动选择或手动指定
export type SlideTheme = 'tech' | 'policy' | 'legal' | 'dark' | 'light' | 'auto';

export interface HtmlSlideGeneratorInput {
  slidevMd: string;
  theme?: SlideTheme;
  knowledgeBaseType?: string; // 知识库类型，用于自动选择主题
  smartStyle?: boolean; // 是否启用智能风格（AI 根据内容自动判断）
}

export interface HtmlSlideGeneratorOutput {
  slides: HtmlSlide[];
  totalCount: number;
}

// ==================== 解析 Markdown ====================

interface ParsedSection {
  index: number;
  title: string;
  content: string;
}

function parseMarkdownContent(content: string): ParsedSection[] {
  // 支持多种分隔符格式：\n---\n, \n---（行尾）, ---\n（行首）
  let sections = content.split(/\n-{3,}\n|\n-{3,}$|^-{3,}\n/);
  
  // 跳过 frontmatter（如果有的话）
  if (sections[0].trim().startsWith('---') || sections[0].includes('theme:')) {
    sections = sections.slice(1);
  }
  
  return sections
    .map((section, index) => {
      const trimmed = section.trim();
      
      // 跳过空 section
      if (!trimmed) return null;
      
      // 跳过只有标题没有实际内容的 section（内容太少）
      // 但保留第一页（封面页）- 封面页通常只有一个标题是正常的
      const lines = trimmed.split('\n').filter(l => l.trim());
      if (lines.length < 2 && index > 0) {
        // 只有1行或更少，检查是否只是一个标题（但跳过第一页）
        const firstLine = lines[0] || '';
        if (firstLine.startsWith('#') && lines.length === 1) {
          return null;
        }
      }
      
      let title = '';
      
      for (const line of lines) {
        const lineTrimmed = line.trim();
        if ((lineTrimmed.startsWith('# ') || lineTrimmed.startsWith('## ')) && !title) {
          title = lineTrimmed.replace(/^#+\s*/, '');
          break;
        }
      }
      
      return {
        index,
        title: title || `第 ${index + 1} 页`,
        content: trimmed,
      };
    })
    .filter(Boolean) as ParsedSection[];
}

// ==================== 主题配置 ====================

interface ThemeConfig {
  name: string;
  description: string;
  designPrompt: string;
}

// 根据知识库类型自动选择主题
function getThemeFromKbType(kbType?: string): SlideTheme {
  if (!kbType) return 'tech';
  
  const normalizedType = kbType === 'teaching' || kbType === 'k12' ? 'tech' : kbType;
  
  switch (normalizedType) {
    case 'tech':
      return 'tech';
    case 'policy':
      return 'policy';
    case 'legal':
      return 'legal';
    default:
      return 'tech';
  }
}

const THEME_CONFIGS: Record<SlideTheme, ThemeConfig> = {
  tech: {
    name: '科技简洁',
    description: '纯白背景，蓝色强调，阿里风格',
    designPrompt: `
1. **视觉效果**：
   - 纯白背景 (#ffffff)，无渐变
   - 主色：蚂蚁蓝 #1677ff
   - 字体：PingFang SC, -apple-system
   - 大面积留白，内容简洁
   - 代码块：浅灰背景 #f5f5f5，无装饰

2. **氛围**：
   - 简洁、专业、大方
   - 像阿里云、蚂蚁集团的产品文档
`,
  },
  policy: {
    name: '商务简洁',
    description: '纯白背景，蓝色强调，适合制度培训',
    designPrompt: `
1. **视觉效果**：
   - 纯白背景 (#ffffff)
   - 主色：蚂蚁蓝 #1677ff
   - 标题：#1f1f1f，正文：#434343
   - 表格：简洁边框 #f0f0f0
   - 卡片：轻微阴影或细边框

2. **氛围**：
   - 专业、正式、可信赖
   - 重点内容用浅蓝背景 #e6f4ff 标注
`,
  },
  legal: {
    name: '庄重简洁',
    description: '浅灰背景，深蓝强调，适合正式场合',
    designPrompt: `
1. **视觉效果**：
   - 极浅灰背景 (#fafafa)
   - 主色：深蓝 #1e3a8a
   - 辅助色：金色 #b45309（用于重点）
   - 字体保持简洁，略带庄重
   - 引用使用左侧深蓝竖线

2. **氛围**：
   - 庄重、权威、简洁
   - 像正式的法律文书风格
`,
  },
  dark: {
    name: '深色简洁',
    description: '深灰背景，白色文字',
    designPrompt: `
1. **视觉效果**：
   - 深灰背景 (#1f1f1f)，无渐变
   - 白色文字 #ffffff
   - 蓝色强调 #1677ff
   - 保持简洁，不要装饰
`,
  },
  light: {
    name: '浅色简洁',
    description: '阿里风格浅色主题',
    designPrompt: `
1. **视觉效果**：
   - 纯白背景 (#ffffff)
   - 标题 #1f1f1f，正文 #434343
   - 蓝色强调 #1677ff
   - 大面积留白，极简设计
`,
  },
  auto: {
    name: '自动选择',
    description: '默认使用阿里简洁风格',
    designPrompt: '',
  },
};

// ==================== AI 生成 HTML ====================

// 智能风格系统提示 - 阿里风格：简洁、大方、专业
const SMART_SYSTEM_PROMPT = `你是一位资深的阿里巴巴/蚂蚁集团设计师，擅长创建简洁大方的商务演示文稿。

**⚠️ 最重要的规则：只展示用户提供的内容，严禁添加任何装饰性文字！**
- 禁止添加：公司名称（如"XX集团"、"XX公司"、"蚂蚁集团"）
- 禁止添加：品牌标语、水印文字
- 禁止添加："技术培训"、"课程介绍"等通用标题
- 禁止添加：任何用户内容中没有的文字

你的设计理念是：**少即是多，留白即是美**。

## 🎯 核心设计原则

### 1. 极简主义
- **纯净背景**：纯白 (#ffffff) 或极浅灰 (#fafafa)，绝不使用渐变背景
- **大面积留白**：内容区域只占页面 60-70%，四周留足空间
- **克制装饰**：不要装饰性线条、发光效果、几何图案、网格背景
- **禁止**：渐变色块、发光球、科技感线条、过多的边框阴影

### 2. 色彩体系
- **主色**：专业蓝 #1677ff（用于标题强调、序号）
- **辅助色**：
  - 成功绿 #52c41a
  - 警告橙 #faad14
  - 错误红 #ff4d4f
- **中性色**：
  - 标题文字：#1f1f1f
  - 正文文字：#434343
  - 次要文字：#8c8c8c
  - 分割线：#f0f0f0
- **禁止使用**：紫色渐变、霓虹色、过于鲜艳的颜色组合

### 3. 字体规范
- **中文字体**：PingFang SC, -apple-system, "Microsoft YaHei"
- **英文/数字**：-apple-system, SF Pro Display
- **标题**：28-36px，字重 600，颜色 #1f1f1f
- **正文**：16-18px，字重 400，颜色 #434343，行高 1.7
- **禁止**：使用 Inter、Roboto 等典型 AI 风格字体

### 4. 布局规范
- **内边距**：左右 80px，上下 60px
- **标题位置**：页面左上区域，左对齐
- **内容区域**：标题下方，保持左对齐为主
- **卡片间距**：24px
- **禁止**：内容居中铺满、过于紧凑的排版

### 5. 组件样式
- **列表**：
  - 使用简洁的圆点或数字序号
  - 序号使用蓝色 #1677ff
  - 每项之间留有舒适间距（16-20px）
  
- **卡片**：
  - 白色背景 + 极细边框 (1px solid #f0f0f0)
  - 或无边框 + 轻微阴影 (0 1px 2px rgba(0,0,0,0.03))
  - 圆角 8px
  - 内边距 24px
  
- **代码块**：
  - 浅灰背景 #f5f5f5
  - 深色文字 #1f1f1f
  - 简洁无装饰，不要终端风格的圆点
  
- **高亮/强调**：
  - 使用蓝色文字 #1677ff
  - 或使用浅蓝背景 #e6f4ff + 蓝色边框
  - 不要使用渐变或发光效果

## ⚠️ 严格禁止的元素

1. ❌ 深色/黑色背景
2. ❌ 渐变背景（尤其是紫色渐变）
3. ❌ 发光球、光晕效果
4. ❌ 科技感线条、网格背景
5. ❌ 过多的装饰性几何图形
6. ❌ 霓虹色、Cyan、Pink 等强对比色
7. ❌ 卡片堆叠过多阴影
8. ❌ 过度的圆角（超过 12px）
9. ❌ emoji 作为装饰
10. ❌ 任何用户内容中没有的文字（如公司名称、品牌标语、水印）
11. ❌ **图片占位符**：如果内容提到"图"、"架构图"、"示意图"、"流程图"等，直接省略，不要生成空白占位框或占位文字

## 输出要求

- 尺寸：width: 100%, height: 100%（不用 vh 单位）
- 只输出 <div class="slide" style="...">...</div>
- 不要 <!DOCTYPE>、<html> 等标签
- 禁止 CSS 动画（animation、keyframes、transition）
- 直接输出 HTML，不要 \`\`\`html 标记
- **严禁添加用户内容中没有的任何文字！只能展示用户提供的内容！**
- **如果无法真正显示图片/图表，直接省略，不要生成任何占位符！**`;

// 保留旧的固定主题构建函数（作为备用）
function buildSystemPrompt(theme: SlideTheme): string {
  const themeConfig = THEME_CONFIGS[theme];
  
  return `你是一位顶级的网页设计师和前端工程师，擅长创建精美的演示文稿幻灯片。

你的任务是将给定的教学内容转换为一个精美的 HTML 幻灯片页面。

## 当前主题：${themeConfig.name}
${themeConfig.description}

## 设计要求
${themeConfig.designPrompt}

## 通用布局要求

1. **布局**：
   - 全屏幻灯片（width: 100%, height: 100%）- 注意：使用 100% 而不是 100vh！
   - 内容居中或左对齐，有足够的留白
   - 标题醒目，层次分明
   - 所有尺寸使用百分比或固定像素值，不要使用 vh 单位

2. **元素样式**：
   - 列表项：带图标或数字标记，逐条分明
   - 代码块：带语法高亮风格
   - 公式：居中显示，可以用 Unicode 数学符号
   - 图片/图表：如果无法真正显示，直接省略，不要生成占位符

3. **动态效果**：
   - ⚠️ 禁止使用 CSS 动画（animation、@keyframes、transition）！
   - 动画由 Remotion 视频渲染器统一处理
   - 只生成静态 HTML，元素保持最终位置

## 输出格式

只输出一个完整的 HTML 代码块，包含内联 CSS 样式。不要包含 \`\`\`html 标记，直接输出 HTML 代码。

结构如下：
<div class="slide" style="...">
  <!-- 背景装饰 -->
  <!-- 内容区域 -->
</div>

注意：
- 不需要 <!DOCTYPE>、<html>、<head>、<body> 标签
- 只输出幻灯片的 div 容器
- 所有样式都内联或使用 <style> 标签
- 确保代码完整可用`;
}

async function generateHtmlSlide(
  section: ParsedSection,
  theme: SlideTheme,
  totalSlides: number,
  useSmartStyle: boolean = true
): Promise<string> {
  // 智能风格模式：让 AI 根据内容自动判断最佳设计
  const systemPrompt = useSmartStyle 
    ? SMART_SYSTEM_PROMPT 
    : buildSystemPrompt(theme === 'auto' ? 'tech' : theme);
  
  const userPrompt = useSmartStyle
    ? `请为以下教学内容生成一页简洁大方的 HTML 幻灯片。

## 页面信息
- 页码：第 ${section.index + 1} 页，共 ${totalSlides} 页
- 是否标题页：${section.index === 0 ? '是（标题页需要更大气，但依然简洁）' : '否'}

## 内容
${section.content}

**请严格遵循阿里设计规范：纯白背景、大面积留白、蓝色强调、禁止装饰性元素！**
请直接输出 HTML 代码，不要包含任何解释。`
    : `请为以下教学内容生成一页精美的 HTML 幻灯片。

## 页面信息
- 页码：第 ${section.index + 1} 页，共 ${totalSlides} 页
- 主题风格：${THEME_CONFIGS[theme === 'auto' ? 'tech' : theme].name}
- 是否标题页：${section.index === 0 ? '是' : '否'}

## 内容
${section.content}

请直接输出 HTML 代码，不要包含任何解释。`;

  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.8, // 稍微提高温度，增加多样性
    max_tokens: 4000,
  });

  let html = response.choices[0]?.message?.content || '';
  
  // 清理可能的 markdown 代码块标记
  html = html.replace(/^```html?\n?/i, '').replace(/\n?```$/i, '').trim();
  
  return html;
}

// ==================== 主入口函数 ====================

export async function generateHtmlSlides(
  input: HtmlSlideGeneratorInput
): Promise<HtmlSlideGeneratorOutput> {
  
  const sections = parseMarkdownContent(input.slidevMd);
  
  if (sections.length === 0) {
    throw new Error('没有可解析的幻灯片内容');
  }
  
  // 默认启用智能风格（AI 根据内容自动判断）
  const useSmartStyle = input.smartStyle !== false; // 除非明确关闭，否则默认启用
  
  // 如果不使用智能风格，则使用指定主题或根据知识库类型选择
  const theme: SlideTheme = input.theme || getThemeFromKbType(input.knowledgeBaseType);
  
  if (useSmartStyle) {
  } else {
  }
  
  const slides: HtmlSlide[] = [];

  // 逐页生成 HTML
  for (const section of sections) {
    
    try {
      const html = await generateHtmlSlide(section, theme, sections.length, useSmartStyle);
      slides.push({
        index: section.index,
        title: section.title,
        html,
      });
    } catch (error: any) {
      console.error(`[SlideGeneration] 第 ${section.index + 1} 页生成失败:`, error);
      // 生成一个简单的错误页面（阿里风格）
      slides.push({
        index: section.index,
        title: section.title,
        html: `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#ffffff;color:#1f1f1f;font-family:PingFang SC,-apple-system,Microsoft YaHei,sans-serif;padding:60px 80px;box-sizing:border-box;">
          <div style="text-align:center;">
            <h1 style="font-size:32px;font-weight:600;margin-bottom:16px;color:#1f1f1f;">${section.title}</h1>
            <p style="color:#8c8c8c;font-size:16px;">内容生成中...</p>
          </div>
        </div>`,
      });
    }
  }
  
  
  return {
    slides,
    totalCount: slides.length,
  };
}

