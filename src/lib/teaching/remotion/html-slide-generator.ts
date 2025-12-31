/**
 * AI HTML 幻灯片生成器
 * 
 * 使用 Gemini（via AIHubMix）直接生成精美的 HTML 幻灯片
 * 每页幻灯片都是独立的 HTML 代码
 */

import OpenAI from 'openai';

// 使用 AIHubMix 的 Gemini
const client = new OpenAI({
  apiKey: process.env.BANANA_API_KEY,
  baseURL: process.env.BANANA_API_BASE || 'https://aihubmix.com/v1',
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

function parseSlidevMarkdown(slidevMd: string): ParsedSection[] {
  let sections = slidevMd.split(/\n---\n/);
  
  if (sections[0].trim().startsWith('---') || sections[0].includes('theme:')) {
    sections = sections.slice(1);
  }
  
  return sections
    .map((section, index) => {
      if (!section.trim()) return null;
      
      const lines = section.trim().split('\n');
      let title = '';
      
      for (const line of lines) {
        const trimmed = line.trim();
        if ((trimmed.startsWith('# ') || trimmed.startsWith('## ')) && !title) {
          title = trimmed.replace(/^#+\s*/, '');
          break;
        }
      }
      
      return {
        index,
        title: title || `第 ${index + 1} 页`,
        content: section.trim(),
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
    name: '科技风',
    description: '深色背景，Cyan 强调色，适合技术培训',
    designPrompt: `
1. **视觉效果**：
   - 深色渐变背景（从 #0f0f23 到 #1a1a3e）
   - 科技感装饰元素（发光球、几何线条、网格）
   - 现代字体（Inter, PingFang SC）
   - 强调色：Cyan (#64ffda)，次要色：Pink (#f472b6)
   - 代码块使用终端风格（深色背景 + 红黄绿圆点装饰）

2. **氛围**：
   - 现代、前沿、科技感
   - 像科技公司的产品发布会
`,
  },
  policy: {
    name: '商务风',
    description: '浅色背景，蓝色强调色，适合制度培训',
    designPrompt: `
1. **视觉效果**：
   - 干净的浅色背景（白色 #ffffff 或浅灰 #f8fafc）
   - 专业的蓝色强调色（#2563eb 蓝色，#1e40af 深蓝）
   - 简洁的几何装饰（线条、方块、渐变条）
   - 商务字体（思源黑体、微软雅黑风格）
   - 表格和列表使用清晰的边框和阴影

2. **氛围**：
   - 专业、正式、可信赖
   - 像企业培训PPT、政府公告
   - 重点内容用蓝色高亮框标注
`,
  },
  legal: {
    name: '庄重风',
    description: '深灰背景，金色强调色，适合普法讲座',
    designPrompt: `
1. **视觉效果**：
   - 深灰色渐变背景（从 #1a1a2e 到 #16213e）
   - 金色/铜色强调色（#d4af37 金色，#cd7f32 铜色）
   - 庄重的装饰元素（天平图案、书本图案、法徽轮廓）
   - 衬线字体风格，增加庄重感
   - 引用法条时使用特殊的边框样式（左侧金色竖线）

2. **氛围**：
   - 庄重、权威、专业
   - 像法院公告、法律讲座
   - 法条引用使用古典卷轴风格装饰
`,
  },
  dark: {
    name: '深色主题',
    description: '通用深色主题',
    designPrompt: `
1. **视觉效果**：
   - 深色渐变背景（从 #0f0f23 到 #1a1a3e）
   - 白色/浅色文字
   - 现代装饰元素
   - 强调色可自由选择
`,
  },
  light: {
    name: '浅色主题',
    description: '通用浅色主题',
    designPrompt: `
1. **视觉效果**：
   - 浅色/白色背景
   - 深色文字
   - 简洁装饰元素
   - 强调色可自由选择
`,
  },
};

// ==================== AI 生成 HTML ====================

// 智能风格系统提示 - 让 AI 根据内容自动判断最佳风格
const SMART_SYSTEM_PROMPT = `你是一位顶级的网页设计师和前端工程师，擅长创建精美的演示文稿幻灯片。

你的任务是将给定的教学内容转换为一个精美的 HTML 幻灯片页面。

## 🎨 智能设计原则

**根据内容自动选择最佳设计风格！**

请分析内容的主题、语气和目的，然后选择最合适的设计方案：

### 可选风格参考（不限于此）：

1. **科技风** - 适合：编程、AI、数据、产品介绍
   - 深色渐变背景（#0f0f23 → #1a1a3e）
   - Cyan (#64ffda) / 紫色 (#a855f7) 强调色
   - 几何线条、网格、发光装饰

2. **商务风** - 适合：流程、制度、管理、培训
   - 浅色/白色背景
   - 蓝色 (#2563eb) 强调色
   - 简洁专业、表格清晰

3. **学术风** - 适合：公式、理论、研究、分析
   - 米色/暖白背景
   - 深棕/墨绿强调色
   - 衬线字体感、引用样式

4. **活力风** - 适合：营销、创意、活动、年轻化内容
   - 渐变彩色背景
   - 橙色/粉色/黄色强调色
   - 圆角、emoji、活泼装饰

5. **庄重风** - 适合：法律、政策、历史、严肃话题
   - 深灰/藏蓝背景
   - 金色 (#d4af37) 强调色
   - 经典装饰、权威感

6. **简约风** - 适合：概念介绍、总结、问答
   - 大面积留白
   - 单一强调色
   - 极简几何

7. **故事风** - 适合：案例、叙事、人物介绍
   - 图文混排
   - 柔和的渐变
   - 沉浸式布局

**注意：你可以混合使用或创造新风格，关键是让设计与内容高度匹配！**

## 通用布局要求

1. **布局**：
   - 全屏幻灯片（width: 100%, height: 100%）- 注意：使用 100% 而不是 100vh！
   - 内容居中或左对齐，有足够的留白
   - 标题醒目，层次分明
   - 所有尺寸使用百分比或固定像素值，不要使用 vh 单位

2. **元素样式**：
   - 列表项：带图标或数字标记，逐条分明
   - 代码块：带语法高亮风格（深色背景 + 终端装饰）
   - 公式：居中显示，可以用 Unicode 数学符号
   - 图片占位：使用渐变色块表示

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
- 确保代码完整可用
- 发挥创意，让每页幻灯片都独一无二！`;

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
   - 图片占位：使用渐变色块表示

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
    ? `请为以下教学内容生成一页精美的 HTML 幻灯片。

## 页面信息
- 页码：第 ${section.index + 1} 页，共 ${totalSlides} 页
- 是否标题页：${section.index === 0 ? '是（需要更醒目的设计）' : '否'}

## 内容
${section.content}

**请根据内容特点，自动选择最合适的设计风格！**
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
  console.log('[HtmlSlideGenerator] 开始生成 HTML 幻灯片...');
  
  const sections = parseSlidevMarkdown(input.slidevMd);
  console.log(`[HtmlSlideGenerator] 解析完成: ${sections.length} 页`);
  
  if (sections.length === 0) {
    throw new Error('没有可解析的幻灯片内容');
  }
  
  // 默认启用智能风格（AI 根据内容自动判断）
  const useSmartStyle = input.smartStyle !== false; // 除非明确关闭，否则默认启用
  
  // 如果不使用智能风格，则使用指定主题或根据知识库类型选择
  const theme: SlideTheme = input.theme || getThemeFromKbType(input.knowledgeBaseType);
  
  if (useSmartStyle) {
    console.log(`[HtmlSlideGenerator] 启用智能风格：AI 将根据每页内容自动选择最佳设计`);
  } else {
    console.log(`[HtmlSlideGenerator] 使用固定主题: ${theme} (${THEME_CONFIGS[theme]?.name || '自动'})`);
  }
  
  const slides: HtmlSlide[] = [];

  // 逐页生成 HTML
  for (const section of sections) {
    console.log(`[HtmlSlideGenerator] 生成第 ${section.index + 1}/${sections.length} 页: ${section.title}`);
    
    try {
      const html = await generateHtmlSlide(section, theme, sections.length, useSmartStyle);
      slides.push({
        index: section.index,
        title: section.title,
        html,
      });
    } catch (error: any) {
      console.error(`[HtmlSlideGenerator] 第 ${section.index + 1} 页生成失败:`, error);
      // 生成一个简单的错误页面
      slides.push({
        index: section.index,
        title: section.title,
        html: `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#0f0f23,#1a1a3e);color:#fff;font-family:Inter,sans-serif;">
          <div style="text-align:center;">
            <h1 style="font-size:2.5rem;margin-bottom:1rem;">${section.title}</h1>
            <p style="color:#8892b0;">内容生成中...</p>
          </div>
        </div>`,
      });
    }
  }
  
  console.log(`[HtmlSlideGenerator] 生成完成: ${slides.length} 页`);
  
  return {
    slides,
    totalCount: slides.length,
  };
}

