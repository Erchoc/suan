# 数据层 API 合约文档

> 版本：v2.0 · 2026-07-19
> 目标读者：后端工程师
> 状态：题库 D1、管理接口、管理员认证与家长身份登录已实现；学习 Session 云端化和收藏聚合仍是未来规划。

---

## 一、设计原则

**题库（当前）**：前端只通过同源 `/api/questions` 读取 D1 已发布版本。后台编辑源与学生发布快照分离，浏览器不再携带静态题库副本。

**身份与学习状态（当前）**：家长可通过手机号或微信建立服务端身份与会话；考试、复习和预习仍通过 Zustand persist 写入 `localStorage`，尚无跨设备同步。

**学习状态云端化（后续）**：保留现有 store 调用签名，把持久化实现切换为同源 HTTP，同时保留离线缓存。当前不存在全局 `DATA_MODE` 开关。

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
  blank_types?: ("number" | "choice" | "text")[];
  choices?: { label: string; content: string }[];
  correctChoice?: string;
  solution: string;
  common_mistake: string;
  hint: string;
  enable?: boolean; // false = 已禁用（后台操作）
  checkMessage?: string; // 质量问题或禁用原因
  publishedRevision?: number; // 前端加载时附加的发布版本
}
```

### 2.2 ExamSession（摸底考试 Session）

```typescript
interface ExamSession {
  sessionId: string;
  config: ExamConfig;
  questions: Question[];
  questionBankVersion?: number; // 创建这份题面快照时的题库版本
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
  questionBankVersion?: number;
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

## 三、API 接口合约

题库部分为当前实现；Session 与收藏部分仍为提案。

### 3.1 题库

| 接口 | 方法 | 路径 | 说明 |
| --- | --- | --- | --- |
| 获取已发布题库 | GET | `/api/questions` | 返回全部已发布且启用题目 |
| 获取单题 | GET | `/api/questions/:id` | 只返回已发布且启用题目 |
| 提交题目反馈 | POST | `/api/questions/:id/report` | 绑定会话、发布版本和历史题面 |
| 管理列表 | GET | `/api/admin/questions` | 分页搜索、筛选草稿题库 |
| 编辑题目 | PATCH | `/api/admin/questions/:id` | 编辑内容、答案、元数据与状态 |
| 批量状态 | POST | `/api/admin/questions/batch-status` | 单次最多 100 道 |
| 查询反馈 | GET | `/api/admin/question-reports` | 单题待处理反馈与历史题面 |
| 忽略反馈 | POST | `/api/admin/question-reports/dismiss` | 忽略无效反馈并记录原因 |
| 启动 AI 任务 | POST | `/api/admin/question-tasks` | 启动生成或质检 Workflow |
| 最近任务 | GET | `/api/admin/question-tasks` | 返回 D1 持久化任务列表 |
| 任务详情 | GET | `/api/admin/question-tasks/:id` | 返回进度、统计、事件和运行态 |
| 停止任务 | POST | `/api/admin/question-tasks/:id/stop` | 终止排队或运行中的任务 |

**GET /api/questions 响应：**

```json
{ "data": [Question], "total": 3852, "version": 1, "source": "d1" }
```

**PATCH /api/admin/questions/:id：**

```json
{ "enable": false, "checkMessage": "答案有误" }
```

管理接口使用 HttpOnly 会话 Cookie；不接受 URL 参数、`X-Admin-Token` 或浏览器 `localStorage` 中的 Bearer Token。写接口同时校验同源。

后台编辑、启停与 AI 质检结果会自动增量同步当前学生题库；生成结果先以禁用状态写入，质检合格后才会被学生端查询返回。任务刷新页面后可从 D1 恢复，Workflow 重试依赖批次幂等键避免重复写入。

考试与复习 Session 直接持久化完整 `questions` 数组，判题和历史查看不会根据题目 ID 回读最新题库。反馈请求优先使用每道题附带的 `publishedRevision`，Worker 再从 `published_question_versions` 读取服务端历史题面，不能由浏览器伪造管理员看到的题目快照。

---

### 3.2 家长身份与会话

| 接口 | 方法 | 路径 | 说明 |
| --- | --- | --- | --- |
| 登录能力 | GET | `/api/auth/config` | 返回 `phone` / `wechat` 是否配置完整 |
| 发送验证码 | POST | `/api/auth/sms/send` | 大陆手机号；返回 challengeId、脱敏号码与冷却时间 |
| 校验验证码 | POST | `/api/auth/sms/verify` | 一次性消费 challenge 并签发用户会话 |
| 当前会话 | GET | `/api/auth/session` | 返回脱敏用户与已绑定身份 |
| 退出会话 | DELETE | `/api/auth/session` | 撤销 D1 会话并清除 Cookie |
| 微信授权 | GET | `/api/auth/wechat/start` | 创建一次性 state 并跳转微信官方扫码页 |
| 微信回调 | GET | `/api/auth/wechat/callback` | 消费 state、创建/绑定微信身份并签发会话 |

`users` 是稳定账号主体，`user_identities` 保存手机号或微信提供方身份；手机号登录后可以显式扫码把微信绑定到当前主体。短信 challenge 只存 HMAC 摘要，用户会话只存随机令牌 SHA-256 摘要。Cookie 使用 HttpOnly、SameSite=Lax，并在 HTTPS 环境增加 Secure。

本期登录不改变本地学习 store，也不自动上传历史做题记录。孩子档案、监护关系、学习数据同步与冲突解决是后续独立契约。

---

### 3.3 摸底考试 Session

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

## 四、当前前端题库访问方式

`src/data/questions.ts` 是学生端题库访问入口：

```typescript
loadQuestions(); // D1 发布题库
loadQuestion(questionId); // D1 单题 API，优先复用进程内缓存
```

非公开的 `data/questions.seed.json` 只用于：

1. 首次创建或重建 D1 题库时生成可重复执行的导入 SQL。
2. 运行题库生成与数据质量校验脚本。
3. 作为可审计、可重复导入的初始数据基线。

---

## 五、管理员认证（已实现）

后台入口是 `/console?pw=MMDD`，其中 `MMDD` 按上海时区当天日期计算。页面接收参数后立即从地址栏移除，并换取服务端会话；旧的 `?admin=true` 不能控制权限。

- 登录：`POST /api/admin/session`，提交当天口令与客户端 UUID。
- 会话检查：`GET /api/admin/session`。
- 退出：`DELETE /api/admin/session`。
- 会话载体：最长 8 小时的 HMAC 签名 HttpOnly、SameSite=Strict Cookie。
- 登录保护：Cloudflare Rate Limiting binding；边缘优先使用连接 IP，本地回退客户端 UUID。
- Secret：`ADMIN_SESSION_SECRET` 至少 24 个字符，仅用于签名后台会话，并保存在 Worker Secret。

当前是单管理员模型。家长账号已经使用完全独立的 D1 身份、会话 Cookie 与认证限流器，不能复用题库管理员会话。

---

## 六、当前本地存储 Key 一览

| Key                         | 内容               | 对应 store     |
| --------------------------- | ------------------ | -------------- |
| `suandao-exam`              | ExamSession 集合   | examStore      |
| `suandao-review`            | ReviewSession 集合 | reviewStore    |
| `suandao-flagged-questions` | 异常题目 ID Set    | examStore util |
