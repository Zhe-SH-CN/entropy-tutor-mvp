# Entropy Tutor · 熵曦家教平台

面向精选大学生教师的 AI 原生家教交付与双向匹配系统。

项目将家教交易平台、标准化教学交付和可解释推荐整合在同一套业务流程中，并把已确认履约转化为后续匹配可复用的行为证据。

> **项目状态：内部功能 Demo。** 支付与视频会议使用沙箱适配器，AI 默认使用 Mock。仓库不包含真实客户、真实交易或生产环境数据，不应直接作为公开生产服务运行。

## 核心能力

- **家长端**：创建并确认需求、比较 Top 3 候选、预约见面、管理沙箱订单、确认课次、查看教师审核后的报告，以及继续、暂停或更换教师。
- **教师端**：维护可授时间与容量、接受或拒绝邀请、处理见面异常、备课、记课、审核 AI 草稿，以及管理模型配置。
- **运营端**：教师准入与暂停、人工改派、AI 输出质量评审、异常处理、推荐回放、cohort 分析和事件审计。
- **双向匹配**：资格硬过滤、七项可解释评分、冷启动先验、负载控制、有限探索、输入快照与规则回放。
- **AI 教学闭环**：生成关系备课卡、学习状态建议和课后报告；教师确认后方可向家长交付。
- **工程控制**：角色与资源级授权、数据库事务、订单及回调幂等、后台任务重试、结构化事件审计和 BYOK 密钥保护。

## 系统架构

```text
Browser
   │ same-origin /api/v1
   ▼
Next.js Web ─────────────► NestJS API ─────► PostgreSQL ◄──── Worker
                              │
                              ▼
                         Model Gateway ─────► Mock / Hosted / BYOK
```

系统采用模块化单体，包含 Web、API、Worker 三个常驻进程和一个 PostgreSQL 数据库。详见[系统架构](docs/architecture.md)。

## Docker 快速启动

### 环境要求

- Docker Engine 与 Compose v2
- 建议至少 4 GB 内存、20 GB 可用磁盘

### 启动服务

```bash
git clone https://github.com/Zhe-SH-CN/entropy-tutor-mvp.git
cd entropy-tutor-mvp
cp .env.example .env
```

替换 `.env` 中所有 `replace-with-*` 配置。可使用 `openssl rand -hex 32` 分别生成独立秘密。

```bash
docker compose up --build -d
docker compose ps
```

仅在全新的合成数据库中初始化一次演示数据：

```bash
docker compose run --rm -e DEMO_SEED=true migrate pnpm seed
```

> **破坏性操作：** Seed 会删除并重建 Demo 数据。不得对包含重要数据的数据库执行。

访问入口：

- 应用：<http://localhost:3000/server-demo>
- API 健康检查：<http://localhost:3001/api/v1/health>
- OpenAPI：<http://localhost:3001/api/docs>

使用 `docker compose down` 停止服务，PostgreSQL 数据保留在命名卷中。HTTPS、升级、备份与恢复见[部署指南](docs/deployment.md)。

## 本地开发

环境要求：Node.js 22、pnpm 11.7、PostgreSQL 14+、Git。

```bash
pnpm install --frozen-lockfile
cp .env.example .env
pnpm prisma:generate
pnpm exec prisma migrate deploy --schema prisma/schema.prisma
DEMO_SEED=true pnpm seed
pnpm dev
```

在另一个终端启动 Worker：

```bash
pnpm --filter @mvp/api worker:dev
```

数据库初始化和常用开发流程见[开发指南](docs/development.md)。

## 演示账号

| 角色 | 邮箱                | 密码           |
| ---- | ------------------- | -------------- |
| 家长 | `parent@demo.test`  | `DemoPass123!` |
| 教师 | `teacher@demo.test` | `DemoPass123!` |
| 运营 | `ops@demo.test`     | `DemoPass123!` |

以上账号为公开合成凭据。任何部署都必须置于访问控制之后，不得作为公开注册服务直接暴露。

## 质量检查

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm audit --prod
pnpm exec playwright install chromium
pnpm test:e2e
```

测试使用合成数据，并重置相应数据库。执行前请阅读[测试指南](docs/testing.md)。

GitHub Actions 中的 **Container verification** 工作流可手动构建并验收完整 Compose 环境，包括浏览器主链和持久化检查；不会因 push 自动运行。

## 仓库结构

```text
apps/
  web/                 Next.js 家长、教师与运营界面
  api/                 NestJS API 与后台 Worker
packages/
  shared/              共享合同与确定性推荐规则
prisma/
  schema.prisma        数据模型
  migrations/          版本化数据库迁移
  seed.ts              合成演示数据
tests/e2e/             Chromium 端到端测试
infra/
  Dockerfile           多阶段容器构建
compose.yaml           Web、API、Worker、迁移与 PostgreSQL 编排
docs/                  架构、开发、部署、测试与领域规范
```

## 文档索引

- [系统架构](docs/architecture.md)
- [开发指南](docs/development.md)
- [部署指南](docs/deployment.md)
- [测试指南](docs/testing.md)
- [安全模型](docs/security.md)
- [产品范围与覆盖](docs/prd-coverage.md)
- [事件字典](docs/event-dictionary.md)
- [技术选型 ADR](docs/ADR-001-tech-stack.md)

## 协作与安全

二次开发流程见 [CONTRIBUTING.md](CONTRIBUTING.md)，漏洞报告与凭据处理见 [SECURITY.md](SECURITY.md)。

## 许可证

采用 [PolyForm Noncommercial 1.0.0](LICENSE.md)。允许查看、修改和非商业使用；商业使用须另行取得权利人许可。该许可证属于源码可见许可证，不是 OSI 认可的开源许可证。第三方依赖仍遵循各自许可证。
