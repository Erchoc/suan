# 预习模式 — 设计文档

> 文档版本：v1.0 · 2026-03-14
> 状态：待确认 → 实现

---

## 一、定位

**目标用户**：学生（孩子）、自学能力较强；家长辅导引导

**核心场景**：在上课前或学新内容前，通过「知识卡 + 配套练习」的形式提前接触知识点，建立初步印象。

**与摸底考试的区别**：
- 摸底考试是诊断（不会就错）
- 预习模式是学习（不会先看讲解，再做练习，做错了也是收获）

**与复习模式的区别**：
- 复习是巩固（已学过，针对错误强化）
- 预习是首次接触（知识卡先行，降低心理压力）

---

## 二、路由

```
/preview                  预习入口页（选知识点 + 讲解形态）
/preview/:sessionId       预习学习页
```

---

## 三、讲解形态（分阶段落地）

| 形态 | 说明 | 当前状态 |
|------|------|----------|
| 📝 文字讲解 | 知识卡（文字 + 例题）+ 配套练习 | ✅ 本期实现 |
| 🎙️ 语音讲解 | AI 对话式老师（豆包语音风格） | 🔜 占位，后续接入 |
| 🎬 动画讲解 | AI 预生成动画（Manim 流水线） | 🔜 占位，后续接入 |
| 📹 视频讲解 | 完整教学视频 | ⏳ 未来版本 |

---

## 四、入口来源

### 4.1 导航栏直达
顶部导航新增「📖 预习」链接 → `/preview`（金刚区入口）

### 4.2 知识图谱节点
点击任意知识点 → 弹出信息面板 → 「进入预习」按钮 → `/preview?kp=5-18`

---

## 五、预习入口页（/preview）

### 布局

```
标题：选择预习内容

┌──────────────────────────────────────────────────────┐
│  📚 选择知识点                                        │
│                                                       │
│  🔍 搜索知识点...                                     │
│                                                       │
│  ┌ 一年级 上学期 ──────────────┐                     │
│  │ ☐ 数数与计数               │                     │
│  │ ☐ 10以内加减法             │                     │
│  └──────────────────────────────┘                    │
│  ┌ 一年级 下学期 ──────────────┐                     │
│  │ ...                         │                     │
│  └──────────────────────────────┘                    │
│                                                       │
│  已选 2 个知识点                                      │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│  讲解形态                                             │
│                                                       │
│  ● 📝 文字讲解（配合课本，适合自学）                  │
│  ○ 🎙️ 语音讲解  [即将上线]                           │
│  ○ 🎬 动画讲解  [即将上线]                           │
│  ○ 📹 视频讲解  [未来版本]                           │
└──────────────────────────────────────────────────────┘

                              [开始预习 →]
```

### 说明
- 知识点选择：与复习模式入口的「按知识点」相同的树形组件，可复用
- 来自知识图谱的跳转（`?kp=xxx`）自动勾选对应知识点
- 讲解形态非文字时显示「即将上线」badge，不可点击

---

## 六、预习学习页（/preview/:sessionId）

### 整体流程

```
知识点 1
  └─ 知识卡（文字讲解）
  └─ 配套练习（N道题，hint展开，即时反馈）
  └─ ✅ 完成知识点 1

知识点 2
  └─ ...

全部完成 → 预习小结页
```

### 布局（文字讲解模式）

```
┌──────────────────────────────────────────────────────┐
│  Nav                              [结束预习]          │
│  进度：知识点 1/2 · 文字讲解                          │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━         │
├──────────────────────────────────────────────────────┤
│                                                       │
│  当前状态：[📖 学习知识卡] or [✏️ 配套练习 2/5]       │
│                                                       │
│  ── 知识卡阶段 ────────────────────────────────────   │
│                                                       │
│  五年级 · 上学期 · 分数与整数的乘法                    │
│                                                       │
│  📌 核心概念                                           │
│  分数与整数相乘，用整数乘分子，分母不变...             │
│                                                       │
│  📐 例题讲解                                           │
│  例1：3/4 × 2 = ?                                    │
│  解：3×2/4 = 6/4 = 3/2                               │
│                                                       │
│  💡 小贴士（配合人教版五年级上册 P.xx 学习）           │
│                                                       │
│              [我学会了，开始练习 →]                    │
│                                                       │
│  ── 练习阶段 ──────────────────────────────────────   │
│                                                       │
│  （复用 QuestionCard，hint 默认展开，答后即时反馈）    │
│                                                       │
│  [上一题]              [下一题 / 完成此知识点]         │
└──────────────────────────────────────────────────────┘
```

