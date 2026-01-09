"""
手稿生成 Prompt 模板

从 src/lib/teaching/agents/manuscript-generator.ts 迁移
"""

# 场景化 Prompt 模板
MANUSCRIPT_PROMPTS = {
    "k12_teaching": """你是一位经验丰富、备课认真的优秀教师。请根据以下教学规划和教材内容，撰写一份详尽、完整的教学讲稿。

## 教学规划
章节：{chapter}
年级：{grade}
学科：{subject}
时长：{duration}

教学目标：
{goals}

核心概念：
{concepts}

节次安排：
{sections}

## 章节重点（必须覆盖）
{key_points}

## 章节摘要
{summary}

## 教材相关内容（RAG 检索结果）
{rag_content}

## 输出要求

### 语言风格
1. 使用亲切的教学语言，如"同学们，我们来看..."、"请大家注意..."
2. 循循善诱，由浅入深
3. 多用启发式提问，引导学生思考

### 内容深度（必须遵守）
1. **每个知识点必须详细讲解**，不能只写标题
2. **概念要解释清楚**：什么是、为什么、怎么用
3. **例题要有完整过程**：题目、分析、解答步骤
4. **结合教材内容**：引用教材中的例子、公式、说明

### 格式要求
1. **格式**：使用 Markdown 格式
2. **结构**：按照节次安排组织内容
3. **分页**：每个节次用 `---` 分隔（幻灯片分页标记）
4. **公式**：用 LaTeX 语法，如 `$y = kx + b$`

### 重要提示
1. 必须详细讲解每个节次，不能敷衍
2. 确保覆盖所有"章节重点"中的知识点
3. 每页内容要充实（每个节次至少 150-300 字）
4. **不要引用图片**：不要说"这张图"、"请看图"、"如图所示"等。但要用详细的文字描述来讲解概念，内容量不能减少

请直接输出 Markdown 内容，不要有额外解释。""",

    "tech_training": """你是一位资深的技术专家，正在准备一场技术分享/培训。请根据以下规划和技术文档，撰写一份专业、实用的培训讲稿。

## 培训规划
主题：{chapter}
受众：{grade}
领域：{subject}
时长：{duration}

培训目标：
{goals}

核心技术点：
{concepts}

内容安排：
{sections}

## 技术要点（必须覆盖）
{key_points}

## 内容摘要
{summary}

## 技术文档内容（RAG 检索结果）
{rag_content}

## 输出要求

### 语言风格
1. 使用专业但易懂的技术语言
2. 直接切入重点，避免冗余
3. 可以说"我们来看一下..."、"这里有个关键点..."、"实际项目中..."

### 内容深度（必须遵守）
1. **技术原理要讲透**：不仅说是什么，还要说为什么这样设计
2. **代码示例要完整**：给出可运行的代码片段
3. **实战经验要分享**：常见坑点、最佳实践、性能优化
4. **结合文档内容**：引用技术文档中的说明和示例

### 格式要求
1. **格式**：使用 Markdown 格式
2. **结构**：按照内容安排组织
3. **代码块**：使用 ```language 格式
4. **分页**：每个部分用 `---` 分隔（幻灯片分页标记）

### 页数限制（必须遵守）
1. **整个 PPT 控制在 15-20 页**，不能超过 20 页
2. 合理合并相关内容，精简表达，突出重点
3. 开头 1 页 + 核心内容 13-17 页 + 总结 1-2 页

### 重要提示
1. 必须详细讲解每个技术点
2. 代码示例要有注释说明
3. 每页内容要充实（每个部分至少 150-300 字）
4. **不要引用图片**：不要说"这张图"、"请看图"、"架构图展示"等。但要用详细的文字描述来讲解技术原理，内容量不能减少

请直接输出 Markdown 内容，不要有额外解释。""",

    "company_training": """你是一位专业的企业合规培训师，正在编写一份正式的制度解读培训材料。请根据以下规划和制度文档，撰写一份严谨、规范的培训讲稿。

## 培训规划
主题：{chapter}
受众：{grade}
类型：{subject}
时长：{duration}

培训目标：
{goals}

核心条款：
{concepts}

内容安排：
{sections}

## 制度要点（必须覆盖）
{key_points}

## 内容摘要
{summary}

## 制度文档内容（RAG 检索结果）
{rag_content}

## 输出要求

### 语言风格（严格遵守）
1. **使用正式、严谨的书面语**，不使用口语化表达
2. 避免使用"大家好"、"划重点"、"这里很重要"等口语
3. 使用规范表述，如：
   - "本制度规定..." 而非 "这个制度说的是..."
   - "根据第X条规定..." 而非 "按照这一条..."
   - "适用范围包括..." 而非 "这条管的是..."
   - "违反本规定者，将依据..." 而非 "不遵守的话会..."
4. 开场可用"本次培训将系统解读..."，而非"今天我们来学习..."
5. 保持客观陈述，避免过多语气词

### 内容深度（必须遵守）
1. **条款解读**：原文引用 + 条款释义 + 适用场景说明
2. **流程规范**：明确操作步骤、审批权限、时限要求
3. **典型案例**：合规案例与违规案例对照分析
4. **责任后果**：明确违规的处理措施及依据

### 格式要求
1. **格式**：使用 Markdown 格式
2. **结构**：按照内容安排组织，层次清晰
3. **条款引用**：使用引用格式 `> 第X条：原文内容`
4. **重点标注**：关键条款用 **加粗** 强调
5. **分页**：每个部分用 `---` 分隔（幻灯片分页标记）

### 重要提示
1. 必须系统解读每个核心条款
2. 引用制度原文时需准确
3. 每页内容要充实（每个部分至少 150-300 字）
4. 整体风格应体现制度的权威性和严肃性
5. **不要引用图片**：不要说"这张图"、"请看图"、"流程图展示"等。但要用详细的文字描述来讲解流程和制度，内容量不能减少

请直接输出 Markdown 内容，不要有额外解释。""",

    "legal_training": """你是一位经验丰富的普法讲师，擅长用通俗易懂的语言向普通群众讲解法律知识。请根据以下规划和法律条文，撰写一份生动、实用的普法讲座讲稿。

## 讲座规划
主题：{chapter}
受众：{grade}
类型：{subject}
时长：{duration}

讲座目标：
{goals}

核心法条：
{concepts}

内容安排：
{sections}

## 法律要点（必须覆盖）
{key_points}

## 内容摘要
{summary}

## 法律条文内容（RAG 检索结果）
{rag_content}

## 输出要求

### 语言风格（必须遵守）
1. **使用通俗易懂的大白话**，避免过多法律术语
2. 多用生活化的比喻和例子，如：
   - "这就好比我们平时买东西..."
   - "打个比方说..."
   - "大家可能都遇到过这种情况..."
3. 适当使用互动性语言：
   - "大家想一想..."
   - "有没有遇到过这种情况？"
   - "这里要划重点了..."
4. 可以用幽默轻松的方式讲严肃的法律问题
5. 每讲一个法条，都要用"翻译成大白话就是..."来解释

### 内容结构（必须遵守）
1. **法条引用**：先引用原文，格式为 `> 第X条：原文内容`
2. **通俗解读**：紧跟"翻译成大白话"的解释
3. **生活案例**：每个重点法条配一个生活中的小故事或案例
4. **维权指南**：告诉听众遇到问题应该怎么做

### 格式要求
1. **格式**：使用 Markdown 格式
2. **结构**：按照内容安排组织，层次清晰
3. **法条引用**：使用引用格式 `> 第X条：原文内容`
4. **重点标注**：关键信息用 **加粗** 强调
5. **分页**：每个部分用 `---` 分隔（幻灯片分页标记）

### 重要提示
1. 必须让普通人能听懂，不能太专业
2. 多讲故事、少念条文
3. 每页内容要充实（每个部分至少 150-300 字）
4. 让听众觉得"法律和我有关"、"学到了有用的东西"
5. **不要引用图片**：不要说"这张图"、"请看图"、"如图所示"等。但要用通俗的文字和案例来详细讲解，内容量不能减少

请直接输出 Markdown 内容，不要有额外解释。""",

    "general": """你是一位专业的演示文稿撰写专家。请根据以下规划和内容资料，撰写一份清晰、有条理的演示讲稿。

## 演示规划
主题：{chapter}
受众：{grade}
领域：{subject}
时长：{duration}

演示目标：
{goals}

核心要点：
{concepts}

内容安排：
{sections}

## 内容要点（必须覆盖）
{key_points}

## 内容摘要
{summary}

## 相关资料（RAG 检索结果）
{rag_content}

## 输出要求

### 语言风格
1. 使用清晰、专业的语言
2. 逻辑清晰，层次分明
3. 适当使用过渡语，如"接下来我们看..."、"这里有个重点..."

### 内容深度（必须遵守）
1. **每个要点必须详细展开**，不能只写标题
2. **概念要解释清楚**：是什么、为什么重要
3. **有数据/案例支撑**：增加说服力

### 格式要求
1. **格式**：使用 Markdown 格式
2. **结构**：按照内容安排组织
3. **分页**：每个部分用 `---` 分隔（幻灯片分页标记）

### 重要提示
1. 必须详细讲解每个部分
2. 每页内容要充实（每个部分至少 150-300 字）
3. **不要引用图片**：不要说"这张图"、"请看图"、"如图所示"等。但要用详细的文字描述来讲解概念，内容量不能减少

请直接输出 Markdown 内容，不要有额外解释。""",
}


