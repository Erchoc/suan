# 部署与运维

算道通过 Cloudflare Workers 部署。`wrangler.jsonc` 顶层是供开源用户和 “Deploy to Cloudflare” 按钮使用的可移植配置（Worker 名 `suan-starter`，发布到用户自己的 `*.workers.dev`）；项目维护者的 `suan` Worker 和域名路由只存在于 `env.production`。

## 一键部署到 Cloudflare

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Erchoc/suan)

点击按钮后，Cloudflare 会将本项目复制到你的 GitHub 或 GitLab 账号，创建 Worker、自动预配 D1 binding，并配置 Workers Builds。部署页会读取 `.env.example` 中声明的配置；`API_KEY` 与 `ADMIN_SESSION_SECRET` 会作为加密的 Worker Secret 保存，不会写入仓库。

默认部署到你自己 Cloudflare 账号下的独立 `*.workers.dev` 地址，不会占用本项目的生产域名。需要提前准备：

- Cloudflare 账号
- GitHub 或 GitLab 账号
- 一个受支持协议的 AI API Key，可按环境切换兼容的模型供应商
- 一段至少 24 个字符、只用于本项目的随机 `ADMIN_SESSION_SECRET`

D1 是线上题库的唯一数据源。首次部署需要在部署环境应用 `migrations/` 并执行一次幂等题库初始化；未初始化时题库接口会明确返回不可用，不再回退公开 JSON。

## 维护者生产发布

> 生产构建和部署必须使用 `deploy:production*` 脚本或在整个部署 job 中设置 `CLOUDFLARE_ENV=production`。Cloudflare Vite 插件在构建阶段读取该变量；构建完成后才传 `--env production` 不会改变已生成配置。

首次发布前登录 Cloudflare，并用已忽略提交的 `.env` 原子创建生产 Worker 与配置：

```bash
pnpm exec wrangler login
pnpm db:migrate:production
pnpm db:seed:production
pnpm run deploy:production:dry
CLOUDFLARE_ENV=production pnpm build
CLOUDFLARE_ENV=production pnpm exec wrangler deploy --secrets-file .env
```

Worker 已存在后，使用 `pnpm exec wrangler secret bulk .env --env production` 原子更新 Secret 字段；常规生产发布使用 `pnpm run deploy:production`。生产迁移与题库初始化不会由普通 Worker 发布自动执行，必须作为受控内容发布步骤单独运行。

## GitHub 自动部署（可选）

仓库包含 CI 与 Cloudflare 部署工作流。自动发布默认关闭；为仓库配置具备 Workers Scripts 与 Workers Routes 权限的 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID` 两项机密，再把仓库变量 `CLOUDFLARE_DEPLOY_ENABLED` 设为 `true`，`main` 推送或手动触发才会发布。Cloudflare 一键部署创建的项目已使用 Workers Builds，无需再启用这套 GitHub 部署工作流。

## 发布后验证

```bash
curl https://suan.longye.site/api/health
```

同时用真实浏览器检查首页、一个深层路由、主题切换、滚动和受影响的交互。PWA 变更还要检查安装模式、缓存更新与离线回退。
