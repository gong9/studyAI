/**
 * Python Agent 服务客户端
 * 
 * 用于调用 Python deepagents 微服务的 HTTP 客户端。
 * 通过环境变量 USE_DEEPAGENTS 控制是否启用。
 */

const PYTHON_SERVICE_URL = process.env.PYTHON_AGENT_URL || 'http://localhost:8000';
const USE_DEEPAGENTS = process.env.USE_DEEPAGENTS === 'true';

// ==================== 类型定义 ====================

export interface PythonPlanRequest {
  knowledge_base_id: string;
  chapter_title: string;
  chapter_content: string;
  scene_type?: string;
}

export interface PythonPlanResponse {
  success: boolean;
  plan?: any;
  error?: string;
}

export interface PythonDraftRequest {
  knowledge_base_id: string;
  plan: any;
  chapter_key_points?: any[];
  chapter_summary?: string;
  chapter_content?: string;
}

export interface PythonDraftResponse {
  success: boolean;
  markdown?: string;
  error?: string;
}

export interface PythonEnrichRequest {
  knowledge_base_id: string;
  draft_content: string;
  plan: any;
}

export interface PythonEnrichResponse {
  success: boolean;
  enriched_content?: string;
  review_notes?: any[];
  error?: string;
}

export interface PythonProcessManuscriptRequest {
  knowledge_base_id: string;
  manuscript_content: string;
  scene_type?: string;
  skip_review?: boolean;
  skip_enrich?: boolean;
  auto_format?: boolean;
}

export interface PythonProcessManuscriptResponse {
  success: boolean;
  plan?: any;
  original_content?: string;
  processed_content?: string;
  review?: any;
  output_path?: string;
  trace_id?: string;
  stats?: {
    original_length?: number;
    processed_length?: number;
    page_count?: number;
    knowledge_points?: number;
  };
  error?: string;
}

export interface PythonRenderSlidesRequest {
  slidev_md: string;
  kb_type: string;
  enable_decoration?: boolean;
}

export interface SlideInfographic {
  syntax: string;
  position: 'right' | 'bottom' | 'inline';
  size: 'small' | 'medium' | 'large';
}

export interface SlideWithInfographic {
  index: number;
  title: string;
  html: string;
  infographic?: SlideInfographic;
}

export interface VisualPlanDecision {
  page: number;
  title: string;
  content_type: string;
  needs_decoration: boolean;
  reason: string;
}

export interface PythonRenderSlidesResponse {
  success: boolean;
  slides?: SlideWithInfographic[];
  total_count?: number;
  decorated_count?: number;
  paginated_md?: string;  // 智能分页后的 Markdown 内容
  visual_plan?: {
    total_pages: number;
    decorated_pages: number;
    decisions: VisualPlanDecision[];
  };
  trace_id?: string;
  error?: string;
}

// ==================== Trace 类型定义 ====================

export interface TraceStep {
  id: string;
  type: string;
  name: string;
  input?: any;
  output?: any;
  reasoning?: string;
  decision?: string;
  duration_ms?: number;
  timestamp: string;
  error?: string;
}

export interface TraceTimeline {
  time: string;
  type: string;
  name?: string;
  message?: string;
  reasoning?: string;
  decision?: string;
  error?: string;
  duration_ms?: number;
}

export interface TraceDetail {
  id: string;
  name: string;
  status: string;
  start_time: string;
  end_time?: string;
  total_duration_ms?: number;
  steps: TraceStep[];
  input?: any;
  output?: any;
}

export interface TraceListItem {
  id: string;
  name: string;
  status: string;
  start_time: string;
  end_time?: string;
  duration_ms?: number;
  steps_count: number;
}

// ==================== 工具函数 ====================

/**
 * 检查是否启用 Python Agent 服务
 */
export function isDeepAgentsEnabled(): boolean {
  return USE_DEEPAGENTS;
}

/**
 * 检查 Python 服务是否可用
 */
export async function checkPythonServiceHealth(): Promise<boolean> {
  if (!USE_DEEPAGENTS) {
    return false;
  }
  
  try {
    const response = await fetch(`${PYTHON_SERVICE_URL}/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (!response.ok) {
      console.warn('[PythonAgent] Service health check failed:', response.status);
      return false;
    }
    
    const data = await response.json();
    return data.status === 'ok';
  } catch (error) {
    console.warn('[PythonAgent] Service not available:', error);
    return false;
  }
}

// ==================== API 调用函数 ====================

/**
 * 调用 Python 服务生成教学规划
 */
export async function callPythonPlanAPI(
  request: PythonPlanRequest
): Promise<PythonPlanResponse> {
  try {
    const response = await fetch(`${PYTHON_SERVICE_URL}/api/v1/teaching/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    
    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `Python service error: ${response.status} - ${error}` };
    }
    
    return await response.json();
  } catch (error: any) {
    console.error('[PythonAgent] Plan API error:', error);
    return { success: false, error: error.message || 'Python service call failed' };
  }
}

/**
 * 调用 Python 服务生成手稿
 */
