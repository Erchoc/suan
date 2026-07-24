# 贡献指南

感谢参与算道。本指南帮助你的改动顺利合入。工程规范的完整事实源是仓库根目录的 [`AGENTS.md`](AGENTS.md)，提交前请务必阅读。

## 环境准备

- Node.js 22.13.0 或更高版本
- 直接安装的 pnpm 10.12.4（项目不依赖 Corepack）

```bash
pnpm install
cp .env.example .env   # 编辑 API_KEY 与 ADMIN_SESSION_SECRET
pnpm db:migrate:local
pnpm db:seed:local
pnpm dev
```

## 开发约定

- **语言**：代码标识符、注释、测试标题、日志用英文；Markdown 文档用中文；面向学生的产品文案、题库数据、教学提示词可保留中文。不要翻译持久化枚举、接口字段等既有数据契约。
- **格式与静态检查**：Biome 是唯一的格式化和 lint 工具，不要引入 ESLint 或 Prettier。提交前运行 `pnpm format` 与 `pnpm lint`。
- **测试**：修改判题、选题、报告聚合、状态机、图遍历、流式解析、Worker 校验或提示词契约时，必须同步补充或更新单测。缺陷修复先写能复现根因的回归测试。
- **最小改动**：优先小而可逆、与现有架构一致的改动，避免顺手重构无关模块。

## 提交前检查

提交前运行完整门禁：

```bash
pnpm check
```

它会依次执行绑定类型检查、Biome、TypeScript 类型、覆盖率门禁与构建。Lefthook 会在 pre-commit 与 pre-push 阶段自动运行相关检查，请不要用 `--no-verify` 绕过。

## 提交拉取请求

1. 从 `main` 切出聚焦单一主题的分支。
2. 保持提交信息清晰，说明动机而非仅罗列改动。
3. 在 PR 描述中区分“本地验证”“已提交/推送”“已部署”，并提供真实证据。
4. 不要提交：`.env`、`.dev.vars`、本地缓存、日志、coverage、构建产物、真实密钥或无关改动。

## 不要做

- 不新增第二套接口运行时，也不让浏览器绕过 `/api/ai/chat` 直接访问模型服务。
- 不修改已应用的 `migrations/`。
- 不手改 `worker-configuration.d.ts`（由 `pnpm cf-typegen` 生成）。
- 不通过缩小 coverage 统计范围让 CI 变绿。

安全问题请勿走公开 Issue，参见 [SECURITY.md](SECURITY.md)。