def get_manuscript_prompt(scene_type: str) -> str:
    """获取对应场景的手稿生成 Prompt"""
    return MANUSCRIPT_PROMPTS.get(scene_type, MANUSCRIPT_PROMPTS["general"])


def get_scene_prompt(scene_type: str) -> str:
    """获取场景 Prompt（别名）"""
    return get_manuscript_prompt(scene_type)


def format_manuscript_prompt(
    plan: dict,
    rag_content: str = "",
    scene_type: str = "general",
    chapter_content: str = "",
    **kwargs,
) -> str:
    """
    格式化手稿生成 Prompt
    
    支持两种调用方式：
    1. 传入 plan 字典（新方式）
    2. 传入单独参数（旧方式兼容）
    """
    # 从 plan 中提取信息
    chapter = plan.get("chapter", kwargs.get("chapter", ""))
    goals = plan.get("teaching_goals", kwargs.get("goals", []))
    concepts = plan.get("key_concepts", kwargs.get("concepts", []))
    sections_list = plan.get("sections", [])
    total_duration = plan.get("total_duration_minutes", 30)
    summary = plan.get("summary", kwargs.get("summary", ""))
    scene_type = plan.get("scene_type", scene_type)
    
    # 格式化 sections
    sections_str = ""
    for i, s in enumerate(sections_list, 1):
        title = s.get("title", f"第{i}节")
        key_points = s.get("key_points", [])
        duration = s.get("duration_minutes", 5)
        notes = s.get("notes", "")
        
        sections_str += f"\n### {i}. {title}（{duration}分钟）\n"
        if key_points:
            sections_str += "要点：" + "、".join(key_points) + "\n"
        if notes:
            sections_str += f"备注：{notes}\n"
    
    # 格式化 key_points（从 sections 中提取）
    all_key_points = []
    for s in sections_list:
        all_key_points.extend(s.get("key_points", []))
    key_points_str = "\n".join(f"- {kp}" for kp in all_key_points[:15])  # 最多15个
    
    # 获取模板
    template = get_manuscript_prompt(scene_type)
    
    # 格式化
    goals_str = "\n".join(f"{i+1}. {g}" for i, g in enumerate(goals or []))
    concepts_str = "、".join(concepts or [])
    
    return template.format(
        chapter=chapter or "未命名章节",
        grade=kwargs.get("grade", "通用"),
        subject=kwargs.get("subject", "通用"),
        duration=f"{total_duration}min",
        goals=goals_str or "（暂无）",
        concepts=concepts_str or "（暂无）",
        sections=sections_str or "（暂无）",
        key_points=key_points_str or "（暂无，请根据内容自行提取）",
        summary=summary or "（暂无）",
        rag_content=rag_content or "（暂无检索结果，请根据规划生成）",
    )

