# Slide Generation - 使用说明

## 何时使用此技能

当需要将文本内容转换为可视化演示文稿时使用此技能：

1. 用户上传文档后，需要生成教学课件
2. 手稿编辑完成后，需要渲染为 HTML 幻灯片
3. 需要生成可用于视频导出的幻灯片

## 调用方式

```typescript
import { generateHtmlSlides } from '@/lib/skills/slide-generation';

const result = await generateHtmlSlides({
  content: markdownContent,      // Markdown 内容，用 --- 分隔页面
  knowledgeBaseType: 'tech',     // 可选：tech | policy | legal
  smartStyle: true,              // 可选：是否启用 AI 智能风格
});

// 结果
console.log(result.slideCount);  // 幻灯片数量
console.log(result.slides);      // HTML 幻灯片数组
```

## 内容格式要求

输入的 Markdown 内容需要用 `---` 分隔不同的幻灯片页面：

```markdown
# 标题页

欢迎内容...

---

## 第一章

内容要点...

---

## 第二章

更多内容...
```

## 主题风格说明

| 主题 | 适用场景 | 视觉特点 |
|------|----------|----------|
| `tech` | 技术培训、产品介绍 | 深色背景，Cyan 强调色，科技感 |
| `policy` | 制度培训、流程宣贯 | 浅色背景，蓝色强调色，商务感 |
| `legal` | 普法讲座、法规解读 | 深灰背景，金色强调色，庄重感 |
| `dark` | 通用深色 | 深色渐变背景 |
| `light` | 通用浅色 | 白色/浅色背景 |
| `auto` | 自动选择 | AI 根据内容判断 |

## 智能风格模式

当 `smartStyle: true`（默认）时，AI 会根据每页内容自动选择最佳设计风格：

- 编程、AI 相关 → 科技风
- 流程、制度相关 → 商务风
- 法律、政策相关 → 庄重风
- 营销、创意相关 → 活力风
- 概念总结 → 简约风

## 注意事项

1. 生成的 HTML 不包含 CSS 动画，动画由 Remotion 视频渲染器处理
2. 每页幻灯片独立生成，可能需要一定时间
3. 如果某页生成失败，会返回一个简单的错误占位页

