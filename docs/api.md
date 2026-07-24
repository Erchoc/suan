# 接口契约

本文件汇总算道 Worker 对外提供的接口。所有接口同源挂载在 `/api/*`，由 `worker/index.ts` 中的 Hono Worker 处理。契约变更时需同步更新 `worker/index.test.ts`、`src/utils/aiChat.ts` 及相关测试。

## 健康检查

### `GET /api/health`

返回服务、运行时和 AI 配置状态。该接口只报告密钥是否已配置，不会返回密钥内容。

## AI 辅导

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

## 题库与管理

- `GET /api/questions`：读取 D1 当前已发布且启用的题目，返回版本号与 ETag。
- `GET /api/questions/:id`：读取单道已发布题目。
- `POST /api/questions/:id/report`：提交题目问题，绑定会话、发布版本和学生当时看到的题面。
- `POST|GET|DELETE /api/admin/session`：登录、检查和退出管理员会话。
- `GET /api/admin/questions`：分页搜索题库，并按年级、学期、难度、题型、启停状态或待处理反馈筛选。
- `PATCH /api/admin/questions/:id`：编辑题目内容、答案、元数据与质量状态。
- `POST /api/admin/questions/batch-status`：批量启用或禁用，禁用时必须填写质量原因。
- `GET /api/admin/question-reports`、`POST /api/admin/question-reports/dismiss`：查看学生当时的题面或忽略无效反馈。
- `POST /api/admin/question-tasks`：按后台所选参数启动“生成题库”或“AI 质检”Workflow。
- `GET /api/admin/question-tasks`、`GET /api/admin/question-tasks/:id`：读取可恢复的任务进度与运行记录。
- `POST /api/admin/question-tasks/:id/stop`：停止仍在排队或执行中的任务。

后台编辑、启停和质检结果会在同一个 D1 事务中增量同步到 `published_questions`，无需人工发布。AI 生成的新题默认停用并标记为“等待质检”，只有质检合格后才会进入后续新建的学生作答；已有的人工停用题不会被 AI 自动恢复。每次变化都会把该题当时的完整题面写入 `published_question_versions`；考试与复习会话在创建时还会保存完整 `Question[]` 和题库版本，因此后续修题只影响新建作答，既有试卷、判题和做题记录继续使用原题面。

## 家长登录

- `GET /api/auth/config`：只返回手机号、微信两种登录方式是否配置完整，不返回任何凭据。
- `POST /api/auth/sms/send`：校验大陆手机号、边缘限流与每手机号冷却/日上限后，通过腾讯云发送验证码。
- `POST /api/auth/sms/verify`：一次性消费验证码，创建或复用手机号身份并签发用户会话。
- `GET|DELETE /api/auth/session`：读取当前家长身份或撤销当前会话。
- `GET /api/auth/wechat/start`、`GET /api/auth/wechat/callback`：发起微信开放平台网站扫码授权，消费一次性 state，并创建、登录或显式绑定微信身份。

手机号与微信是独立身份，但都归属同一个 `users` 主体；手机号登录后可在当前账号内继续扫码绑定微信。手机号原文只存在于受控身份表，页面仅返回尾号。验证码和登录令牌不会以原文写入 D1。账号入口仅在至少一种服务商配置完整时出现；未配置的开源部署不会向普通用户展示不可用入口。当前考试、复习和预习记录仍在浏览器本地，登录不会自动上传旧记录。

## 安全边界

- 生产环境的 `API_KEY`、`ADMIN_SESSION_SECRET`、登录服务商凭据与 `USER_AUTH_SECRET` 只保存为 Cloudflare Worker Secret，只能由 Worker 读取。
- 本地开发使用已被 Git 忽略的 `.env`；不要提交该文件，也不要把密钥放进 Wrangler vars。
- 浏览器只请求同源 `/api/ai/chat`，不得直接调用配置的 AI 上游，也不得在前端代码、公开环境变量、构建产物或日志中放入密钥。
- AI 环境字段统一为 `BASE_URL`、`API_KEY`、`MODEL` 和 `AI_PROTOCOL`，不兼容 `APIKEY` 或旧的 `AI_API_KEY`、`AI_BASE_URL`、`AI_MODEL` 字段；后台另使用独立 `ADMIN_SESSION_SECRET` 签名会话。
- `AI_PROTOCOL` 支持 `openai-chat`、`openai-coding`、`anthropic`，默认 `openai-chat`。前者使用 Chat Completions，`openai-coding` 使用 Responses，`anthropic` 使用 Messages；Worker 会把不同上游流统一为浏览器现有的 SSE 契约。
- 管理写接口同时校验短时签名会话和同源请求，Console 登录接口单独限流；当天 `MMDD` 是个人维护入口，不适合作为多管理员或公开运营环境的正式权限体系。
- D1 只通过 Worker binding 和 prepared statements 访问。题库编辑、批量操作和 AI 任务批次都保留内部操作记录；后台不暴露冗余的导出、审计或人工发布入口。
- 短信验证码最长 5 分钟、最多尝试 5 次并且只能消费一次；会话 Cookie 为 HttpOnly、Secure（HTTPS）与 SameSite=Lax，D1 只保存令牌 SHA-256 摘要。

手机号登录需要先在[腾讯云短信](https://cloud.tencent.com/document/product/382/43197)开通服务并审核签名、模板；当前适配器使用 `2021-01-11` SendSms 接口，模板参数 1 为验证码。微信扫码需要审核通过的[微信开放平台网站应用](https://developers.weixin.qq.com/doc/oplatform/Website_App/WeChat_Login/Wechat_Login.html)，并把生产回调域配置为当前站点域名。
