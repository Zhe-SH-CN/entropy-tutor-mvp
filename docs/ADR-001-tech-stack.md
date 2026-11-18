# ADR-001：MVP 技术栈与部署边界

状态：Accepted｜日期：2026-11-17

## 背景与约束

MVP 的主要复杂性是角色权限、关系数据、状态事务、规则回放、AI 异步任务和事件审计，而不是 CPU 密集计算。团队需要一名全栈也能维护的方式，在 A 可点击 Demo、B 真实业务闭环、C 分析部署之间连续演进，避免每阶段重写。

## 决策

- 使用 pnpm workspaces 管理 monorepo。
- 前端使用 Next.js、React、TypeScript，负责家长、教师和运营响应式 Web。
- 后端使用 NestJS、TypeScript、REST/OpenAPI，按业务模块组织模块化单体。
- 使用 Prisma 与 PostgreSQL；事务、唯一约束、JSONB 评分明细和 append-only 事件均由数据库承载。
- 共享包只放稳定的 Schema、规则类型与纯函数，不复制业务状态。
- AI 使用服务端 Model Gateway：明确标识的 Mock、OpenAI 兼容托管提供方、BYOK 三种模式。密钥不进入浏览器、不通过日志输出、不向客户端回显。
- 异步任务优先复用 PostgreSQL，不为首版强制引入 Redis、Kafka 或微服务。
- 测试使用规则单元测试、API/数据库集成测试和 Playwright 端到端测试。
- 保留 Docker Compose 作为目标部署形态；当前环境无 Docker，本地 PostgreSQL 与 Node 进程用于实际验证。`infra/` 在容器构建和冒烟通过前只视为草稿。
- Python 仅用于后续离线分析。Go、Rust、C++、GraphQL、Kubernetes 和独立特征平台不进入首版。

## 备选方案与取舍

- Next.js 全栈单体：文件更少，但前后端信任边界和后台 worker 不如独立 API 清晰，故不采用。
- Go＋React：部署简单、性能好，但共享类型与一人全栈迭代效率较弱，当前无吞吐量依据。
- FastAPI＋React：适合 AI/数据团队，但模型调用只是外部 HTTP 服务，不能抵消双语言与契约重复成本。
- Java/Spring：企业能力强，但对首版小团队偏重。
- Rust/C++：当前瓶颈不是计算性能，开发与审查成本过高。

## 安全边界

- 所有业务授权在 API 服务端执行，前端隐藏按钮不算授权。
- 使用参数化 ORM、严格输入 Schema、HttpOnly/SameSite 会话 Cookie、CSRF 防护、CORS allowlist、Helmet、速率限制和审计日志。
- BYOK Base URL 是 SSRF 边界：仅 HTTPS、禁止私网/环回/链路本地地址、重定向逐跳复核、限制超时与响应大小。
- AI 输出不可信：Schema 校验、教师确认、 escaped 渲染，不进入可执行 HTML 或自动排名。
- 支付仅通过适配器；回调签名校验、事件幂等和订单状态事务必须在真实入口验证。

## 后果

该方案提高首版可维护性与测试效率，但需要维护 Web/API 两个运行时。PostgreSQL 的 SQL 方言与事务必须在真实实例验证；SQLite 或内存替身不能作为等价证明。真实模型、支付与会议供应商在没有凭证时只能提供明确标识的 Mock/Sandbox，不得声称已接通。
