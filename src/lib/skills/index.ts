/**
 * Skills 模块入口
 * 
 * Agent Skills 是可被 Agent 调用的、结构化的能力模块
 * 每个 Skill 有明确的输入/输出，可复用，可被 LLM 通过 tool call 调用
 */

// Slide Generation Skill
export {
  generateHtmlSlides,
  skillMetadata as slideGenerationMetadata,
  type HtmlSlide,
  type SlideTheme,
  type HtmlSlideGeneratorInput,
  type HtmlSlideGeneratorOutput,
} from './slide-generation';

// 所有技能的元数据列表（供 Agent 发现使用）
import { skillMetadata as slideGenerationSkill } from './slide-generation';

export const allSkills = [
  slideGenerationSkill,
];

