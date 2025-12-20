/**
 * PPT 讲解控制协议类型定义
 */

// ====== Server → Client 指令 ======
export type PPTCommand = 
  | { action: 'speak'; text: string }
  | { action: 'highlight'; target: string }
  | { action: 'clear_highlight' }
  | { action: 'next_slide' }
  | { action: 'prev_slide' }
  | { action: 'go_to_slide'; index: number }
  | { action: 'wait'; ms: number }
  | { action: 'end'; message?: string };

// ====== Client → Server 事件 ======
export type PPTEvent = 
  | { event: 'ready'; slideCount: number; currentSlide: number }
  | { event: 'slide_changed'; index: number; content: string }
  | { event: 'speak_end' }
  | { event: 'speak_error'; error: string }
  | { event: 'user_action'; action: 'start' | 'stop' | 'pause' };

// ====== 讲解状态 ======
export interface LectureState {
  manuscriptId: string;
  currentSlide: number;
  totalSlides: number;
  slides: SlideInfo[];
  isLecturing: boolean;
  isPaused: boolean;
  lecturedSlides: number[];  // 已讲解的幻灯片索引
}

export interface SlideInfo {
  index: number;
  content: string;
  title: string;
  elements: SlideElement[];
}

export interface SlideElement {
  id: string;
  type: 'title' | 'text' | 'list' | 'image' | 'table' | 'formula';
  content: string;
}

// ====== LLM Agent 输出 ======
export interface LectureAction {
  action: 'speak' | 'highlight' | 'next_slide' | 'end';
  text?: string;
  target?: string;
  reason?: string;
}

export interface LectureAgentInput {
  currentSlide: SlideInfo;
  lecturedElements: string[];  // 当前幻灯片已讲解的元素 ID
  isFirstSlide: boolean;
  isLastSlide: boolean;
}

export interface LectureAgentOutput {
  actions: LectureAction[];
  nextElementToHighlight?: string;
}

