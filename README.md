# 算道 · 小学数学智能学习平台

算道是一个面向小学一至六年级学生与家庭的智能数学学习平台，提供知识图谱、摸底诊断、复习、预习、可治理题库与流式 AI 辅导。

[![CI](https://img.shields.io/github/actions/workflow/status/Erchoc/suan/ci.yml?branch=main&style=flat-square&logo=github&label=CI)](https://github.com/Erchoc/suan/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Erchoc/suan)

在线地址：<https://suan.longye.site>

## 界面预览

### 桌面端

![算道首页桌面端](docs/screenshots/home-desktop.png)

![算道知识图谱桌面端](docs/screenshots/graph-desktop.png)

### 移动端

<p align="center">
  <img src="docs/screenshots/home-mobile.png" alt="算道移动端首页" width="23%" />
  <img src="docs/screenshots/graph-mobile.png" alt="算道移动端知识图谱" width="23%" />
  <img src="docs/screenshots/assessment-mobile.png" alt="算道移动端摸底考试" width="23%" />
  <img src="docs/screenshots/review-mobile.png" alt="算道移动端复习" width="23%" />
</p>

<p align="center"><sub>首页 · 知识图谱 · 摸底考试 · 复习</sub></p>

## 核心特性

- **知识图谱**：一至六年级知识点依赖关系可视化，支持路径导航与前置追溯。
- **摸底诊断与报告**：自适应摸底定位薄弱知识点，生成可读的学习报告。
- **复习与预习**：基于知识点掌握度组织复习与预习会话。
- **可治理题库**：D1 题库资产与 Console 后台，支持编辑、启停、版本快照与学生反馈处理。
- **AI 分批生成与质检**：Cloudflare Workflows 承载可恢复的题库生成与质检长任务。
- **流式 AI 辅导**：受限的逐步提示式辅导，系统提示词由 Worker 服务端构造。

## 技术栈

前端 Vite + React 18 + TypeScript + React Router + Tailwind CSS + Zustand，图谱使用 `@xyflow/react` 与 Dagre；接口为运行在 Cloudflare Workers 上的 Hono；内容数据库为 Cloudflare D1；长任务由 Cloudflare Workflows 承载。

架构与数据契约详见 [docs/01-platform-overview.md](docs/01-platform-overview.md)。

## 快速开始

环境要求：Node.js 22.13.0 或更高版本、直接安装的 pnpm 10.12.4（不依赖 Corepack）。

```bash
pnpm install
cp .env.example .env
# 编辑 .env：替换 API_KEY，并为 ADMIN_SESSION_SECRET 设置独立随机密钥
pnpm db:migrate:local
pnpm db:seed:local
pnpm dev
```

`.env` 字段如下：

| 字段 | 示例默认值 | 说明 |
| --- | --- | --- |
| `BASE_URL` | `https://api.deepseek.com` | 供应商 API 根地址，不要直接写具体 completion endpoint |
| `API_KEY` | 无有效默认值 | 必填密钥；不支持拼成 `APIKEY` |
| `MODEL` | `deepseek-v4-flash` | 供应商实际模型标识 |
| `AI_PROTOCOL` | `openai-chat` | 可选 `openai-chat`、`openai-coding`、`anthropic` |
| `ADMIN_SESSION_SECRET` | 无安全默认值 | 至少 24 个字符，仅用于签名短时 Console 会话 |
| `USER_AUTH_SECRET` | 空 | 可选；至少 32 个字符，用于短信验证码 HMAC 摘要 |
| `TENCENT_SMS_*` | 空 | 可选；腾讯云短信凭据、应用与签名模板配置，仅由 Worker 读取 |
| `WECHAT_APP_ID` / `WECHAT_APP_SECRET` | 空 | 可选；微信开放平台网站应用凭据 |

`pnpm dev` 会同时提供 React 页面和 Hono Worker 接口。开发地址以终端输出为准，可用健康检查确认链路：

```bash
curl http://localhost:5173/api/health
```

题库后台地址为 `/console?pw=MMDD`，其中 `MMDD` 使用上海时区当天日期（例如 7 月 19 日为 `0719`）。页面会立即从地址栏移除 `pw`，Worker 验证后签发 8 小时 HttpOnly、SameSite=Strict 会话 Cookie。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` | 启动本地全栈开发环境 |
| `pnpm build` | 类型检查并构建生产产物 |
| `pnpm test` | 运行全部 Vitest 测试 |
| `pnpm check` | 运行完整 CI 门禁（绑定、Biome、类型、覆盖率、构建） |
| `pnpm db:migrate:local` | 在本地 D1 应用题库迁移 |
| `pnpm run deploy:production` | 构建并发布到 `suan.longye.site` |

题库生成与校验脚本（`gen:*`、`validate:questions`、`check:*`）、数据库与部署脚本的完整列表见 `package.json` 的 `scripts` 字段。

## 文档

- [文档索引](docs/README.md)
- [接口契约](docs/api.md)
- [部署与运维](docs/deployment.md)
- [产品方向与商业化假设](docs/product-roadmap.md)
- [贡献指南](CONTRIBUTING.md) · [安全策略](SECURITY.md)

## 部署

一键部署到你自己的 Cloudflare 账号：点击上方 “Deploy to Cloudflare” 按钮。生产发布、GitHub 自动部署与发布后验证见 [docs/deployment.md](docs/deployment.md)。

## 贡献

欢迎通过议题或拉取请求改进算道。请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)：保持改动聚焦，为行为变更补充测试，并在提交前运行 `pnpm check`。发现安全问题请按 [SECURITY.md](SECURITY.md) 上报。

## 许可

本项目采用 [MIT 许可证](LICENSE)。
