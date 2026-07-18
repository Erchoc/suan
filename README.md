# 算道 · 小学数学智能学习平台

算道是一个面向小学一至六年级的智能学习平台，提供知识图谱、摸底诊断、复习与预习流程，并通过流式 AI 对话辅助孩子理解数学知识点。

[![CI](https://img.shields.io/github/actions/workflow/status/Erchoc/suan/ci.yml?branch=main&style=flat-square&logo=github&label=CI)](https://github.com/Erchoc/suan/actions/workflows/ci.yml)
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Erchoc/suan)

- 在线地址：[https://suan.longye.site](https://suan.longye.site)
- 开源协议：[MIT](LICENSE)
- 质量报告：[99 / 100](docs/质量报告.md)

## 界面预览

### 首页（桌面端）

![算道首页桌面端](docs/screenshots/home-desktop.png)

### 知识图谱（桌面端）

![算道知识图谱桌面端](docs/screenshots/graph-desktop.png)

### 移动端

<p align="center">
  <img src="docs/screenshots/home-mobile.png" alt="算道移动端首页" width="23%" />
  <img src="docs/screenshots/graph-mobile.png" alt="算道移动端知识图谱" width="23%" />
  <img src="docs/screenshots/assessment-mobile.png" alt="算道移动端摸底考试" width="23%" />
  <img src="docs/screenshots/review-mobile.png" alt="算道移动端复习" width="23%" />
</p>

<p align="center"><sub>首页 · 知识图谱 · 摸底考试 · 复习</sub></p>

## 当前架构

仓库是根目录单包全栈应用，前端与接口由同一套开发和部署流程管理：

```text
浏览器
├── Vite 构建的 React 单页应用
└── 同源 /api/* 请求
    └── Hono Cloudflare Worker
        ├── /api/health
        └── /api/ai/chat
            └── 可配置 AI 上游（Chat Completions / Responses / Anthropic Messages）
```

- 前端：Vite 8、React 18、TypeScript、React Router、Tailwind CSS、Zustand
- 图谱与图表：`@xyflow/react`、Dagre、Recharts
- 接口：Hono，运行于 Cloudflare Workers
- 静态资源：由 Worker Assets 托管，未知前端路由回退到单页应用
- 部署配置：`wrangler.jsonc` 顶层使用独立的 `suan-starter` 并可部署到 `*.workers.dev`，项目生产环境才使用 `suan` 与 `env.production` 中的 `suan.longye.site/*`

## 一键部署到 Cloudflare

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Erchoc/suan)

点击按钮后，Cloudflare 会将本项目复制到你的 GitHub 或 GitLab 账号，创建 Worker，并配置 Workers Builds。部署页会读取 `.env.example` 中声明的配置；`API_KEY` 会作为加密的 Worker Secret 保存，不会写入仓库。

默认部署到你自己 Cloudflare 账号下的独立 `*.workers.dev` 地址，不会占用本项目的生产域名。需要提前准备：

- Cloudflare 账号
- GitHub 或 GitLab 账号
- DeepSeek API Key

## 本地开发

环境要求：Node.js 22.13.0 或更高版本、直接安装的 pnpm 10.12.4。项目不依赖 Corepack。

```bash
pnpm install
cp .env.example .env
# 编辑 .env，至少把 API_KEY 换成可用密钥
pnpm dev
```

`.env` 字段如下：

| 字段 | 示例默认值 | 说明 |
| --- | --- | --- |
| `BASE_URL` | `https://api.deepseek.com` | 供应商 API 根地址，不要直接写具体 completion endpoint |
| `API_KEY` | 无有效默认值 | 必填密钥；不支持拼成 `APIKEY` |
| `MODEL` | `deepseek-v4-flash` | 供应商实际模型标识 |
| `AI_PROTOCOL` | `openai-chat` | 可选 `openai-chat`、`openai-coding`、`anthropic` |

使用 Anthropic 原生接口时可将 `BASE_URL` 设为 `https://api.anthropic.com`；使用 DeepSeek 的 Anthropic 兼容接口时设为 `https://api.deepseek.com/anthropic`。Worker 会安全补齐对应 endpoint。

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

接收知识点上下文与 `user`、`assistant` 消息，Worker 在服务端生成系统提示词，再按 `AI_PROTOCOL` 调用 Chat Completions、Responses 或 Anthropic Messages 上游，并将 SSE 数据流统一为前端现有契约。

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

- 生产环境的 `API_KEY` 只保存为 Cloudflare Worker Secret，只能由 Worker 读取。
- 本地开发使用已被 Git 忽略的 `.env`；不要提交该文件，也不要把密钥放进 Wrangler vars。
- 浏览器只请求同源 `/api/ai/chat`，不得直接调用配置的 AI 上游，也不得在前端代码、公开环境变量、构建产物或日志中放入密钥。
- 环境字段统一为 `BASE_URL`、`API_KEY`、`MODEL` 和 `AI_PROTOCOL`，不兼容 `APIKEY` 或旧的 `AI_API_KEY`、`AI_BASE_URL`、`AI_MODEL` 字段。
- `.env.example` 默认使用 `https://api.deepseek.com` 与 `deepseek-v4-flash`。[DeepSeek 当前官方模型列表](https://api-docs.deepseek.com/api/list-models)中的 Flash 型号是 V4；不存在可用的 `deepseek-v3-flash` API 标识。
- `AI_PROTOCOL` 支持 `openai-chat`、`openai-coding`、`anthropic`，默认 `openai-chat`。前者使用 Chat Completions，`openai-coding` 使用 Responses，`anthropic` 使用 Messages；Worker 会把不同上游流统一为浏览器现有的 SSE 契约。
- 同源校验和请求限流不等同于用户身份认证；未来新增管理接口时必须另行实现服务端鉴权。

## 常用命令

以下命令均在仓库根目录执行。

| 命令                    | 用途                                         |
| ----------------------- | -------------------------------------------- |
| `pnpm dev`              | 启动本地全栈开发环境                         |
| `pnpm build`            | 类型检查并构建生产产物                       |
| `pnpm preview`          | 构建并预览生产产物                           |
| `pnpm typecheck`        | 检查 TypeScript 类型                         |
| `pnpm format`           | 使用 Biome 格式化代码                        |
| `pnpm lint`             | 运行 Biome lint                              |
| `pnpm test`             | 运行全部 Vitest 测试                         |
| `pnpm test:coverage`    | 运行核心业务测试并输出覆盖率                 |
| `pnpm test:watch`       | 监听模式运行测试                             |
| `pnpm run ci`           | 运行绑定、Biome、类型、覆盖率和构建门禁      |
| `pnpm check`            | 与 `pnpm run ci` 相同的本地完整检查入口      |
| `pnpm cf-typegen`       | 按 Worker 配置重新生成绑定类型               |
| `pnpm cf-typegen:check` | 检查绑定类型是否最新                         |
| `pnpm run deploy:dry`   | 构建并预检默认的可移植部署                   |
| `pnpm run deploy`       | 构建并发布默认的 `workers.dev` 版本          |
| `pnpm run deploy:production:dry` | 预检项目维护者的生产版本            |
| `pnpm run deploy:production` | 构建并发布到 `suan.longye.site`          |

题库维护脚本也从根目录运行：`pnpm gen:questions`、`pnpm gen:cards`、`pnpm gen:fill`、`pnpm gen:choice`、`pnpm gen:half`、`pnpm gen:auto`、`pnpm gen:dry`、`pnpm validate:questions`、`pnpm check:questions`、`pnpm check:grade`、`pnpm check:kp`、`pnpm check:dry`。

## 测试与发布

提交变更前运行完整检查：

```bash
pnpm check
```

项目使用 Istanbul 统计显式列出的核心业务模块，并在 CI 中执行全局覆盖率门禁：语句 90%、分支 80%、函数 90%、行 90%。`vitest.config.ts` 还为每个核心文件设置了独立底线，避免高覆盖文件掩盖低覆盖模块。修复核心逻辑缺陷或增加核心业务模块时，应同步补充单测并把新模块纳入统计，不能通过缩小 coverage include 规避门槛。

项目维护者首次发布前登录 Cloudflare，并用已忽略提交的 `.env` 原子创建生产 Worker 与配置：

```bash
pnpm exec wrangler login
pnpm run deploy:production:dry
CLOUDFLARE_ENV=production pnpm build
CLOUDFLARE_ENV=production pnpm exec wrangler deploy --secrets-file .env
```

Worker 已存在后，使用 `pnpm exec wrangler secret bulk .env --env production` 原子更新四个字段；常规生产发布使用 `pnpm run deploy:production`。

仓库包含 CI 与 Cloudflare 部署工作流。自动发布默认关闭；为仓库配置具备 Workers Scripts 与 Workers Routes 权限的 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID` 两项机密，再把仓库变量 `CLOUDFLARE_DEPLOY_ENABLED` 设为 `true`，`main` 推送或手动触发才会发布。Cloudflare 一键部署创建的项目已使用 Workers Builds，无需再启用这套 GitHub 部署工作流。

发布完成后验证：

```bash
curl https://suan.longye.site/api/health
```

## 贡献

欢迎通过议题或拉取请求改进算道。请保持改动聚焦，为行为变更补充测试，并在提交前运行 `pnpm check`。不要提交真实密钥、本地变量文件、构建产物或无关改动。

## 许可

本项目采用 [MIT 许可证](LICENSE)。
