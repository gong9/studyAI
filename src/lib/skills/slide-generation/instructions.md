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

## 主题风格说明（阿里风格）

所有主题均采用阿里设计规范：**纯白/浅灰背景、大面积留白、蓝色强调、简洁无装饰**

| 主题 | 适用场景 | 视觉特点 |
|------|----------|----------|
| `tech` | 技术培训、产品介绍 | 纯白背景，蚂蚁蓝 #1677ff 强调 |
| `policy` | 制度培训、流程宣贯 | 纯白背景，蓝色强调，表格简洁 |
| `legal` | 普法讲座、法规解读 | 浅灰背景，深蓝强调，庄重简洁 |
| `dark` | 通用深色 | 深灰背景，白色文字，简洁无渐变 |
| `light` | 通用浅色 | 纯白背景，阿里风格 |
| `auto` | 自动选择 | 默认阿里简洁风格 |

## 智能风格模式

当 `smartStyle: true`（默认）时，生成阿里风格的简洁幻灯片：

- 纯白背景 (#ffffff)，不使用渐变
- 主色：蚂蚁蓝 #1677ff
- 大面积留白，内容简洁
- 禁止装饰性元素（发光球、线条、网格等）
- 字体：PingFang SC、Microsoft YaHei

## 注意事项

1. 生成的 HTML 不包含 CSS 动画，动画由 Remotion 视频渲染器处理
2. 每页幻灯片独立生成，可能需要一定时间
3. 如果某页生成失败，会返回一个简单的错误占位页

