/**
 * 智能背景音乐推荐服务
 * 
 * 使用 LLM 分析课程内容，推荐合适的背景音乐
 */

import { OpenAI } from '@llamaindex/openai';
import { getMusicLibrary } from './music-service';
import type {
  MusicTrack,
  MusicMood,
  MusicTempo,
  MusicGenre,
  MusicAnalysisResult,
  MusicRecommendation,
  MusicRecommendationResponse,
} from './types';

// ==================== LLM 分析 Prompt ====================

const MUSIC_ANALYSIS_PROMPT = `你是一位专业的视频配乐师。请分析以下教学课程内容，推荐合适的背景音乐风格。

## 课程内容
{courseContent}

## 课程场景类型
{sceneType}

## 请分析并输出 JSON 格式的推荐：

{
  "mood": ["情绪标签1", "情绪标签2"],
  "tempo": "节奏",
  "genre": "音乐类型",
  "reason": "推荐理由（一句话，中文）"
}

## 可选值

### mood（情绪，选 1-2 个）
- calm: 平静、安宁
- uplifting: 积极向上
- inspiring: 励志、鼓舞
- focused: 专注、沉稳
- relaxed: 放松、惬意
- serious: 严肃、庄重
- cheerful: 欢快、活泼
- dramatic: 戏剧性、张力
- mysterious: 神秘、探索

### tempo（节奏，选 1 个）
- slow: 缓慢（适合讲解概念、法律条文）
- medium: 中等（适合一般教学）
- fast: 快速（适合活动、游戏化内容）

### genre（类型，选 1 个）
- piano: 钢琴（适合文学、历史、情感类）
- ambient: 环境音乐（适合通用教学）
- electronic: 电子音乐（适合科技、编程）
- orchestral: 管弦乐（适合法律、政策、庄重场合）
- acoustic: 原声吉他（适合故事、叙事）
- lofi: Lo-Fi（适合编程、设计、年轻化内容）

## 分析要点
1. **内容主题**：技术类选电子/lofi，文学类选钢琴，法律类选管弦乐
2. **情绪基调**：励志内容选 uplifting，严肃内容选 serious/calm
3. **受众特点**：K12 可稍活泼，成人培训要稳重专业
4. **讲解节奏**：概念讲解选 slow，互动内容选 medium

只输出 JSON，不要其他内容。`;

// ==================== 核心函数 ====================

/**
 * 使用 LLM 分析课程内容
 */
export async function analyzeContentForMusic(
  courseContent: string,
  sceneType: string = 'general'
): Promise<MusicAnalysisResult> {
  try {
    const llm = new OpenAI({
      model: process.env.OPENAI_MODEL || 'qwen-plus',
      apiKey: process.env.OPENAI_API_KEY!,
      additionalSessionOptions: {
        baseURL: process.env.OPENAI_API_BASE || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      },
    });

    // 截断内容，避免 token 过长
    const truncatedContent = courseContent.substring(0, 3000);

    const prompt = MUSIC_ANALYSIS_PROMPT
      .replace('{courseContent}', truncatedContent)
      .replace('{sceneType}', sceneType);

    console.log('[MusicRecommender] Analyzing content for music...');

    const response = await llm.complete({ prompt });
    const text = response.text.trim();

    // 解析 JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      
      // 验证并规范化结果
      return {
        mood: validateMoods(result.mood),
        tempo: validateTempo(result.tempo),
        genre: validateGenre(result.genre),
        reason: result.reason || '根据内容特点推荐',
      };
    }

    throw new Error('Failed to parse LLM response');
  } catch (error) {
    console.error('[MusicRecommender] Analysis failed:', error);
    
    // 返回默认推荐
    return getDefaultAnalysis(sceneType);
  }
}

/**
 * 根据分析结果匹配音乐
 */
export function matchMusicByAnalysis(
  tracks: MusicTrack[],
  analysis: MusicAnalysisResult,
  limit: number = 5
): MusicRecommendation[] {
  const scored = tracks.map(track => {
    let score = 0;
    const matchReasons: string[] = [];

    // 情绪匹配（权重 40%）
    const moodMatches = analysis.mood.filter(m => track.mood.includes(m));
    if (moodMatches.length > 0) {
      score += moodMatches.length * 20;
      matchReasons.push(`情绪匹配: ${moodMatches.join(', ')}`);
    }

    // 节奏匹配（权重 25%）
    if (track.tempo === analysis.tempo) {
      score += 25;
      matchReasons.push(`节奏匹配: ${analysis.tempo}`);
    }

    // 类型匹配（权重 35%）
    if (track.genre === analysis.genre) {
      score += 35;
      matchReasons.push(`风格匹配: ${analysis.genre}`);
    }

    return {
      track,
      score,
      matchReasons,
    };
  });

  // 按分数排序，返回前 N 首
  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * 完整的推荐流程
 */
export async function recommendMusic(
  courseContent: string,
  sceneType: string = 'general'
): Promise<MusicRecommendationResponse> {
  // 1. LLM 分析
  const analysis = await analyzeContentForMusic(courseContent, sceneType);
  
  // 2. 获取音乐库
  const library = await getMusicLibrary();
  
  // 3. 匹配推荐
  const recommendations = matchMusicByAnalysis(library.tracks, analysis, 5);
  
  console.log('[MusicRecommender] Recommendations:', {
    analysis,
    count: recommendations.length,
  });
  
  return {
    analysis,
    recommendations,
  };
}

// ==================== 辅助函数 ====================

const VALID_MOODS: MusicMood[] = [
  'calm', 'uplifting', 'inspiring', 'focused', 'relaxed',
  'serious', 'cheerful', 'dramatic', 'mysterious',
];

const VALID_TEMPOS: MusicTempo[] = ['slow', 'medium', 'fast'];

const VALID_GENRES: MusicGenre[] = [
  'piano', 'ambient', 'electronic', 'orchestral', 'acoustic', 'lofi',
];

function validateMoods(moods: unknown): MusicMood[] {
  if (!Array.isArray(moods)) return ['calm'];
  const valid = moods.filter(m => VALID_MOODS.includes(m as MusicMood));
  return valid.length > 0 ? valid.slice(0, 2) as MusicMood[] : ['calm'];
}

function validateTempo(tempo: unknown): MusicTempo {
  if (VALID_TEMPOS.includes(tempo as MusicTempo)) {
    return tempo as MusicTempo;
  }
  return 'slow';
}

function validateGenre(genre: unknown): MusicGenre {
  if (VALID_GENRES.includes(genre as MusicGenre)) {
    return genre as MusicGenre;
  }
  return 'ambient';
}

/**
 * 根据场景类型返回默认分析结果
 */
function getDefaultAnalysis(sceneType: string): MusicAnalysisResult {
  const defaults: Record<string, MusicAnalysisResult> = {
    k12_teaching: {
      mood: ['uplifting', 'focused'],
      tempo: 'medium',
      genre: 'ambient',
      reason: '适合 K12 教学的积极向上的背景音乐',
    },
    tech_training: {
      mood: ['focused'],
      tempo: 'slow',
      genre: 'lofi',
      reason: '适合技术培训的专注型 Lo-Fi 音乐',
    },
    law_popularization: {
      mood: ['serious', 'calm'],
      tempo: 'slow',
      genre: 'orchestral',
      reason: '适合法律普及的庄重管弦乐',
    },
    general: {
      mood: ['calm', 'focused'],
      tempo: 'slow',
      genre: 'piano',
      reason: '通用的平静钢琴背景音乐',
    },
  };

  return defaults[sceneType] || defaults.general;
}

