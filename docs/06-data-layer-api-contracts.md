# 数据层 API 合约文档

> 版本：v1.1 · 2026-07-18
> 目标读者：后端工程师
> 状态：**未来规划草案**。下文题库、Session、收藏和认证接口均未实现；当前线上 API 只有 `/api/health` 与 `/api/ai/chat`。

---

## 一、设计原则

**本地模式（当前）**：所有数据写入 `localStorage`，通过 Zustand persist 持久化，无网络请求。

**云端模式（后续）**：前端保留同一接口调用签名，只需将实现从 `localStorage` 读写切换为 HTTP fetch，即可无缝迁移。同时支持 PWA/离线场景（本地模式作为 fallback）。

**建议切换方式（尚未实现）**：未来可维护 `DATA_MODE: 'local' | 'cloud'` 配置，`cloud` 模式下由数据访问层发起 HTTP 请求，并用响应更新本地缓存。不能把这个提案当成当前代码中的可用开关。

---

## 二、数据实体定义

### 2.1 Question（题目）

```typescript
interface Question {
  id: string; // "{kp_id}-{序号}" 如 "5-18-01"
  kp_id: string;
  kp_name: string;
  grade: string;
  semester: string;
  difficulty: "easy" | "medium" | "hard";
  type: "fill_blank" | "choice" | "mixed";
  question: string; // ____ 表示填空处
  blanks: string[]; // 填空答案
  choices?: { label: string; content: string }[];
  correctChoice?: string;
  solution: string;
  common_mistake: string;
  hint: string;
  enable?: boolean; // false = 已禁用（后台操作）
  disableReason?: string;
}
```

### 2.2 ExamSession（摸底考试 Session）

```typescript
interface ExamSession {
  sessionId: string;
  config: ExamConfig;
  questions: Question[];
  answers: Record<string, string[]>; // questionId → 用户填写答案
  choiceAnswers: Record<string, string>; // questionId → 选择 label
  bookmarks: string[]; // 收藏的 questionId 列表
  issueReports: Record<string, string>; // questionId → 用户描述
  startedAt: number | null;
  submittedAt: number | null;
}
```

### 2.3 ReviewSession（复习 Session）

```typescript
interface ReviewSession {
  sessionId: string;
  sources: ReviewSource[]; // 题目来源配置
  questions: Question[];
  answers: Record<string, string[]>;
  choiceAnswers: Record<string, string>;
  results: Record<string, "correct" | "wrong">; // 即时判题结果
  bookmarks: string[];
  issueReports: Record<string, string>;
  startedAt: number;
  completedAt?: number;
}

type ReviewSourceType = "report" | "bookmarks" | "kps";
interface ReviewSource {
  type: ReviewSourceType;
  sessionIds?: string[]; // type='report' 时：指定考试 session，空=全部
  kpIds?: string[]; // type='kps' 时：指定知识点 ID
}
```

---

## 三、未来 API 接口合约

本节路径均为提案。实现时必须扩展现有 Hono Worker、选择外部持久化，并补齐服务端认证、授权、输入校验、限流、审计与迁移策略。

### 3.1 题库

| 接口          | 方法 | 路径                                | 说明             |
| ------------- | ---- | ----------------------------------- | ---------------- |
| 获取题库      | GET  | `/api/questions`                    | 返回全量启用题目 |
| 获取单题      | GET  | `/api/questions/:id`                | —                |
| Toggle enable | POST | `/api/admin/questions/toggle`       | 管理员操作       |
| 批量 toggle   | POST | `/api/admin/questions/batch-toggle` | 管理员操作       |

**GET /api/questions 响应：**

```json
{ "data": [Question], "total": 4735 }
```

**POST /api/admin/questions/toggle：**

```json
// 请求
{ "id": "5-18-01", "enable": false, "disableReason": "答案有误" }
// 响应
{ "ok": true }
```

请求头需携带 `X-Admin-Token: <token>`（临时，后续替换为 JWT）。

---

### 3.2 摸底考试 Session

