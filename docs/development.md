# 开发指南

## 环境要求

- Node.js 22
- pnpm 11.7
- PostgreSQL 14+
- Git
- Chromium（仅浏览器测试需要）

## 首次安装

```bash
git clone https://github.com/Zhe-SH-CN/entropy-tutor-mvp.git
cd entropy-tutor-mvp
pnpm install --frozen-lockfile
cp .env.example .env
```

编辑 `.env`，至少确认数据库连接和开发秘密。`.env` 已被 Git 忽略。

本地开发可创建独立角色和数据库：

```sql
CREATE ROLE mvp LOGIN CREATEDB PASSWORD 'mvp';
CREATE DATABASE entropy_tutor OWNER mvp;
CREATE DATABASE entropy_tutor_test OWNER mvp;
```

上述凭据仅适用于隔离的本地开发环境，不得用于共享或生产部署。`CREATEDB` 用于 Prisma 开发迁移的 shadow database。

## 初始化与启动

```bash
pnpm prisma:generate
pnpm exec prisma migrate deploy --schema prisma/schema.prisma
DATABASE_URL=postgresql://mvp:mvp@127.0.0.1:5432/entropy_tutor_test \
  pnpm exec prisma migrate deploy --schema prisma/schema.prisma
DEMO_SEED=true pnpm seed
pnpm dev
```

另开终端启动 Worker：

```bash
pnpm --filter @mvp/api worker:dev
```

入口：

- 全栈应用：`http://localhost:3000/server-demo`
- OpenAPI：`http://localhost:3001/api/docs`
- 健康检查：`http://localhost:3001/api/v1/health`

`/`、`/parent`、`/teacher` 和 `/ops` 是早期 localStorage 界面切片；业务开发以 `/server-demo` 和真实 API 为准。

## 常用命令

| 命令                                | 用途                             |
| ----------------------------------- | -------------------------------- |
| `pnpm dev`                          | 并行启动 Web 与 API 开发进程     |
| `pnpm --filter @mvp/api worker:dev` | 启动 Worker 监视进程             |
| `pnpm build`                        | 构建所有包                       |
| `pnpm typecheck`                    | 构建 shared 并执行类型检查       |
| `pnpm lint`                         | 执行全仓 ESLint                  |
| `pnpm test`                         | 执行规则与 API 测试              |
| `pnpm test:e2e`                     | 重建合成主库并执行 Chromium 测试 |
| `pnpm prisma:generate`              | 生成 Prisma Client               |
| `pnpm prisma:migrate`               | 在开发环境创建并应用迁移         |

## 数据模型变更

1. 修改 `prisma/schema.prisma`。
2. 确认公开 API、事件和既有数据的兼容策略。
3. 使用 `pnpm prisma:migrate` 生成新迁移。
4. 检查生成的 SQL，必要时补充数据迁移和约束。
5. 通过真实 API 或 Worker 入口验证成功与失败路径。
6. 在其他环境仅使用 `prisma migrate deploy`，不要执行开发迁移命令。

不得修改已经部署的迁移文件。

## 合成数据

`prisma/seed.ts` 创建四名合成教师、一个已确认需求和三个演示账号，其中一名教师处于待审核状态。

Seed 会清空并重建 Demo 表，只有显式设置 `DEMO_SEED=true` 才会执行：

```bash
DEMO_SEED=true pnpm seed
```

不得向 Seed 添加真实个人资料，也不得在包含重要数据的数据库中运行。

## 代码组织

- 新页面行为接入 `apps/web/src/app/server-demo` 的真实 API 流程，不新增静态占位按钮。
- 新业务规则优先复用现有 NestJS 模块和 Prisma 事务边界。
- 推荐公式与共享输入合同只在 `packages/shared` 维护。
- 新事件先更新[事件字典](event-dictionary.md)，再实现调用点和验证。
- 外部供应商通过适配器接入，不把 Sandbox 成功描述为真实外部履约。

## 提交前检查

按改动范围执行[测试指南](testing.md)，并遵循[贡献指南](../CONTRIBUTING.md)中的安全与隐私约束。
