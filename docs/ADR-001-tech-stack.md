# ADR-001：MVP 技术栈与模块化单体

- 状态：Accepted
- 日期：2026-11-17

## 背景

MVP 的主要复杂性来自角色权限、关系数据、状态事务、规则回放、AI 异步任务和事件审计，而非 CPU 密集计算。团队需要在可点击原型、真实业务闭环和小规模部署之间连续演进，避免不同阶段重写系统。

关键技术目标：

- 一名全栈工程师能够理解和维护完整系统；
- Web、API 与共享包复用类型和验证合同；
- 业务事实、事务和事件具有明确的持久边界；
- 推荐规则保持确定性、可测试和可回放；
- 外部模型、支付和会议通过适配器替换；
- 部署保持单数据库、少量进程和可重复构建。

## 决策

| 范围     | 决策                                                          |
| -------- | ------------------------------------------------------------- |
| 仓库     | pnpm workspaces monorepo                                      |
| 语言     | TypeScript                                                    |
| Web      | Next.js、React，响应式三角色界面                              |
| API      | NestJS、REST、OpenAPI                                         |
| 数据     | Prisma、PostgreSQL、JSONB 评分明细、追加式事件                |
| 共享边界 | `packages/shared` 仅保存稳定合同、规则类型和纯函数            |
| AI       | 服务端 Model Gateway，支持 Mock、OpenAI 兼容托管提供方和 BYOK |
| 后台任务 | 首版复用 PostgreSQL，不强制引入 Redis、Kafka 或独立任务平台   |
| 测试     | 规则单元测试、API/PostgreSQL 集成测试、Playwright 端到端测试  |
| 部署     | 多阶段 Dockerfile 与 Compose，Web/API/Worker 分进程运行       |

Python 仅用于后续离线分析。Go、Rust、C++、GraphQL、Kubernetes 和独立特征平台不进入首版。

## 备选方案

### Next.js 全栈单体

优点是文件与部署单元更少。独立 NestJS API 更清晰地表达服务端信任边界、角色授权和后台 Worker，因此不采用单一 Next.js 服务端承载全部业务。

### Go + React

Go 的部署和性能具有优势，但首版没有吞吐量依据。前后端共享类型和快速迭代对当前阶段更重要。

### FastAPI + React

适合以 Python 为主的 AI/数据团队。模型调用本身只是外部 HTTP 服务，引入第二语言会增加合同、测试和部署成本。

### Java / Spring

企业能力完整，但对小团队 MVP 的工程和运维成本偏高。

### Rust / C++

当前瓶颈不是计算性能，系统主要等待数据库和外部 API。引入系统语言不能改善核心产品风险。

## 安全约束

- 所有业务授权在 API 服务端执行，前端控件不作为授权边界。
- 使用参数化 ORM、严格输入 Schema、HttpOnly/SameSite Cookie、CSRF 防护、CORS allowlist、Helmet 和速率限制。
- BYOK Base URL 属于 SSRF 边界：仅允许 HTTPS 和公网解析地址，逐跳检查重定向，并限制超时和响应大小。
- AI 输出不可信，必须经过 Schema 校验和教师确认，不直接进入教师排名。
- 支付通过适配器隔离；真实供应商接入必须重新验证签名、幂等、回调顺序和退款边界。

## 后果

该方案提高首版可维护性、契约复用和测试效率，同时需要维护 Web、API、Worker 三个进程。PostgreSQL 的事务和 SQL 行为必须通过真实实例验证，SQLite 或内存替身不构成等价证明。

真实模型、支付和会议供应商在未完成供应商验收时只能标记为 Mock 或 Sandbox。容器部署也必须通过构建、迁移、主链、重启和持久卷验证后才能作为标准交付路径。