| 接口         | 方法  | 路径                               | 说明           |
| ------------ | ----- | ---------------------------------- | -------------- |
| 创建 Session | POST  | `/api/exam/sessions`               | 返回 sessionId |
| 获取 Session | GET   | `/api/exam/sessions/:id`           | —              |
| 保存答案     | PATCH | `/api/exam/sessions/:id/answers`   | 增量更新       |
| 提交考试     | POST  | `/api/exam/sessions/:id/submit`    | 锁定 session   |
| 收藏/取消    | POST  | `/api/exam/sessions/:id/bookmarks` | —              |
| 报告异常     | POST  | `/api/exam/sessions/:id/issues`    | —              |

**POST /api/exam/sessions 请求体：**

```json
{
  "config": { "gradeNum": 5, "semester": "上", "scope": "full", "difficulty": "random", "questionCount": 60, "timeLimitMinutes": 60 },
  "questions": ["5-18-01", "5-18-02", ...]   // 前端选题后传 ID 列表
}
```

**PATCH /api/exam/sessions/:id/answers：**

```json
{
  "answers": { "5-18-01": ["3/4"] },
  "choiceAnswers": { "5-18-c01": "B" }
}
```

**POST /api/exam/sessions/:id/bookmarks：**

```json
{ "questionId": "5-18-01", "action": "add" | "remove" }
```

**POST /api/exam/sessions/:id/issues：**

```json
{ "questionId": "5-18-01", "reason": "答案有误" }
```

---

### 3.3 复习 Session

| 接口         | 方法 | 路径                                     | 说明         |
| ------------ | ---- | ---------------------------------------- | ------------ |
| 创建 Session | POST | `/api/review/sessions`                   | —            |
| 获取 Session | GET  | `/api/review/sessions/:id`               | —            |
| 提交单题     | POST | `/api/review/sessions/:id/submit-answer` | 返回判题结果 |
| 收藏/取消    | POST | `/api/review/sessions/:id/bookmarks`     | —            |
| 报告异常     | POST | `/api/review/sessions/:id/issues`        | —            |
| 完成 Session | POST | `/api/review/sessions/:id/complete`      | —            |

**POST /api/review/sessions 请求体：**

```json
{
  "sources": [
    { "type": "report", "sessionIds": ["uuid-1"] },
    { "type": "kps", "kpIds": ["5-18", "5-19"] }
  ],
  "questions": ["5-18-01", ...]
}
```

**POST /api/review/sessions/:id/submit-answer：**

```json
// 请求
{ "questionId": "5-18-01", "answers": ["3/4"], "choiceAnswer": null }
// 响应
{ "result": "correct" | "wrong" }
```

---

### 3.4 收藏本 / 错题本聚合查询（未来接口）

后续统一错题本和收藏本时新增：

```
GET /api/me/bookmarks          返回用户全局收藏题列表（跨 session）
GET /api/me/wrong-questions    返回用户全局错题列表（跨 session）
```

---

## 四、建议的前端切换方式（未实现）

未来可在 `src/stores/` 下新增 `dataMode.ts`：

```typescript
// src/stores/dataMode.ts
export const DATA_MODE: "local" | "cloud" =
  import.meta.env.VITE_DATA_MODE === "cloud" ? "cloud" : "local";
```

该文件和 `VITE_DATA_MODE` 当前均不存在。未来实现后，才可由各 store 根据 `DATA_MODE` 决定走 `localStorage` 还是同源 HTTP API。

本地模式保留，作为：

1. 开发/测试时无需后端
2. PWA 离线场景的 fallback
3. 未登录用户的临时数据存储

---

## 五、认证方案（规划）

当前没有管理 API，也没有服务端管理员认证。URL `?admin=true` 只能用于界面原型，禁止把它当作生产权限判断。

后续：JWT Bearer Token

- 登录接口：`POST /api/auth/login`
- 续期：`POST /api/auth/refresh`
- 前端存储：`localStorage.getItem('suandao-token')`
- 请求头：`Authorization: Bearer <token>`

---

## 六、当前本地存储 Key 一览

| Key                         | 内容               | 对应 store     |
| --------------------------- | ------------------ | -------------- |
| `suandao-exam`              | ExamSession 集合   | examStore      |
| `suandao-review`            | ReviewSession 集合 | reviewStore    |
| `suandao-flagged-questions` | 异常题目 ID Set    | examStore util |
