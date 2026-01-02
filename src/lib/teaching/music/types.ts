/**
 * 背景音乐类型定义
 * 
 * 用于智能背景音乐推荐系统
 */

// ==================== 音乐标签类型 ====================

/**
 * 情绪标签
 */
export type MusicMood = 
  | 'calm'        // 平静
  | 'uplifting'   // 积极向上
  | 'inspiring'   // 励志
  | 'focused'     // 专注
  | 'relaxed'     // 放松
  | 'serious'     // 严肃
  | 'cheerful'    // 欢快
  | 'dramatic'    // 戏剧性
  | 'mysterious'; // 神秘

/**
 * 节奏类型
 */
export type MusicTempo = 'slow' | 'medium' | 'fast';

/**
 * 音乐风格类型
 */
export type MusicGenre = 
  | 'piano'       // 钢琴
  | 'ambient'     // 环境音乐
  | 'electronic'  // 电子
  | 'orchestral'  // 管弦乐
  | 'acoustic'    // 原声吉他
  | 'lofi';       // Lo-Fi

/**
 * 适用场景标签
 */
export type MusicScene = 
  | 'teaching'    // 教学
  | 'tech'        // 科技
  | 'business'    // 商务
  | 'law'         // 法律
  | 'storytelling'// 叙事
  | 'intro'       // 开场
  | 'ending';     // 结尾

// ==================== 音乐元数据 ====================

/**
 * 音乐曲目信息
 */
export interface MusicTrack {
  id: string;
  name: string;
  nameEn?: string;         // 英文名（用于匹配）
  artist?: string;
  duration: number;        // 秒
  filename: string;        // MP3 文件名
  
  // AI 匹配用的标签
  mood: MusicMood[];       // 情绪（1-3 个）
  tempo: MusicTempo;       // 节奏
  genre: MusicGenre;       // 类型
  scenes: MusicScene[];    // 适用场景（1-3 个）
  
  // 展示信息
  description?: string;    // 简短描述
  color?: string;          // 主题色（用于 UI）
}

/**
 * 音乐库数据（从 CDN 加载）
 */
export interface MusicLibrary {
  version: string;
  updatedAt: string;
  tracks: MusicTrack[];
}

// ==================== LLM 推荐相关 ====================

/**
 * LLM 分析结果
 */
export interface MusicAnalysisResult {
  mood: MusicMood[];       // 推荐情绪（1-2 个）
  tempo: MusicTempo;       // 推荐节奏
  genre: MusicGenre;       // 推荐类型
  reason: string;          // 推荐理由
}

/**
 * 推荐结果
 */
export interface MusicRecommendation {
  track: MusicTrack;
  score: number;           // 匹配分数（0-100）
  matchReasons: string[];  // 匹配原因
}

/**
 * 完整推荐响应
 */
export interface MusicRecommendationResponse {
  analysis: MusicAnalysisResult;
  recommendations: MusicRecommendation[];
}

// ==================== 课程配置 ====================

/**
 * 背景音乐配置（存储在课程数据中）
 */
export interface BackgroundMusicConfig {
  trackId: string;         // 音乐 ID
  trackName: string;       // 音乐名称（冗余存储，便于展示）
  volume: number;          // 音量 0-1，推荐 0.1-0.3
  enabled: boolean;        // 是否启用
}

// ==================== 标签中文映射 ====================

export const MOOD_LABELS: Record<MusicMood, string> = {
  calm: '平静',
  uplifting: '积极',
  inspiring: '励志',
  focused: '专注',
  relaxed: '放松',
  serious: '严肃',
  cheerful: '欢快',
  dramatic: '戏剧',
  mysterious: '神秘',
};

export const TEMPO_LABELS: Record<MusicTempo, string> = {
  slow: '缓慢',
  medium: '中等',
  fast: '快速',
};

export const GENRE_LABELS: Record<MusicGenre, string> = {
  piano: '钢琴',
  ambient: '环境',
  electronic: '电子',
  orchestral: '管弦乐',
  acoustic: '原声',
  lofi: 'Lo-Fi',
};

export const SCENE_LABELS: Record<MusicScene, string> = {
  teaching: '教学',
  tech: '科技',
  business: '商务',
  law: '法律',
  storytelling: '叙事',
  intro: '开场',
  ending: '结尾',
};

