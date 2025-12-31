/**
 * Remotion 幻灯片类型定义
 * 
 * 定义 HTML 幻灯片的数据结构，用于替代 base64 图片
 */

// ==================== 幻灯片类型 ====================

export type SlideType = 
  | 'title'       // 标题页
  | 'content'     // 内容页（列表、要点）
  | 'twoColumn'   // 双栏布局
  | 'imageText'   // 图文混排
  | 'quote'       // 引用/金句
  | 'code';       // 代码展示

// ==================== 风格主题 ====================

export type SlideStyle = 
  | 'dark'        // 深色主题
  | 'light'       // 浅色主题
  | 'gradient'    // 渐变背景
  | 'minimal'     // 极简风格
  | 'vibrant';    // 活力配色

// ==================== 内容块类型 ====================

export interface TextBlock {
  type: 'text';
  content: string;
  highlight?: boolean;
}

export interface ListBlock {
  type: 'list';
  items: string[];
  ordered?: boolean;
}

export interface ImageBlock {
  type: 'image';
  src: string;        // URL 或 base64
  alt?: string;
  caption?: string;
}

export interface CodeBlock {
  type: 'code';
  code: string;
  language?: string;
}

export interface FormulaBlock {
  type: 'formula';
  latex: string;
}

export interface TableBlock {
  type: 'table';
  headers: string[];
  rows: string[][];
}

export type ContentBlock = 
  | TextBlock 
  | ListBlock 
  | ImageBlock 
  | CodeBlock 
  | FormulaBlock
  | TableBlock;

// ==================== 背景配置 ====================

export interface BackgroundConfig {
  type: 'solid' | 'gradient' | 'image' | 'pattern';
  color?: string;
  gradientFrom?: string;
  gradientTo?: string;
  gradientDirection?: 'to-r' | 'to-b' | 'to-br' | 'to-bl';
  imageUrl?: string;
  pattern?: 'dots' | 'grid' | 'lines';
  opacity?: number;
}

// ==================== 动画配置 ====================

export interface AnimationConfig {
  // 标题动画
  titleAnimation?: 'fadeIn' | 'slideUp' | 'typewriter' | 'none';
  titleDelay?: number; // 延迟（帧数）
  
  // 内容动画
  contentAnimation?: 'fadeIn' | 'slideUp' | 'stagger' | 'none';
  contentStaggerDelay?: number; // 逐条出现的间隔（帧数）
  
  // 整体动画
  slideTransition?: 'fade' | 'slide' | 'zoom' | 'none';
}

// ==================== 幻灯片数据 ====================

export interface SlideData {
  type: SlideType;
  style: SlideStyle;
  
  // 内容
  title?: string;
  subtitle?: string;
  content?: ContentBlock[];
  
  // 双栏布局专用
  leftContent?: ContentBlock[];
  rightContent?: ContentBlock[];
  
  // 引用页专用
  quote?: string;
  author?: string;
  
  // 代码页专用
  codeBlocks?: CodeBlock[];
  
  // 配置
  background?: BackgroundConfig;
  animations?: AnimationConfig;
  
  // 元数据
  speakerNotes?: string;  // 讲稿备注
}

// ==================== 课程帧类型（复用现有结构）====================

export interface CourseFrame {
  slideIndex: number;
  action: 'speak' | 'highlight' | 'next_slide' | 'end';
  text?: string;           // 字幕文本
  audioIndex?: number;     // 对应 audioData 中的索引
  audioDuration?: number;  // 音频时长(ms)
  highlightTarget?: string;
  timestamp: number;       // 帧开始时间(ms)
}

// ==================== 课程数据 ====================

export interface CourseData {
  id: string;
  title: string;
  description?: string;
  duration: number;        // 总时长(ms)
  
  // 核心数据
  slides: SlideData[];
  frames: CourseFrame[];
  audioData: { [key: number]: string };  // index -> base64 音频
  
  // 统计
  slideCount: number;
  frameCount: number;
}

// ==================== 生成配置 ====================

export interface SlideGeneratorConfig {
  // 默认风格（AI 可以根据内容覆盖）
  defaultStyle?: SlideStyle;
  
  // 动画配置
  enableAnimations?: boolean;
  defaultAnimations?: AnimationConfig;
  
  // 主题色（用于生成一致的配色）
  primaryColor?: string;
  accentColor?: string;
}

// ==================== 工具类型 ====================

// 从 Slidev Markdown 解析的幻灯片内容
export interface ParsedSlide {
  index: number;
  title: string;
  content: string;
  elements: {
    id: string;
    type: 'title' | 'text' | 'list' | 'image' | 'code' | 'formula';
    content: string;
  }[];
}

// AI 生成幻灯片的输入
export interface SlideGeneratorInput {
  slidevMd: string;
  config?: SlideGeneratorConfig;
}

// AI 生成幻灯片的输出
export interface SlideGeneratorOutput {
  slides: SlideData[];
  totalDuration?: number;
}

