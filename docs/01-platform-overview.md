# 算道 · 小学数学平台现状总览

> 文档版本：v3.0 · 2026-07-19
> 状态：描述当前仓库已实现能力；生产环境已启用 D1 题库与 `/console` 资产后台。

## 一、产品定位

算道面向小学一至六年级学生、家长和老师，围绕人教版数学知识体系提供四条核心学习路径：

1. **知识图谱**：浏览 241 个知识点及其前后依赖。
2. **摸底诊断**：按年级、学期和范围选题，完成答题后生成薄弱点报告。
3. **复习**：从错题、收藏和指定知识点组织即时判题练习。
4. **预习**：通过知识卡、练习和流式 AI 对话理解新知识点。

生产地址：[https://suan.longye.site](https://suan.longye.site)。

## 二、当前全栈架构

项目是一个根目录单包应用，前端和接口由同一套 Vite/Cloudflare 流程开发、测试和发布。

```text
浏览器
├── React 单页应用
│   ├── 页面、知识图谱与本地学习状态
│   ├── D1 已发布题库
│   └── /console 题库资产后台
└── 同源 /api/*
    └── Hono Cloudflare Worker
        ├── GET /api/health
        ├── GET /api/questions 与 /api/admin/*
        │   └── Cloudflare D1
        ├── Cloudflare Workflows → MiniMax 生成 / 质检
        └── POST /api/ai/chat → 可配置 AI 上游
```

| 层级       | 当前技术                                       |
| ---------- | ---------------------------------------------- |
| 前端       | React 18、TypeScript 5、React Router 6         |
| 构建       | Vite 8、Cloudflare Vite 插件                   |
| 样式与交互 | Tailwind CSS 3、Framer Motion、Lucide React    |
| 状态       | Zustand 与浏览器 `localStorage`                |
| 图谱与图表 | `@xyflow/react`、Dagre、Recharts               |
| 接口       | Hono 4、Cloudflare Workers                     |
| 内容数据   | Cloudflare D1；非公开 JSON 仅用于首次初始化    |
| 后台长任务 | Cloudflare Workflows；D1 保存任务进度与幂等批次 |
| 静态资源   | Cloudflare Workers Static Assets、单页应用回退 |
| 测试与检查 | Vitest、Workers 测试池、Biome、TypeScript      |

生产流量由 `suan.longye.site/*` Worker Route 接管。静态文件优先走 Cloudflare 资产层，`/api` 与 `/api/*` 优先进入 Hono Worker。

## 三、当前页面路由

| 路径                         | 功能                   |
| ---------------------------- | ---------------------- |
| `/`                          | 首页与模块入口         |
| `/graph`                     | 知识图谱               |
| `/assessment`                | 摸底模式选择           |
| `/assessment/exam`           | 考试配置               |
| `/assessment/upload`         | 试卷上传配置，占位功能 |
| `/exam/:sessionId`           | 答题会话               |
| `/report/:sessionId`         | 诊断报告               |
| `/review`                    | 复习入口               |
| `/review/:sessionId`         | 复习会话               |
| `/review/:sessionId/summary` | 复习总结               |
| `/preview`                   | 预习入口               |
| `/preview/:sessionId`        | 预习会话               |
| `/question/:questionId`      | 题目详情               |
| `/console`                   | 题库资产管理后台       |

所有页面路由均使用懒加载；Cloudflare 的单页应用回退保证直接刷新深层路由仍返回前端入口。

## 四、数据现状

| 数据   | 当前规模与来源                                       |
| ------ | ---------------------------------------------------- |
| 知识点 | `src/data/knowledge-graph.json`，实际 241 个         |
| 题库   | D1 管理源与发布快照；静态基线 4,735 道，其中 3,852 道启用 |
| 知识卡 | `src/data/knowledge-cards.json`                      |

`src/data/kpIndex.ts` 在运行时构建知识点索引，提供知识点上下文、完整前置链、后续节点和按年级/学期范围查询。学生端题库通过统一异步层读取 D1 已发布版本；约 4.2 MB 的初始化 seed 位于 `data/questions.seed.json`，不会进入前端构建或静态资源。

## 五、状态与持久化

考试、复习和预习会话目前保存在浏览器本地：

| 存储键            | 内容               |
| ----------------- | ------------------ |
| `suandao-exam`    | 考试会话与答题状态 |
| `suandao-review`  | 复习会话           |
| `suandao-preview` | 预习会话           |

这些键属于兼容契约，项目更名或重构时不能随意改动。当前没有用户账号和云端会话持久化，不应把本地数据描述成跨设备同步。

## 六、当前接口

- `GET /api/health`：报告 Worker 与 AI 配置状态。
- `GET /api/questions`、`GET /api/questions/:id`：返回 D1 已发布题库及单题。
- `POST /api/questions/:id/report`：把用户反馈与当时的题库版本、历史题面绑定。
- `/api/admin/*`：短时签名会话、题库分页筛选、反馈处理、编辑、批量启停，以及可恢复的生成/质检任务。
- `POST /api/ai/chat`：校验同源、输入大小与消息结构，由 Worker 构造系统提示词；OpenAI Chat 流原样转发，Responses 与 Anthropic 流会归一化为前端统一的 SSE 契约。

生产 `API_KEY` 仅存于 Cloudflare Worker Secret。Worker 通过 `BASE_URL`、`MODEL` 与 `AI_PROTOCOL` 选择上游；协议支持 `openai-chat`、`openai-coding` 和 `anthropic`。AI 路由通过 Cloudflare Rate Limiting binding 限制调用频率，并对客户端隐藏上游错误正文。

题库管理已经使用 D1 实现，并保留历史题面。手工修改、启停和 AI 质检结果自动同步给后续新建作答；AI 生成题默认停用，质检合格后才启用。考试与复习 Session 仍保存在浏览器本地，但会直接固化完整题目和题库版本，所以后续修题不会改写既有试卷或做题记录。当前用户账号、云端 Session、OCR 与周报接口仍未实现；相关文档中的这些部分仍是未来规划。

## 七、主题与体验

产品支持明暗主题、响应式桌面/移动导航、PWA 安装和离线静态资源缓存。主强调色为橙色，六个年级使用独立颜色，桥头堡知识点使用专用绿色。修改布局时必须同时验证桌面和移动端，并保持键盘焦点、语义标签及颜色对比度可用。

## 八、后续方向

- 用户登录与可靠的服务端授权。
- 考试、复习和预习会话的云端持久化与迁移。
- 试卷 OCR 分析。
- 家长周报与跨设备学习记录。
- D1 历史发布版本回滚、多管理员角色与图片资产管理。

上述后续能力均应继续扩展现有 Hono Worker，并明确未成年人数据、监护人授权与离线迁移边界。
