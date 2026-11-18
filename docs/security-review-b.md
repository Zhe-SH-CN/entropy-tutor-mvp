# 阶段 B 功能与安全审查

日期：2026-11-17｜结论：真实全栈 Demo 门禁通过；真实外部供应商能力不在已验证范围内。

## 已验证

- 规则：13/13 单元测试。
- API/PostgreSQL：3/3 集成测试，使用独立 `entropy_tutor_test` 数据库，覆盖多角色主流程、IDOR、无 CSRF 无副作用、会话 token hash、教师审核发布、BYOK SSRF/密钥回显、AES-GCM 篡改失败、订单与回调幂等。
- 并发：6 个同幂等键订单请求收敛到同一订单；6 个同事件 ID 回调只保留一条 PaymentEvent。测试先观察到 4 个 500，再以冲突后重读/重试修复并复验。
- 浏览器：7/7 Chromium 测试，其中阶段 B 两项使用真实 NestJS/PostgreSQL，覆盖三角色跨端流程和恶意 BYOK 地址。
- 生产构建、lint、TypeScript、peer/lockfile 检查通过；生产依赖审计为 0 个已知漏洞。Zod 已升级至 ^4.6.6，修复新披露的集合校验内存公告。
- `.env` 被 Git 忽略；未发现危险 HTML 渲染或密码、API Key、token、secret 的业务日志输出。

## 安全边界

- 会话 Cookie 为 HttpOnly、SameSite=Lax，数据库只存 SHA-256 token hash；写操作校验 CSRF。
- 家长、教师、运营均做资源级授权，不只依赖角色或前端隐藏按钮。
- 邀请、关系、订单、课次与事件使用 PostgreSQL 事务和唯一约束；课次与关系有组合唯一约束。
- BYOK 使用 AES-256-GCM，读取接口只返回 `hasKey`；模型 URL 限制 HTTPS、公网 DNS/IP、10 秒超时、1MB 响应和最多 3 次重定向。
- 未确认 Artifact 不会出现在家长报告查询中；AI 输出不进入教师排序。

## 未验证 / 不上线的能力

- 未提供真实托管模型密钥、预算与供应商，因此 OpenAI 兼容适配器代码已落地，但真实外部调用未验证；当前运行模式为本地 Mock。
- 支付和会议均为沙箱。webhook 验签与幂等已用合成回调验证，不代表真实支付牌照接口、真实扣款或真实会议资源已接通。
- HTTPS、Secure Cookie、生产 Secrets Manager、邮件验证、教师实名材料审核、真实手机号/地址保护和生产备份访问控制仍需部署环境配合。
- 本地 `mvp` 角色为开发迁移临时具有 CREATEDB；生产应使用独立迁移角色，应用角色不保留该权限。
