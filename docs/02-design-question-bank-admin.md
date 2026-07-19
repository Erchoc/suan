# 题库资产与管理后台

> 文档版本：v3.0 · 2026-07-19
> 状态：已实现；生产环境需单独执行 D1 迁移、初始化并配置 `ADMIN_SESSION_SECRET` 后启用。

## 一、定位

题库不再只是随前端发布的 JSON 文件，而是一套可查询、可编辑、可生成、可质检、可追踪的数据资产。

模块入口为 `/console?pw=MMDD`，当前面向单管理员。核心能力包括：

- 题目统计、分页、搜索与多条件筛选。
- 题干、答案、选项、解析、提示和元数据编辑。
- 单题及批量启用/禁用，禁用时强制记录质量原因。
- 手工修改、启停和质检结果自动同步给后续新建作答。
- 通过 Cloudflare Workflows 调用 MiniMax 分批生成与质检，支持持久进度、重试和停止。
- 用户题目反馈聚合、历史题面核对、停用、修复和忽略闭环。
- 桌面表格和移动卡片两种管理布局。

## 二、数据边界

```text
data/questions.seed.json
        │ 幂等初始化，不作为前端资源
        ▼
Cloudflare D1
├── questions                 当前可编辑草稿
├── published_questions       学生端只读发布快照
├── published_question_versions 按发布版本保留完整题面
├── question_reports          用户反馈、题面快照与处理状态
├── question_bank_meta        草稿/发布修订和来源哈希
├── question_bank_releases    发布记录
├── question_audit_logs       编辑、批量与 AI 批次内部记录
├── question_tasks            生成/质检任务状态与统计
├── question_task_events      可读进度事件
└── question_task_batches     Workflow 重试幂等键与批次结果
```

后台保存、启停和质检会在同一个 D1 批处理中更新 `questions`、推进修订号、增量更新 `published_questions` 并保存该题的新历史版本。生成任务写入的新题默认 `enable=false`，因此虽然已经成为 D1 资产，但不会被学生端可用题库查询返回；质检合格后才自动启用。已有的人工停用题即使 AI 判断合格也维持停用，必须由管理员明确恢复，避免模型覆盖人工决策。

该模型保证：

1. AI 新题未经质检不会进入学生练习。
2. 管理员修题或停用后，后续新建作答立即读取正确状态，无需再执行发布步骤。
3. 学生端只读取当前同步快照，D1 未迁移或未导入时返回明确错误。
4. 初始化脚本使用 `INSERT OR IGNORE`，重复运行不会覆盖后台维护结果。
5. 考试与复习会话保存完整题面和题库版本；修题只影响后续新建作答。
6. 反馈绑定学生当时看到的历史题面；对应题目被编辑或启停后自动归档。
7. Workflow 每批写入都有 `(task_id, batch_key)` 幂等记录，自动重试不会重复插题或重复推进修订。

Console 顶部的“全部题目、正常使用、已停用、待处理反馈”都是可点击筛选入口。年级、学期、难度和题型保留为必要条件，空值统一显示“全部”，不再提供重复的状态下拉。内部修订号不作为运营者指标；页面明确提示修改会自动同步到学生题库。

## 三、鉴权与安全

URL 参数、隐藏导航或直接访问路由都不作为权限判断。

管理员流程：

1. 浏览器从 `/console?pw=MMDD` 读取上海时区当天口令并立即清除 URL 参数，再向 `POST /api/admin/session` 提交。
2. Worker 对登录接口执行独立限流，并用固定长度哈希比较密钥。
3. 验证通过后签发最长 8 小时的 HMAC 会话，保存为 HttpOnly、SameSite=Strict Cookie。
4. 管理接口在 Worker 端验证会话；写接口另外执行同源校验。
5. 浏览器不把管理员密钥或会话写入 `localStorage`。

`ADMIN_SESSION_SECRET` 至少 24 个字符，仅用于签名会话，生产环境只能放在 Worker Secret，不能进入 Wrangler vars、源码、日志或截图。当天 `MMDD` 是简易个人维护入口，不用于多管理员权限管理。

## 四、已实现接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/questions` | 返回已发布且启用的题目、版本号与 ETag |
| `GET` | `/api/questions/:id` | 返回单道已发布题目 |
| `POST` | `/api/questions/:id/report` | 提交绑定发布版本的题目反馈 |
| `POST` | `/api/admin/session` | 管理员登录 |
| `GET` | `/api/admin/session` | 检查当前会话 |
| `DELETE` | `/api/admin/session` | 清除当前会话 |
| `GET` | `/api/admin/questions` | 分页、搜索、筛选草稿题库 |
| `PATCH` | `/api/admin/questions/:id` | 编辑题目与质量状态 |
| `POST` | `/api/admin/questions/batch-status` | 批量启停，单次最多 100 道 |
| `GET` | `/api/admin/question-reports` | 读取单题待处理反馈与历史题面 |
| `POST` | `/api/admin/question-reports/dismiss` | 忽略无效反馈并写入审计 |
| `POST` | `/api/admin/question-tasks` | 启动生成或质检任务 |
| `GET` | `/api/admin/question-tasks` | 读取最近任务 |
| `GET` | `/api/admin/question-tasks/:id` | 读取任务进度、统计和事件 |
| `POST` | `/api/admin/question-tasks/:id/stop` | 停止运行中的任务 |

接口错误保持统一结构：

```json
{
  "error": { "code": "BAD_REQUEST", "message": "禁用题目时必须填写质量原因" },
  "traceId": "..."
}
```

## 五、题目字段与校验

后台沿用真实 `Question` 契约，不引入重复的禁用原因字段：

- `checkMessage`：题目质量问题或禁用原因。
- `blank_types`：与 `blanks` 一一对应，可选 `number`、`choice`、`text`。
- `choices` 与 `correctChoice`：选择题或综合题的选项和正确标签。
- `enable`：`false` 时不会进入学生端已发布可用题目。

服务端会再次校验题型与答案结构。例如选择题必须存在选项和有效正确标签；填空题必须至少有一个答案；禁用题必须有质量原因。前端校验只是体验优化，不能替代 Worker 校验。

## 六、初始化与维护

本地首次使用：

```bash
pnpm db:migrate:local
pnpm db:seed:local
pnpm dev
```

维护者生产环境：

```bash
pnpm db:migrate:production
pnpm db:seed:production
pnpm exec wrangler secret bulk .env --env production
```

`scripts/seedQuestionBank.ts` 从非公开的 `data/questions.seed.json` 计算 SHA-256，生成被 Git 忽略的 `.wrangler/question-bank-seed.sql`。生成器把 SQL 控制在本地与远端 D1 都可执行的安全长度内，并记录题量、启用量和来源哈希。

修改 D1 binding 后必须运行 `pnpm cf-typegen`；新增 schema 变更必须创建新迁移，禁止直接修改已应用迁移。

## 七、当前不包含

- 删除题目；先通过禁用保留审计与历史引用。
- 多管理员、角色权限和组织级内容隔离。
- 历史发布版本的一键回滚；当前已保留完整版本题面，但尚未提供回滚操作。
- 题库图片资产；未来图片应放 R2，D1 仅保存引用和元数据。
- 考试、复习与预习 Session 云端持久化；这些状态目前仍在浏览器本地。