export async function callPythonDraftAPI(
  request: PythonDraftRequest
): Promise<PythonDraftResponse> {
  try {
    const response = await fetch(`${PYTHON_SERVICE_URL}/api/v1/teaching/draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    
    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `Python service error: ${response.status} - ${error}` };
    }
    
    return await response.json();
  } catch (error: any) {
    console.error('[PythonAgent] Draft API error:', error);
    return { success: false, error: error.message || 'Python service call failed' };
  }
}

/**
 * 调用 Python 服务审核润色
 */
export async function callPythonEnrichAPI(
  request: PythonEnrichRequest
): Promise<PythonEnrichResponse> {
  try {
    const response = await fetch(`${PYTHON_SERVICE_URL}/api/v1/teaching/enrich`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    
    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `Python service error: ${response.status} - ${error}` };
    }
    
    return await response.json();
  } catch (error: any) {
    console.error('[PythonAgent] Enrich API error:', error);
    return { success: false, error: error.message || 'Python service call failed' };
  }
}

/**
 * 调用 Python 服务处理用户手写的手稿
 * 
 * 用户直接写手稿 → Python Agent 处理 → 渲染 HTML
 */
export async function callPythonProcessManuscriptAPI(
  request: PythonProcessManuscriptRequest
): Promise<PythonProcessManuscriptResponse> {
  try {
    const response = await fetch(`${PYTHON_SERVICE_URL}/api/v1/teaching/process-manuscript`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    
    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `Python service error: ${response.status} - ${error}` };
    }
    
    return await response.json();
  } catch (error: any) {
    console.error('[PythonAgent] Process Manuscript API error:', error);
    return { success: false, error: error.message || 'Python service call failed' };
  }
}

/**
 * 调用 Python 服务渲染幻灯片
 * 
 * 将 Markdown 手稿转换为精美的 HTML 幻灯片，并智能添加信息图装饰。
 * 使用 SlideDesignerAgent 实现四阶段设计流程。
 */
export async function callPythonRenderSlidesAPI(
  request: PythonRenderSlidesRequest
): Promise<PythonRenderSlidesResponse> {
  // PPT 渲染可能需要较长时间（每页需要 LLM 调用），设置 10 分钟超时
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10 * 60 * 1000); // 10 minutes
  
  try {
    const response = await fetch(`${PYTHON_SERVICE_URL}/api/v1/teaching/render-slides`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `Python service error: ${response.status} - ${error}` };
    }
    
    return await response.json();
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      console.error('[PythonAgent] Render Slides API timeout (10 min)');
      return { success: false, error: 'PPT 生成超时，请稍后重试' };
    }
    console.error('[PythonAgent] Render Slides API error:', error);
    return { success: false, error: error.message || 'Python service call failed' };
  }
}

// ==================== Trace API 调用 ====================

/**
 * 获取所有执行追踪列表
 */
export async function listTraces(limit: number = 20): Promise<{ traces: TraceListItem[]; total: number }> {
  try {
    const response = await fetch(`${PYTHON_SERVICE_URL}/api/v1/traces?limit=${limit}`);
    if (!response.ok) {
      throw new Error(`Failed to list traces: ${response.status}`);
    }
    return await response.json();
  } catch (error: any) {
    console.error('[PythonAgent] List traces error:', error);
    return { traces: [], total: 0 };
  }
}

/**
 * 获取追踪详情
 */
export async function getTraceDetail(traceId: string): Promise<TraceDetail | null> {
  try {
    const response = await fetch(`${PYTHON_SERVICE_URL}/api/v1/trace/${traceId}`);
    if (!response.ok) {
      throw new Error(`Failed to get trace: ${response.status}`);
    }
    return await response.json();
  } catch (error: any) {
    console.error('[PythonAgent] Get trace detail error:', error);
    return null;
  }
}

/**
 * 获取追踪时间线
 */
export async function getTraceTimeline(traceId: string): Promise<{ trace_id: string; name: string; status: string; timeline: TraceTimeline[] } | null> {
  try {
    const response = await fetch(`${PYTHON_SERVICE_URL}/api/v1/trace/${traceId}/timeline`);
    if (!response.ok) {
      throw new Error(`Failed to get trace timeline: ${response.status}`);
    }
    return await response.json();
  } catch (error: any) {
    console.error('[PythonAgent] Get trace timeline error:', error);
    return null;
  }
}

/**
 * 获取追踪的思考过程
 */
export async function getTraceReasoning(traceId: string): Promise<{ trace_id: string; reasoning: any[]; count: number } | null> {
  try {
    const response = await fetch(`${PYTHON_SERVICE_URL}/api/v1/trace/${traceId}/reasoning`);
    if (!response.ok) {
      throw new Error(`Failed to get trace reasoning: ${response.status}`);
    }
    return await response.json();
  } catch (error: any) {
    console.error('[PythonAgent] Get trace reasoning error:', error);
    return null;
  }
}

/**
 * 导出追踪（支持 json, markdown, timeline 格式）
 */
export async function exportTrace(traceId: string, format: 'json' | 'markdown' | 'timeline' = 'markdown'): Promise<string | null> {
  try {
    const response = await fetch(`${PYTHON_SERVICE_URL}/api/v1/trace/${traceId}/export?format=${format}`);
    if (!response.ok) {
      throw new Error(`Failed to export trace: ${response.status}`);
    }
    if (format === 'json') {
      const data = await response.json();
      return data.data;
    }
    return await response.text();
  } catch (error: any) {
    console.error('[PythonAgent] Export trace error:', error);
    return null;
  }
}

