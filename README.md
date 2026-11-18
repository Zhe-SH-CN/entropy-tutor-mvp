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

## Docker 部署

### 环境要求

- 64 位 Linux 服务器，或支持 Docker 的本地开发机
- Docker Engine 与 Compose v2
- 建议至少 2 vCPU、4 GB 内存和 20 GB 可用磁盘

部署方式：

| 方式         | 适用场景           | 是否需要 Node.js / pnpm | 是否构建镜像 |
| ------------ | ------------------ | ----------------------- | ------------ |
| GHCR 镜像    | 服务器、内部 Demo  | 不需要                  | 不需要       |
| 本地源码构建 | 二次开发、修改代码 | 仅容器部署时不需要      | 需要         |

### 1. 获取代码和配置

Compose 配置、数据库迁移和环境变量模板仍从仓库获取：

```bash
git clone https://github.com/Zhe-SH-CN/entropy-tutor-mvp.git
cd entropy-tutor-mvp
cp .env.example .env
```

### 2. 配置环境变量

替换 `.env` 中所有 `replace-with-*` 值。独立随机秘密可用 `openssl rand -hex 32` 分别生成，不要提交 `.env`。

使用已发布镜像时，将 `.env` 中的 `APP_IMAGE` 改为：

```dotenv
APP_IMAGE=ghcr.io/zhe-sh-cn/entropy-tutor-mvp:latest
```

主要配置：

| 变量                     | 说明                                                        |
| ------------------------ | ----------------------------------------------------------- |
| `APP_IMAGE`              | GHCR 镜像地址，或本地构建使用的 `entropy-tutor-app:local`   |
| `POSTGRES_USER`          | 独立的数据库应用角色                                        |
| `POSTGRES_PASSWORD`      | 高熵随机数据库密码                                          |
| `POSTGRES_DB`            | 数据库名称，默认 `entropy_tutor`                            |
| `APP_ORIGIN`             | 浏览器实际访问来源；SSH 隧道为 `http://localhost:3000`      |
| `SESSION_SECRET`         | 独立的随机会话秘密                                          |
| `BYOK_MASTER_KEY`        | 32 字节随机十六进制，共 64 个字符                           |
| `PAYMENT_WEBHOOK_SECRET` | 独立的沙箱回调验签秘密                                      |
| `COOKIE_SECURE`          | 本机 HTTP 为 `false`；HTTPS 必须为 `true`                   |
| `AI_MODE`                | 默认 `mock`；接入托管模型前阅读[安全模型](docs/security.md) |

`latest` 适用于快速启动内部 Demo，并会随后续手动验收发布移动。需要固定环境或审计回滚时，改用 GHCR 提供的不可变标签：

```dotenv
APP_IMAGE=ghcr.io/zhe-sh-cn/entropy-tutor-mvp:sha-<短提交>
```

镜像包页面：<https://github.com/Zhe-SH-CN/entropy-tutor-mvp/pkgs/container/entropy-tutor-mvp>。如果包设置为私有，服务器需先通过 `docker login ghcr.io --username <github-user>` 完成认证。

### 3A. 使用 GHCR 镜像启动（推荐服务器）

```bash
docker compose pull
docker compose up --no-build -d
docker compose ps
```

该方式不需要在服务器安装 Node.js、pnpm，也不需要执行前端或后端构建。

### 3B. 从源码构建启动

二次开发或修改代码后，保持 `.env` 中：

```dotenv
APP_IMAGE=entropy-tutor-app:local
```

然后执行：

```bash
docker compose up --build -d
docker compose ps
```

启动顺序为 PostgreSQL 健康 → 数据库迁移成功 → API 健康 → Worker 与 Web。查看日志：

```bash
docker compose logs -f api worker web
```

### 4. 初始化合成数据

仅在全新的 Demo 数据库中执行一次：

```bash
docker compose run --rm -e DEMO_SEED=true migrate pnpm seed
```

> **破坏性操作：** Seed 会删除并重建 Demo 数据。不得对包含重要数据的数据库执行；日常重启和升级不得执行 Seed。

### 5. 验证和访问

```bash
curl --fail http://127.0.0.1:3001/api/v1/health
curl --fail --head http://127.0.0.1:3000/server-demo
docker compose ps
```

入口：

- 应用：<http://localhost:3000/server-demo>
- API 健康检查：<http://localhost:3001/api/v1/health>
- OpenAPI：<http://localhost:3001/api/docs>

当 Web 仅绑定服务器回环地址时，在访问端建立 SSH 隧道：

```bash
ssh -N -L 3000:127.0.0.1:3000 <user>@<server>
```

随后访问 `http://localhost:3000/server-demo`。该方式不需要向公网开放 3000、3001 或 5432。

使用 `docker compose down` 停止服务，PostgreSQL 数据保留在命名卷中；不要在需要保留数据时使用 `docker compose down -v`。HTTPS、镜像更新、备份、恢复与回滚见[部署指南](docs/deployment.md)。

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

### 容器验收与镜像发布

GitHub Actions 中的 **Container verification** 工作流可手动构建并验收完整 Compose 环境，包括浏览器主链和持久化检查；不会因 push 自动运行。

1. 打开 **Actions → Container verification → Run workflow**。
2. 保持 `publish_image=true`；仅做验收而不发布镜像时可关闭。
3. 验收通过后，在运行摘要中获取 GHCR 包页面和 `docker pull` 地址。

发布会提供 `latest` 和不可变的 `sha-<短提交>` 标签。服务器部署、镜像认证和固定版本策略见[部署指南](docs/deployment.md#镜像发布与拉取)。

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
