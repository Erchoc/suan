# 家长账号与国内登录设计

> 状态：代码已实现；短信与微信是否对普通用户开放，取决于生产 Worker Secret 和服务商资质是否配置完整。

## 一、产品边界

家长账号提供两种入口：手机端优先手机号短信验证码，桌面端提供微信开放平台网站扫码。手机号登录后可在已登录状态下显式扫码，把微信身份绑定到同一个用户主体；不会把题库 Console 管理员会话复用成普通用户权限。

本阶段只建立家长身份和服务端登录会话。考试、复习、预习仍保存在浏览器本地；登录不会自动上传旧记录，也不承诺跨设备同步。孩子档案、监护关系和学习数据同步需要单独设计用户授权、离线迁移与冲突处理。

## 二、D1 数据模型

| 表 | 用途 |
| --- | --- |
| `users` | 稳定用户主体与账号状态 |
| `user_identities` | 手机号或微信身份；同一用户可绑定多种提供方 |
| `auth_sms_codes` | 短信 challenge、验证码摘要、有效期与尝试次数 |
| `user_sessions` | 随机登录令牌摘要、有效期与撤销状态 |
| `auth_oauth_states` | 微信 OAuth 一次性 state、回跳路径与绑定目标 |

验证码原文只在单次发送请求内存在，D1 保存 `USER_AUTH_SECRET` 参与计算的 HMAC-SHA256 摘要。用户 Cookie 中是高熵随机令牌，D1 只保存 SHA-256 摘要。手机号在 API 响应中始终脱敏为尾号。

## 三、安全与限流

- 认证接口继续使用同源 `/api/*`，浏览器不接触腾讯云或微信密钥。
- 短信发送和校验共用独立 `AUTH_RATE_LIMITER`；边缘优先按连接 IP，本地回退客户端 UUID。
- 同一手机号 60 秒内不能重复发送，24 小时最多成功受理 10 次。
- 验证码 5 分钟有效、最多尝试 5 次，并通过条件更新保证只消费一次。
- 用户会话最长 30 天；Cookie 为 HttpOnly、SameSite=Lax，HTTPS 环境增加 Secure。
- 微信 state 10 分钟有效并且只能消费一次；`returnTo` 只接受本站相对路径。
- 日志不记录手机号、验证码、登录令牌、微信 access token、openid、unionid 或任何服务商密钥。

## 四、服务商配置

手机号登录使用腾讯云短信 `2021-01-11` SendSms API，当前模板只传一个参数：六位验证码。上线前需开通短信服务，完成签名与模板审核并购买套餐。参考[腾讯云短信 Node.js 接入文档](https://cloud.tencent.com/document/product/382/43197)与[SendSms API](https://cloud.tencent.com/document/api/382/55981)。

微信扫码使用微信开放平台“网站应用微信登录”。上线前需创建并审核网站应用，配置授权回调域，保存 AppID 与 AppSecret。参考[微信开放平台网站应用登录文档](https://developers.weixin.qq.com/doc/oplatform/Website_App/WeChat_Login/Wechat_Login.html)。

| Worker Secret / 配置 | 说明 |
| --- | --- |
| `USER_AUTH_SECRET` | 至少 32 个随机字符；保护验证码摘要 |
| `TENCENT_SMS_SECRET_ID` | 腾讯云 API SecretId |
| `TENCENT_SMS_SECRET_KEY` | 腾讯云 API SecretKey |
| `TENCENT_SMS_SDK_APP_ID` | 短信应用 ID |
| `TENCENT_SMS_SIGN_NAME` | 审核通过的短信签名 |
| `TENCENT_SMS_TEMPLATE_ID` | 审核通过的单参数验证码模板 |
| `TENCENT_SMS_REGION` | 可选，默认 `ap-guangzhou` |
| `WECHAT_APP_ID` | 微信开放平台网站应用 AppID |
| `WECHAT_APP_SECRET` | 微信开放平台网站应用 AppSecret |

`GET /api/auth/config` 只判断每组配置是否完整。至少一种登录方式可用时，前端才显示“家长账号”入口；没有配置的开源或生产环境不会给普通用户展示不可用入口。

## 五、接口

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `GET` | `/api/auth/config` | 查询可用登录方式 |
| `POST` | `/api/auth/sms/send` | 发送手机号验证码 |
| `POST` | `/api/auth/sms/verify` | 校验验证码并登录 |
| `GET` | `/api/auth/session` | 读取当前家长会话 |
| `DELETE` | `/api/auth/session` | 撤销当前家长会话 |
| `GET` | `/api/auth/wechat/start` | 发起微信扫码或绑定 |
| `GET` | `/api/auth/wechat/callback` | 完成微信回调并签发会话 |

错误继续使用统一结构 `{ error: { code, message }, traceId }`。服务商未配置返回 `AUTH_NOT_CONFIGURED`，短信或微信上游正文不会透传给浏览器。
