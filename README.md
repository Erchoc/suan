# 算道 · 小学数学智能学习平台

算道是一个面向小学一至六年级的智能学习平台，提供知识图谱、摸底诊断、复习与预习流程，并通过流式 AI 对话辅助孩子理解数学知识点。

- 在线地址：[https://suan.longye.site](https://suan.longye.site)
- 开源协议：[MIT](LICENSE)

## 界面预览

### 首页（桌面端）

![算道首页桌面端](docs/screenshots/home-desktop.png)

### 知识图谱（桌面端）

![算道知识图谱桌面端](docs/screenshots/graph-desktop.png)

### 首页（移动端）

![算道首页移动端](docs/screenshots/home-mobile.png)

## 当前架构

仓库是根目录单包全栈应用，前端与接口由同一套开发和部署流程管理：

```text
浏览器
├── Vite 构建的 React 单页应用
└── 同源 /api/* 请求
    └── Hono Cloudflare Worker
        ├── /api/health
        └── /api/ai/chat
            └── DeepSeek 的 OpenAI 兼容接口（流式响应）
```

- 前端：Vite 8、React 18、TypeScript、React Router、Tailwind CSS、Zustand
- 图谱与图表：`@xyflow/react`、Dagre、Recharts
- 接口：Hono，运行于 Cloudflare Workers
- 静态资源：由 Worker Assets 托管，未知前端路由回退到单页应用
- 部署配置：`wrangler.jsonc`，生产 Worker 路由为 `suan.longye.site/*`

## 本地开发

环境要求：Node.js 22.13.0 或更高版本、pnpm 10.12.4。

```bash
pnpm install
cp .dev.vars.example .dev.vars
# 编辑 .dev.vars，填入本地开发使用的 AI_API_KEY
pnpm dev
```

开发地址以终端输出为准。`pnpm dev` 会同时提供 React 页面和 Hono Worker 接口，不需要单独启动接口进程。

可用健康检查确认前后端链路：

```bash
curl http://localhost:5173/api/health
```

若本地端口不同，请替换为终端显示的地址。

## 接口

### `GET /api/health`

返回服务、运行时和 AI 配置状态。该接口只报告密钥是否已配置，不会返回密钥内容。

### `POST /api/ai/chat`

接收知识点上下文与 `user`、`assistant` 消息，Worker 在服务端生成系统提示词，再调用 DeepSeek OpenAI 兼容接口，并将上游 SSE 数据流返回浏览器。

请求头必须包含：

- `Content-Type: application/json`
- `X-Suan-Client-Id: <UUID>`

请求体结构：

```json
{
  "kpId": "1-1",
  "kpName": "数一数",
  "gradeNum": 1,
  "explanation": "认识数字与数量的关系",
  "messages": [{ "role": "user", "content": "1 加 1 等于几？" }]
}
```

接口会校验同源浏览器请求、内容类型、客户端标识、消息数量与长度，并通过 Cloudflare 限流绑定控制调用频率；边缘请求优先按连接 IP 限流，本地测试回退到客户端标识。接口错误统一返回结构化 JSON 和 `traceId`；上游错误正文不会透传给客户端。

## 安全边界

- 生产环境的 `AI_API_KEY` 只保存为 Cloudflare Worker Secret，只能由 Worker 读取。
- 本地开发使用已被 Git 忽略的 `.dev.vars` 模拟同名 Secret；不要提交该文件。
- 浏览器只请求同源 `/api/ai/chat`，不得直接调用 DeepSeek，也不得在前端代码、公开环境变量、构建产物或日志中放入密钥。
- `AI_BASE_URL` 与 `AI_MODEL` 是非敏感配置，当前在 `wrangler.jsonc` 中分别指向 DeepSeek 兼容地址和 `deepseek-chat`。
- 同源校验和请求限流不等同于用户身份认证；未来新增管理接口时必须另行实现服务端鉴权。

## 常用命令

以下命令均在仓库根目录执行。

| 命令                    | 用途                                         |
| ----------------------- | -------------------------------------------- |
| `pnpm dev`              | 启动本地全栈开发环境                         |
| `pnpm build`            | 类型检查并构建生产产物                       |
| `pnpm preview`          | 构建并预览生产产物                           |
| `pnpm typecheck`        | 检查 TypeScript 类型                         |
| `pnpm lint`             | 运行 ESLint                                  |
| `pnpm test`             | 运行全部 Vitest 测试                         |
| `pnpm test:watch`       | 监听模式运行测试                             |
| `pnpm check`            | 依次检查绑定类型、类型、代码规范、测试和构建 |
| `pnpm cf-typegen`       | 按 Worker 配置重新生成绑定类型               |
| `pnpm cf-typegen:check` | 检查绑定类型是否最新                         |
| `pnpm run deploy:dry`   | 构建并执行发布预检                           |
| `pnpm run deploy`       | 构建并发布到 Cloudflare Workers              |

题库维护脚本也从根目录运行：`pnpm gen:questions`、`pnpm gen:cards`、`pnpm gen:fill`、`pnpm gen:choice`、`pnpm gen:half`、`pnpm gen:auto`、`pnpm gen:dry`、`pnpm validate:questions`、`pnpm check:questions`、`pnpm check:grade`、`pnpm check:kp`、`pnpm check:dry`。

## 测试与发布

提交变更前运行完整检查：

```bash
pnpm check
```

首次发布前登录 Cloudflare。对于尚不存在的 Worker，Wrangler 无法预先执行 `secret put`，应直接用已忽略提交的 `.dev.vars` 原子创建 Worker 与 Secret：

```bash
pnpm exec wrangler login
pnpm run deploy:dry
pnpm build
pnpm exec wrangler deploy --secrets-file .dev.vars
```

Worker 已存在后，轮换密钥使用 `pnpm exec wrangler secret put AI_API_KEY`；常规发布使用 `pnpm run deploy`。

仓库包含中文 CI 与 Cloudflare 部署工作流。自动发布默认关闭；为仓库配置具备 Workers Scripts 与 Workers Routes 权限的 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID` 两项机密，再把仓库变量 `CLOUDFLARE_DEPLOY_ENABLED` 设为 `true`，`main` 推送才会自动发布。也可以在 GitHub Actions 中手动触发部署。

发布完成后验证：

```bash
curl https://suan.longye.site/api/health
```

## 贡献

欢迎通过议题或拉取请求改进算道。请保持改动聚焦，为行为变更补充测试，并在提交前运行 `pnpm check`。不要提交真实密钥、本地变量文件、构建产物或无关改动。

## 许可

本项目采用 [MIT 许可证](LICENSE)。