### 知识卡数据来源

知识卡内容由 `generateKnowledgeCards.ts` 脚本 AI 生成后存入 `src/data/knowledge-cards.json`。

数据模型（Phase 1 文字层）：

```typescript
interface KnowledgeCard {
  kp_id: string
  summary: string          // 核心概念，50字以内，用于知识卡标题下方一句话
  explanation: string      // 详细讲解，可长（支持 Markdown）
  examples: {
    problem: string        // 例题题目
    walkthrough: string    // 分步解析
  }[]
  textbook_ref?: string    // 教材页码提示，如"人教版五年级上册 P.34"
  meta: {
    generated_at: string
    model: string
    reviewed: boolean
  }
  // Phase 2（后续）
  diagrams?: { type: 'svg' | 'lottie'; url: string; caption: string }[]
  // Phase 3（后续）
  video?: { script: string; url: string; duration: number; manim_source?: string }
}
```

存储位置：`src/data/knowledge-cards.json`（随代码一起打包）

> **注**：本期先用占位数据（空 explanation + 提示「内容生成中」），待 generateKnowledgeCards.ts 脚本完成后补充实际内容。

### 语音/动画讲解形态（占位 UI）

```
┌──────────────────────────────────────────────────────┐
│                    🎙️ 语音讲解                        │
│                                                       │
│           [  功能即将上线  ]                           │
│    AI老师将以对话形式带你学习这个知识点                │
│                                                       │
│         敬请期待 · 先用文字讲解练习吧 ↓               │
│                                                       │
│              [切换到文字讲解]                          │
└──────────────────────────────────────────────────────┘
```

---

## 七、预习小结页

完成所有选中知识点后展示：

```
🎉 预习完成！

本次预习
  · 知识点：2 个
  · 练习题：14 道
  · 答对：10 道（71%）

知识点
  ✅ 分数与整数的乘法
  ✅ 分数与整数的除法

[继续预习其他知识点]   [去摸底考试检验一下]
```

---

## 八、数据模型

### 新增类型（types/index.ts）

```typescript
type PreviewFormat = 'text' | 'voice' | 'animation' | 'video'

type PreviewPhase = 'card' | 'practice' | 'summary'

interface PreviewSession {
  sessionId: string
  kpIds: string[]               // 选中的知识点列表（有序）
  format: PreviewFormat
  currentKpIndex: number        // 当前第几个知识点
  phase: PreviewPhase           // 当前阶段
  answers: Record<string, string[]>
  choiceAnswers: Record<string, string>
  results: Record<string, 'correct' | 'wrong'>
  startedAt: number
  completedAt?: number
}
```

### 新增 Store（stores/previewStore.ts）

```typescript
interface PreviewStore {
  sessions: Record<string, PreviewSession>
  cards: Record<string, KnowledgeCard>  // kp_id → card（从 JSON 加载）
  createSession(kpIds: string[], format: PreviewFormat): string
  advancePhase(sessionId: string): void
  submitAnswer(sessionId: string, questionId: string, answer: string[]|string): void
}
```

---

## 九、脚本需求

**`scripts/generateKnowledgeCards.ts`**（新增，后续实现）

```bash
pnpm run gen:cards [--grade N] [--kp ID] [--dry-run]
```

- 读取 knowledge-graph.json，遍历知识点
- 调用 AI 生成 KnowledgeCard 内容（summary + explanation + examples）
- 写入 `src/data/knowledge-cards.json`
- 支持断点续跑（已有 reviewed=true 的跳过）

---

## 十、不在本期范围

- 语音讲解（豆包 API 接入）
- 动画讲解（Manim 流水线）
- 视频讲解
- 预习进度统计报告
- 多设备同步
- generateKnowledgeCards.ts 脚本实现（知识卡用占位数据）
