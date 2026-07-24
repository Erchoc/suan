# 安全策略

## 上报漏洞

如果你发现算道存在安全漏洞，请**不要**通过公开的 GitHub Issue、Pull Request 或讨论区披露。

请通过 GitHub 的 [私密安全公告（Security Advisory）](https://github.com/Erchoc/suan/security/advisories/new) 私下上报，或联系维护者私下沟通。请在报告中尽量包含：

- 漏洞类型与影响范围
- 复现步骤或概念验证
- 受影响的接口、页面或配置
- 你认为可行的修复建议（可选）

我们会尽快确认收到并评估。修复发布前请为漏洞保密。

## 密钥与凭据

算道对密钥有明确的安全边界，请在贡献时遵守：

- 生产环境的 `API_KEY`、`ADMIN_SESSION_SECRET`、登录服务商凭据与 `USER_AUTH_SECRET` 只保存为 Cloudflare Worker Secret。
- 本地开发使用被 Git 忽略的 `.env`，不要提交该文件，也不要把密钥放进 Wrangler vars、Vite 公开变量、日志、截图或测试快照。
- 浏览器只请求同源 `/api/ai/chat`，不得直接调用配置的 AI 上游。

如果你不慎在提交历史、Issue 或 PR 中泄露了真实密钥，请立即轮换该密钥并通知维护者。

完整的接口安全边界见 [docs/api.md](docs/api.md#安全边界)。
