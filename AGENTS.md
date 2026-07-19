<!-- BEGIN dfctl (auto-managed, do not edit) -->
The `dfctl` CLI is installed on this machine (deploy & operate apps on the platform).
Before running any `dfctl` command, read `/Users/longye/.codex/dfctl/DFCTL.md` for the canonical usage guide
so you don't guess flags or invent subcommands.
<!-- END dfctl -->

# 算道仓库协作指南

`AGENTS.md` 是本仓库面向 AI 编程工具和贡献者的唯一工程指导源。`CLAUDE.md` 只引用本文件，不要复制规则形成两份文档。

修改前先阅读真实代码、配置和现有测试。`package.json`、`wrangler.jsonc`、类型定义与运行时行为是事实来源；`docs/` 中标为规划的内容不代表已经实现。

## 项目定位与架构

算道是面向小学一至六年级的中文智能数学学习平台，包含知识图谱、摸底诊断、答题、报告、复习、预习和 AI 辅导。

仓库是单包 Cloudflare 全栈应用：

```text
浏览器
├── React + Vite 单页应用
│   ├── React Router
│   ├── Zustand 本地状态
│   └── public/ 题库与 PWA 资源
└── 同源 /api/*
    └── worker/index.ts 中的 Hono Worker
        ├── GET /api/health
        ├── GET /api/questions 与 /api/admin/*
        │   └── Cloudflare D1 题库资产
        └── POST /api/ai/chat
            └── 可配置 AI 上游（Chat Completions / Responses / Anthropic Messages）
```

不要新增第二套接口运行时，也不要让浏览器绕过 `/api/ai/chat` 直接访问模型服务。生产地址是 <https://suan.longye.site>。

## 语言约定

- TypeScript、JavaScript、CSS、HTML、JSONC、YAML 中的标识符、代码注释、测试标题、开发者日志和工作流标签使用英文。
- Markdown 文档使用中文；`README.md`、`AGENTS.md` 与 `docs/**/*.md` 均属于中文文档。
- 中文产品文案、课程/题库数据、教学提示词、面向学生的错误信息和用于验证中文行为的测试 fixture 可以保留中文。这些内容属于产品数据，不属于代码命名或开发注释。
- 不要为了满足语言规则翻译持久化枚举值、接口字段或既有数据契约，例如学期值 `上` / `下`。

## 目录职责

```text
src/                         React 应用
├── components/              通用组件
├── contexts/                React 上下文
├── data/                    知识图谱、知识卡与运行时索引
├── hooks/                   业务钩子
├── pages/                   路由页面
├── stores/                  Zustand 业务状态
├── types/                   共享前端类型
└── utils/                   纯函数、图算法与 AI 流式客户端
worker/                      Hono Worker 与接口测试
public/                      运行时题库、图标和 PWA 资源
scripts/                     题目生成、知识卡生成与校验脚本
docs/                        已实现说明、规划和真实截图
```

关键数据约定：

- `src/data/knowledge-graph.json` 是知识图谱源数据。
- `data/questions.seed.json` 是非公开题库初始化基线；学生端只读取 D1 已发布版本，不提供静态题库回退。不要将 seed 打入前端 JavaScript 或静态资源。
- `migrations/` 管理 D1 schema，`scripts/seedQuestionBank.ts` 生成被忽略的幂等初始化 SQL；不要修改已应用迁移。
- `src/data/knowledge-cards.json` 是知识卡数据。
- 考试、复习和预习状态目前保存在浏览器本地，不要描述成云端持久化。
- `worker-configuration.d.ts` 由 Wrangler 生成；修改绑定后运行 `pnpm cf-typegen`，禁止手改。

## AI 编程执行提示

开始任务时：

1. 运行 `git status --short`，保留用户已有和无关改动。
2. 先定位真实调用链、契约、现有测试和最近相关提交，再修改代码。
3. 把用户要求拆成可验证的验收项；不要用“构建成功”代替功能完成。
4. 优先最小、可逆、与现有架构一致的改动，避免顺手重构无关模块。
5. 缺陷修复先写或补能复现根因的回归测试，再验证真实浏览器或 Worker 行为。

