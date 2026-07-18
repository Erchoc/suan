# 算道仓库协作指南

本文档是本仓库的工程协作约定。修改前先阅读真实代码和配置；代码、测试与 `package.json`、`wrangler.jsonc` 是当前行为的事实来源，`docs/` 中标记为规划的内容不能视为已经实现。

## 一、项目定位

算道是基于知识图谱的小学数学智能学习平台，覆盖一至六年级，当前包含：首页、知识图谱、摸底诊断、答题、报告、复习、预习、题目详情和 AI 辅导。

生产地址为 [https://suan.longye.site](https://suan.longye.site)。

## 二、当前全栈架构

仓库采用根目录单包结构，不需要切换工作区：

```text
浏览器
├── React 单页应用
│   ├── React Router 页面路由
│   ├── Zustand 本地状态
│   └── public/ 静态题库与 PWA 资源
└── 同源 /api/*
    └── worker/index.ts 中的 Hono 应用
        ├── GET /api/health
        └── POST /api/ai/chat
            └── DeepSeek OpenAI 兼容接口
```

Vite 负责前端构建，`@cloudflare/vite-plugin` 将 Worker 接入同一开发流程。生产环境由 Cloudflare Workers 同时提供静态资源和 Hono 接口；`wrangler.jsonc` 将 `/api` 请求优先交给 Worker，并为前端路由启用单页应用回退。

不要新增第二套接口运行时，也不要让浏览器绕过 `/api/ai/chat` 直接访问模型服务。

## 三、技术栈

- 包管理：pnpm 10
- 运行环境：Node.js 22.13.0 或更高版本
- 前端：Vite 8、React 18、TypeScript 5、React Router 6
- 样式与交互：Tailwind CSS 3、Framer Motion、Lucide React
- 状态：Zustand
- 图谱与图表：`@xyflow/react`、`@dagrejs/dagre`、Recharts
- 接口：Hono 4、Cloudflare Workers
- 测试：Vitest、Cloudflare Workers 测试池
- 代码检查：ESLint、TypeScript

除非任务明确要求并有充分理由，不要替换现有工具链或引入功能重叠的依赖。

## 四、目录职责

```text
.
├── src/                         React 应用
│   ├── components/              通用组件
│   ├── contexts/                React 上下文
│   ├── data/                    知识图谱、知识卡与运行时索引
│   ├── hooks/                   业务钩子
│   ├── pages/                   路由页面
│   ├── stores/                  Zustand 状态
│   ├── types/                   共享前端类型
│   └── utils/                   纯函数、图谱算法与 AI 流式客户端
├── worker/                      Hono Worker 与接口测试
├── public/                      静态题库、图标和 PWA 资源
├── scripts/                     题目生成、知识卡生成与校验脚本
├── docs/                        已实现说明和规划设计
├── vite.config.ts               Vite、React、Worker 与 PWA 配置
├── wrangler.jsonc               Worker、域名、变量、限流与资源配置
├── vitest.config.ts             前端和 Worker 测试配置
└── package.json                 根目录命令与依赖
```

关键数据约定：

- `src/data/knowledge-graph.json` 是知识图谱源数据。
- `public/questions.json` 是运行时题库，前端通过 `fetch` 加载，不要把大题库直接打进前端包。
- `src/data/knowledge-cards.json` 是知识卡数据。
- 考试、复习和预习的部分会话状态目前保存在浏览器本地；不要把本地状态描述为云端持久化。
- `worker-configuration.d.ts` 由绑定配置生成；修改 `wrangler.jsonc` 后运行 `pnpm cf-typegen`，不要手工维护生成内容。

## 五、现有页面路由

路由定义以 `src/App.tsx` 为准：

| 路径                         | 页面         |
| ---------------------------- | ------------ |
| `/`                          | 首页         |
| `/graph`                     | 知识图谱     |
| `/assessment`                | 摸底诊断入口 |
| `/assessment/exam`           | 考试配置     |
| `/assessment/upload`         | 试卷上传配置 |
| `/exam/:sessionId`           | 答题         |
| `/report/:sessionId`         | 诊断报告     |
| `/review`                    | 复习入口     |
| `/review/:sessionId`         | 复习会话     |
| `/review/:sessionId/summary` | 复习总结     |
| `/preview`                   | 预习入口     |
| `/preview/:sessionId`        | 预习会话     |
| `/question/:questionId`      | 题目详情     |

新增或修改路由时，同时检查导航、移动端布局、懒加载、刷新后的单页应用回退和相关文档。

## 六、接口契约

### 健康检查

`GET /api/health` 返回：

```json
{
  "status": "ok",
  "service": "suan",
  "runtime": "cloudflare-workers",
  "ai": "ready"
}
```

`ai` 在缺少密钥时为 `unconfigured`。响应包含 `x-trace-id`、`cache-control: no-store` 等安全与追踪头。

### AI 对话

`POST /api/ai/chat` 接收：

```ts
interface 对话请求 {
  kpId: string;
  kpName: string;
  gradeNum: number;
  explanation?: string;
  messages: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
}
```

必须保持以下行为：

- 请求为 `application/json`，并携带合法 UUID 格式的 `X-Suan-Client-Id`。
- 浏览器带有 `Origin` 时只能同源访问；该检查是浏览器防护，不是用户身份认证。
- 请求体上限为 64 KiB；消息数量为 1 至 30 条；单条消息最多 2,000 字符；总消息最多 20,000 字符。
- `gradeNum` 只能是 1 至 6 的整数，客户端不能提交 `system` 角色。
- 系统提示词只在 Worker 内生成。
- 调用频率由 `AI_RATE_LIMITER` 绑定限制，当前配置为每个边缘连接 IP 每 60 秒 12 次；没有 Cloudflare 连接头的本地请求回退到客户端标识。
- Worker 请求 `${AI_BASE_URL}/chat/completions`，当前模型为 `deepseek-chat`，并将上游 SSE 响应流直接传给前端。
- 失败响应使用 `{ error: { code, message }, traceId }`；不要向客户端透传上游错误正文、凭据或内部堆栈。
- 未知 `/api/*` 路径返回结构化 404，不能回退为前端页面。

修改接口契约时，必须同步更新 `worker/index.test.ts`、前端调用及相关文档。

## 七、密钥与安全边界

生产环境的 `AI_API_KEY` 只能保存为 Cloudflare Worker Secret，并通过 Worker 绑定读取。

本地开发把 `.dev.vars.example` 复制为 `.dev.vars`，仅在被 Git 忽略的本地文件中填写测试密钥。禁止把真实密钥写入：

- `src/`、`public/` 或任何浏览器可读取内容
- `wrangler.jsonc`、提交记录或截图
- Vite 公开变量、构建时常量或前端网络请求
- 日志、错误响应和测试快照

`AI_BASE_URL` 与 `AI_MODEL` 是非敏感 Worker 变量。新增敏感配置时使用新的 Worker Secret，并重新生成绑定类型。

`?admin=true`、客户端标识和同源校验都不能替代服务端身份认证。未来管理接口必须包含可靠鉴权、授权、输入校验、限流和审计设计。

## 八、本地开发与根目录命令

首次启动：

```bash
pnpm install
cp .dev.vars.example .dev.vars
# 在 .dev.vars 中填写本地 AI_API_KEY
pnpm dev
```

所有命令都在仓库根目录执行：

| 命令                    | 用途                                |
| ----------------------- | ----------------------------------- |
| `pnpm dev`              | 启动 React 与 Worker 的本地开发环境 |
| `pnpm build`            | 类型检查并构建生产产物              |
| `pnpm preview`          | 构建后本地预览                      |
| `pnpm typecheck`        | 检查所有 TypeScript 工程            |
| `pnpm lint`             | 检查代码规范                        |
| `pnpm test`             | 运行前端与 Worker 测试              |
| `pnpm test:watch`       | 监听模式运行测试                    |
| `pnpm check`            | 运行完整质量门禁                    |
| `pnpm cf-typegen`       | 重新生成 Worker 绑定类型            |
| `pnpm cf-typegen:check` | 检查绑定类型是否同步                |
| `pnpm run deploy:dry`   | 构建并执行发布预检                  |
| `pnpm run deploy`       | 构建并发布生产版本                  |

题库脚本以 `package.json` 为准。生成或自动校验脚本会使用本地进程中的 AI 配置，运行前确认目标数据文件、参数和工作树状态，禁止把密钥或临时产物提交到仓库。

## 九、测试要求

按改动范围先运行最小相关测试，再运行完整门禁：

```bash
pnpm test
pnpm check
```

最低要求：

- 修改 Worker 路由、校验、错误映射、流式转发或绑定时，补充 `worker/**/*.test.ts`。
- 修改前端流式解析或 AI 请求时，补充 `src/**/*.test.ts`。
- 修改绑定时，运行 `pnpm cf-typegen` 和 `pnpm cf-typegen:check`。
- 修改题库时，运行对应题库校验命令；不要用构建成功代替数据校验。
- 修复缺陷时，优先添加能复现问题的回归测试。

## 十、前端与 PWA 约束

- React Hooks 只能在组件顶层调用；依赖数组必须完整，频繁变化的触摸状态应使用 `ref` 保存运行时值。
- 保持当前代码分割方式，大型页面继续使用懒加载。
- 保持键盘操作、焦点状态、颜色对比度以及桌面和移动端布局可用。
- iOS 可滚动容器不要同时使用固定定位与滚动溢出；`body` 的可用高度兼容规则和安全区域处理不能随意删除。
- 下拉刷新监听器不能因每帧状态更新而反复绑定；页面在顶部时不要把程序触发的滚动误判为用户滚动。
- 不要恢复已废弃的 WebKit 惯性滚动属性。
- 修改 PWA 清单、图标或缓存策略后，验证首次加载、更新和离线回退。

## 十一、发布流程

发布前：

```bash
pnpm check
pnpm run deploy:dry
```

首次配置生产环境。若 Worker 尚不存在，使用本地已忽略的 `.dev.vars` 原子创建 Worker 与 Secret：

```bash
pnpm exec wrangler login
pnpm build
pnpm exec wrangler deploy --secrets-file .dev.vars
```

Worker 已存在后，用 `pnpm exec wrangler secret put AI_API_KEY` 轮换密钥。

发布并验证：

```bash
pnpm run deploy
curl https://suan.longye.site/api/health
```

发布目标和 Worker 路由必须以 `wrangler.jsonc` 为准。不要把成功构建等同于成功发布；发布后至少验证首页、一个前端深层路由、`/api/health` 和 AI 对话的错误或流式路径。

## 十二、协作原则

- 开始前运行 `git status --short`，保留用户已有和无关改动。
- 先定位事实来源和现有测试，再做最小范围修改。
- 行为变更应同时包含实现、测试和必要文档，不留下虚假的“已实现”说明。
- 不提交密钥、本地变量、缓存、日志或构建产物。
- 不用大范围格式化掩盖实际改动，不顺手重构无关模块。
- 新增设计先区分“当前实现”和“未来规划”；需要持久化的功能必须明确外部存储与迁移方案。
- 面向用户的错误信息使用简明中文；日志保留结构化事件名和 `traceId`，但不得记录敏感内容。
- README 中的界面截图统一放在 `docs/screenshots/`，文件名保持稳定。

## 十三、相关文档

| 文件                                    | 内容           |
| --------------------------------------- | -------------- |
| `docs/01-platform-overview.md`          | 平台总览       |
| `docs/02-design-question-bank-admin.md` | 题库管理规划   |
| `docs/03-design-review-mode.md`         | 复习模式设计   |
| `docs/04-design-preview-mode.md`        | 预习模式设计   |
| `docs/05-future-video-pipeline.md`      | 视频流水线预研 |
| `docs/06-data-layer-api-contracts.md`   | 数据层接口约定 |
| `docs/07-日常优化.md`                   | 日常优化记录   |

实现文档中的功能前，先确认状态字段和当前代码；规划文档中的示例接口、权限和存储方案必须经过实现设计，不能直接照搬为生产行为。
