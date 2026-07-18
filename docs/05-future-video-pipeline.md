# 知识卡多媒体生成流水线 — 技术预研文档

> 文档版本：v0.1 · 2026-03-14
> 状态：预研记录，不在当前实现范围

---

## 一、背景

预习模式的「知识卡」计划支持多种讲解形态（文字 → 语音 → 动画 → 视频），其中动画和视频形态需要一套自动化内容生成流水线。本文档记录技术选型思路，待后续专项推进。

---

## 二、目标产出

每个知识点生成：

1. **文字层**：核心概念 + 详细讲解 + 配套例题（约 300–800 字，Markdown）
2. **语音层**：AI 配音的讲解音频（MP3，2–5 分钟）
3. **动画层**：数学动画视频（MP4，5–10 分钟，精确渲染数学过程）
4. **视频层**：完整趣味教学视频（长期目标）

---

## 三、技术选型

### 3.1 文字层

**工具**：Claude / Qwen（通义千问）大语言模型

**流程**：
```
知识点元数据（名称、年级、学期、前置KP）
    ↓
Prompt 构造（角色：小学数学教师，受众：小学生）
    ↓
AI 生成 summary + explanation + examples
    ↓
写入 knowledge-cards.json
```

**脚本**：`scripts/generateKnowledgeCards.ts`（参考 generateQuestions.ts 的断点续跑模式）

---

### 3.2 语音层

**候选工具**：

| 工具 | 特点 | 适用性 |
|------|------|--------|
| 豆包 TTS | 中文自然度极佳，支持情感语调 | ⭐⭐⭐ 首选 |
| 微软 Azure TTS | 稳定，有儿童声线 | ⭐⭐ 备选 |
| CosyVoice（阿里） | 开源，可本地部署 | ⭐⭐ 备选 |
| ElevenLabs | 英文为主，中文一般 | ❌ 不适合 |

**流程**：
```
文字层 explanation + examples walkthrough
    ↓
转换为 TTS 朗读稿（去除 Markdown 格式，加适当停顿标记）
    ↓
调用 TTS API → 生成 MP3
    ↓
存储到 CDN / 本地 assets
```

---

### 3.3 动画层

**核心挑战**：数学内容要**精确**（公式不能算错、图形不能画错），通用视频 AI 无法保证。

**推荐方案：Manim + LLM**

[Manim](https://github.com/3b1b/manim) 是 3Blue1Brown 开源的数学动画库（Python），可精确渲染：
- 数学公式（LaTeX）
- 几何图形（线段、角、面积）
- 数轴、坐标系
- 分步演算过程

**流水线**：
```
知识点 + 文字讲解
    ↓
LLM 生成 Manim Python 脚本
（角色：Manim 专家，任务：为小学生讲解该知识点）
    ↓
Python 执行 Manim 渲染 → 多个动画片段（MP4）
    ↓
豆包 TTS 生成配音（MP3）
    ↓
FFmpeg 合并动画 + 配音 → 最终 MP4
    ↓
存储到 CDN
```

**LLM 生成 Manim 代码的可行性**：Claude Sonnet / Opus 4.x 对 Manim 代码生成质量已较好，配合精心设计的 system prompt（含常见 Manim 片段模板），小学数学范围内的动画基本可靠。

**风险**：
- Manim 代码有时存在 API 版本差异（ManimGL vs ManimCE）
- 复杂场景（如鸡兔同笼图解）需人工审核

---

### 3.4 完整视频层（长期）

**参考产品**：可汗学院、3Blue1Brown、抖音数学科普

**候选工具**：

| 工具 | 能力 | 说明 |
|------|------|------|
| **Veo 2/3**（Google DeepMind） | 文本/图像 → 高质量视频 | 最强视频生成，但数学精确性待验证 |
| HeyGen | AI 数字人 + 讲解 | 适合"老师讲课"形态 |
| Remotion | React 代码 → 视频 | 与本项目技术栈契合，可复用组件 |
| D-ID | AI 头像 + TTS | 简单快速，质量一般 |

**推荐思路**：Manim 动画 + HeyGen 数字人老师 画中画合成，形成「老师讲解 + 动画演示」的双轨视频。

---

## 四、数据模型规划

```typescript
interface KnowledgeCard {
  kp_id: string

  // Phase 1 — 文字层
  summary: string
  explanation: string          // Markdown，支持 LaTeX 公式（$...$）
  examples: {
    problem: string
    walkthrough: string
  }[]
  textbook_ref?: string        // "人教版五年级上册 P.34"

  // Phase 2 — 语音层
  audio?: {
    url: string                // CDN 地址
    duration: number           // 秒
    tts_engine: string         // "doubao" | "azure" | "cosyvoice"
  }

  // Phase 3 — 动画层
  animation?: {
    url: string
    duration: number
    manim_source?: string      // 源码，方便修改重渲染
    segments: {                // 分段信息，用于字幕/进度条
      start: number
      end: number
      label: string
    }[]
  }

  // Phase 4 — 完整视频
  video?: {
    url: string
    duration: number
    thumbnail?: string
    tool: string               // "veo3" | "heygen" | "remotion"
  }

  meta: {
    generated_at: string
    model: string
    reviewed: boolean
    review_notes?: string
  }
}
```

---

## 五、实施优先级建议

```
Phase 1（当前）：生成文字层 → 预习模式上线
Phase 2（1-2个月后）：豆包 TTS 接入 → 语音讲解上线
Phase 3（3-6个月后）：Manim 流水线搭建 → 动画讲解上线
Phase 4（6个月+）：完整视频合成 → 视频讲解上线
```

---

## 六、参考资料

- Manim Community Edition：https://docs.manim.community/
- 3Blue1Brown Manim 源码参考（数学动画设计模式）
- Veo 2/3 (Google DeepMind)：视频生成 API（待公开）
- 豆包 TTS API 文档
- FFmpeg 音视频合成指南