交付任务时：

1. 运行与改动直接相关的最小测试。
2. 运行完整 `pnpm check`，确认 Biome、类型、覆盖率、构建和 Worker 类型均通过。
3. 涉及部署时先运行 production dry-run，再部署并检查首页、深层路由、健康接口和受影响功能。
4. 明确区分“本地验证”“已提交/推送”“已部署”，提供真实证据，不猜测外部状态。

## 常用命令

所有命令都在仓库根目录执行：

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` | 启动 React 与 Worker 的本地开发环境 |
| `pnpm build` | 类型检查并构建可移植的默认版本 |
| `pnpm preview` | 构建后本地预览 |
| `pnpm format` | 使用 Biome 格式化代码 |
| `pnpm lint` | 运行 Biome lint |
| `pnpm test` | 运行全部 Vitest 测试 |
| `pnpm test:coverage` | 运行核心业务测试并输出覆盖率 |
| `pnpm run ci` | 运行完整持续集成门禁 |
| `pnpm check` | 与 `pnpm run ci` 相同的本地入口 |
| `pnpm cf-typegen` | 重新生成 Worker 绑定类型 |
| `pnpm run deploy:dry` | 预检默认的可移植部署 |
| `pnpm run deploy:production:dry` | 预检项目维护者的生产部署 |
| `pnpm run deploy:production` | 部署到 `suan.longye.site` |

`pnpm-workspace.yaml` 虽然是单包配置，但还负责 pnpm 的依赖构建许可，不要仅因为当前只有一个包就删除。

项目直接使用 pnpm，不依赖 Corepack。开发机自行安装 `packageManager` 字段指定的 pnpm 版本；GitHub Actions 使用 `pnpm/action-setup`，不要新增 `corepack enable` 或 `corepack prepare`。

## 代码质量与测试

- Biome 是唯一格式化和 lint 工具；不要重新加入 ESLint 或 Prettier。
- Lefthook 在 pre-commit 检查暂存代码，在 pre-push 运行类型检查和单测。不要绕过 hook 来掩盖失败。
- CI 使用 Istanbul 采集覆盖率，因为 Cloudflare Workers Vitest pool 不支持 V8 coverage。
- 覆盖率必须显式包含未被测试导入的核心模块，防止只统计已加载文件造成虚高。
- 修改判题、选题、报告聚合、状态机、图遍历、流式解析、Worker 校验或提示词契约时，必须同步补充单测。
- 新增核心业务模块时，将它加入 `vitest.config.ts` 的 coverage include，并保持或提高现有阈值；不要通过缩小统计范围让 CI 变绿。
- UI 展示、生成脚本和通用基建可按风险决定测试层级，但不能用它们的用例数量冒充核心业务覆盖率。
- 修改题库后运行对应校验脚本；构建成功不能替代数据正确性校验。

## iPhone 主题与滚动踩坑

- iOS Safari 可能从 `html`、`body` 背景以及贴近视口边缘的 fixed/sticky 元素推导顶部浏览器栏颜色，不只读取 `theme-color`。
- 页面根背景切换必须在点击事件中同步更新 `data-theme`、`color-scheme`、`html`/`body` 背景和同一个稳定的 `meta[name="theme-color"]` 节点。
- 禁止给 `html` 或 `body` 的主题背景添加 `background-color` transition；Safari 可能在动画起点采样上一主题颜色，导致系统栏永远慢一次切换。
- 首屏主题脚本必须位于 `<head>` 并在首次绘制前运行，避免先显示错误的系统栏或页面颜色。
- `apple-mobile-web-app-status-bar-style` 主要影响添加到主屏后的 standalone 模式；不要把 H5 Safari 与 PWA 状态栏当成同一契约。
- 普通页面使用 document 原生滚动。不要重新锁死 `body`，不要在全局 `touchmove` 上 `preventDefault()` 实现下拉刷新。
- 只有明确的全屏页面才能拥有内部滚动容器；新增 fixed 遮罩或弹窗时必须验证关闭、卸载和异常路径都会恢复滚动。

## Worker 接口与安全边界

`POST /api/ai/chat` 只接受受限的 `user` / `assistant` 消息；系统提示词由 Worker 构造。保持请求体大小、消息数量/长度、年级、同源和限流校验。

生产 `API_KEY` 与 `ADMIN_SESSION_SECRET` 只能保存为 Cloudflare Worker Secret。AI 环境契约只接受 `BASE_URL`、`API_KEY`、`MODEL`、`AI_PROTOCOL`，不要兼容 `APIKEY` 或旧的 `AI_API_KEY`、`AI_BASE_URL`、`AI_MODEL` 名称；题库后台另使用至少 24 个字符的 `ADMIN_SESSION_SECRET` 签名会话。禁止把真实密钥写入源码、Wrangler vars、Vite 公开变量、日志、截图、测试快照或提交记录。

题库只能通过 `CONTENT_DB` D1 binding 访问，所有用户输入必须使用 prepared statement bind。管理员密钥只用于换取短时 HttpOnly 会话，不能放入 URL、请求头持久保存或浏览器 `localStorage`；管理写接口同时验证会话与同源。

`AI_PROTOCOL` 只允许 `openai-chat`、`openai-coding`、`anthropic`，缺省语义为 `openai-chat`。三种上游协议都必须流式归一化为前端现有的 OpenAI Chat SSE 契约，不能要求浏览器感知供应商格式。

上游 SSE 响应必须流式转发，不能聚合未知大小的正文。失败响应保持 `{ error: { code, message }, traceId }`，不得向客户端泄漏上游正文、凭据或堆栈。

修改接口契约时同步更新：

- `worker/index.test.ts`
- `src/utils/aiChat.ts` 及其测试
- 相关中文文档

## Cloudflare 部署约定

`wrangler.jsonc` 顶层是供开源用户和 Deploy to Cloudflare 按钮使用的可移植配置，Worker 名为 `suan-starter`，默认发布到用户自己的 `*.workers.dev`。项目维护者的 `suan` Worker 和域名路由只存在于 `env.production`；不要把两个环境改成同名，否则误跑默认部署可能影响生产 Worker。

Cloudflare Vite 插件在构建阶段读取 `CLOUDFLARE_ENV`；构建完成后才传 `--env production` 不会改变已生成配置。因此生产构建和部署必须使用 `deploy:production*` 脚本或在整个部署 job 中设置 `CLOUDFLARE_ENV=production`。

首次部署读取 `.env.example` 中的 `BASE_URL`、`API_KEY`、`MODEL`、`AI_PROTOCOL` 和 `ADMIN_SESSION_SECRET`。示例可以提供非敏感默认值，但不得包含有效密钥；一键部署表单会据此收集并保存 Worker 配置。D1 未迁移或未初始化时题库接口返回明确错误；启用学生端和后台前需要显式执行迁移和幂等题库初始化。

发布后至少验证：

```bash
curl https://suan.longye.site/api/health
```

同时用真实浏览器检查首页、一个深层路由、主题切换、滚动和受影响的交互。PWA 变更还要检查安装模式、缓存更新与离线回退。

## 文档与协作边界

- README 和项目文档使用中文，截图放在 `docs/screenshots/` 并保持稳定文件名。
- 规划文档中的示例接口、权限和存储方案必须先完成实现设计，不能直接当作生产行为。
- 不提交 `.env`、`.dev.vars`、本地缓存、日志、coverage、构建产物或执行规划文件。
- 面向用户的错误信息可以是中文；结构化日志事件名、字段和开发者诊断使用英文并保留 `traceId`。
- 不新增功能重叠的依赖，不为“整理根目录”破坏工具的标准配置发现机制。
