/**
 * 阶段3：精读填充
 * 
 * 目标：在 KG 导航下，把概念、章节填充成可讲解内容
 * 
 * 核心输出：
 * - EnrichedConcept[]: 填充后的概念详情
 * - SectionContent[]: 章节讲解内容
 * 
 * 原则：RAG 只做细节补充，不参与结构判断
 */

export { enrichConcepts, type ConceptEnricherInput, type ConceptEnricherOutput } from './concept-enricher';
export { generateSectionContent, type SectionGeneratorInput, type SectionGeneratorOutput } from './section-generator';

