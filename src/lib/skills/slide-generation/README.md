# Skill: Slide Generation

生成精美的 HTML 幻灯片。

## 能力

- 将 Markdown 内容转换为精美的 HTML 幻灯片
- 支持多种主题风格（tech/policy/legal/dark/light）
- 使用 AI 智能选择最佳设计风格
- 每页幻灯片独立生成，支持个性化设计

## 输入

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `content` | string | 是 | Markdown 格式的手稿内容（用 `---` 分隔页面） |
| `knowledgeBaseType` | string | 否 | 知识库类型：tech / policy / legal |
| `theme` | string | 否 | 主题风格：tech / policy / legal / dark / light / auto |
| `smartStyle` | boolean | 否 | 是否启用 AI 智能风格（默认 true） |

## 输出

```typescript
{
  slides: Array<{
    index: number;    // 页码索引
    title: string;    // 幻灯片标题
    html: string;     // 完整 HTML 代码
  }>;
  slideCount: number; // 幻灯片总数
}
```

## 使用场景

- 技术培训课件生成
- 制度培训 PPT 生成
- 普法讲座演示文稿
- 产品发布会幻灯片

## 技术实现

使用 Gemini AI 根据内容智能生成 HTML 幻灯片，支持：

1. **智能风格选择**：AI 根据内容特点自动选择最佳设计
2. **多主题支持**：科技风、商务风、庄重风等
3. **Remotion 兼容**：生成的 HTML 可直接用于视频渲染

