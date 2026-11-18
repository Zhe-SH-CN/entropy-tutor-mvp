# 熵曦 AI 原生家教平台 · 内部 MVP

普通家教平台底座 + 大学生教师 AI 工作台 + 可解释的双向推荐。当前仓库用于创始团队内部交流、合成数据演示和二次开发，**不是已经接入真实家庭、真实扣款或生产模型的线上产品**。

## 已实现的内部 Demo

- 家长：创建需求 → Mock 结构化 → 家长确认 → Top 3 → 真实候选曝光 → 邀请 → 双方见面 → 沙箱订单 → 课次确认 → 报告已读 → 继续/暂停/换老师。
- 教师：审核状态与可用性、接受/拒单、见面异常、关系备课卡、记课、学习状态与课后报告的教师审核、Mock/托管/OpenAI 兼容 BYOK 模型网关。
- 运营：教师审核/暂停、人工改派、AI 输出质量评审、30 日成熟 cohort、探索配额、异常队列、规则回放和事件审计。
- 推荐：`40P + 20E + 20R + 20C - 10B - 10L² + X`，保存输入快照、评分明细和规则选项；履约确认后重算可信教师聚合特征。
- 工程：Argon2id、HttpOnly 随机会话、CSRF、角色和资源级授权、PostgreSQL 事务、订单/支付回调幂等、后台任务重试与死信、BYOK AES-256-GCM 与 URL 访问控制。

详细边界见 [`docs/prd-coverage.md`](docs/prd-coverage.md)、[`docs/event-dictionary.md`](docs/event-dictionary.md) 和 [`docs/security-review-c.md`](docs/security-review-c.md)。

## Monorepo 结构

```text
apps/
  web/                 Next.js / React 三角色界面
  api/                 NestJS API、 worker、集成测试
packages/
  shared/              需求合同、推荐规则及 13 个规则测试
prisma/
  schema.prisma        数据模型
  migrations/          可重复 deploy 的迁移
  seed.ts              全合成数据；运行会重置 Demo 数据
tests/e2e/             Chromium 端到端测试
docs/                  ADR、行为合同、安全审查、覆盖矩阵和截图
infra/                 早期容器草稿；本轮未验证，不是当前交付前提
```

技术栈：TypeScript、pnpm workspace、Next.js 16、React 19、NestJS 11、Prisma 6、PostgreSQL 14+、Vitest/Jest/Playwright。选择依据见 [`docs/ADR-001-tech-stack.md`](docs/ADR-001-tech-stack.md)。

## 在自己的电脑或服务器启动

### 1. 准备环境

- Node.js 22（当前实测 `22.23.4`）
- pnpm 11.7（可用 `corepack enable && corepack prepare pnpm@11.7.0 --activate`）
- PostgreSQL 14+（当前实测 14.24）
- Git

只需要 Node 与 PostgreSQL；不需要复制云主机，也不需要把现有数据库文件搬走。代码、迁移和合成种子都在仓库里。

### 2. 克隆与安装

```bash
git clone https://github.com/Zhe-SH-CN/entropy-tutor-mvp.git
cd entropy-tutor-mvp
pnpm install --frozen-lockfile
cp .env.example .env
```

编辑 `.env`：本地可保留 `DATABASE_URL` 和 `AI_MODE=mock`，但必须替换 `SESSION_SECRET`、`BYOK_MASTER_KEY`、`PAYMENT_WEBHOOK_SECRET`。可用 `openssl rand -hex 32` 分别生成。`.env` 已被 Git 忽略，禁止提交真实密钥。

### 3. 创建本地合成数据库

以下 SQL 仅用于本地 Demo；`mvp/mvp` 和 `CREATEDB` 不得沿用到生产：

```sql
CREATE ROLE mvp LOGIN CREATEDB PASSWORD 'mvp';
CREATE DATABASE entropy_tutor OWNER mvp;
CREATE DATABASE entropy_tutor_test OWNER mvp;
```

应用迁移并生成客户端：

```bash
pnpm prisma:generate
pnpm exec prisma migrate deploy --schema prisma/schema.prisma
DATABASE_URL=postgresql://mvp:mvp@127.0.0.1:5432/entropy_tutor_test \
  pnpm exec prisma migrate deploy --schema prisma/schema.prisma
```

### 4. 初始化合成数据并启动

> 警告：`seed` 会清空并重建 Demo 表。不要对任何含真实数据的数据库执行。

```bash
DEMO_SEED=true pnpm seed
pnpm dev
```

另开终端启动后台 worker，处理邀请过期和任务重试：

```bash
pnpm --filter @mvp/api worker:dev
```

访问：

- 本地切片演示：`http://localhost:3000/`
- **真实全栈入口**：`http://localhost:3000/server-demo`
- OpenAPI：`http://localhost:3001/api/docs`
- 健康检查：`http://localhost:3001/api/v1/health`

浏览器只访问 Web 的 `/api/v1`，Next.js 服务端通过 `API_ORIGIN` 转发到 NestJS；不要把本机 API 地址写进前端代码。

### 5. 合成账号

统一密码：`DemoPass123!`

| 角色 | 邮箱 |
|---|---|
| 家长 | `parent@demo.test` |
| 教师 | `teacher@demo.test` |
| 运营 | `ops@demo.test` |

四名教师档案均为合成数据，其中一名初始待审核。支付和会议是沙箱，不发生真实扣款，也不创建真实会议。

## 验证

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm audit --prod
```

浏览器测试：

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

`pnpm test` 会重置独立测试库 `entropy_tutor_test`；`pnpm test:e2e` 会重置主 Demo 库。两者都不得指向真实数据库。

本轮验收目标：共享推荐规则 13 项、API 6 项、Chromium 8 项，外加全仓 typecheck/lint/build。最终实际结果以 [`docs/security-review-c.md`](docs/security-review-c.md) 为准，不把历史通过记录自动延伸到后续改动。

## 二次开发规则

1. 新功能先读 PRD、行为合同和相邻实现；页面按钮必须连接真实 API，不能只做静态占位。
2. 修改数据模型时新增 Prisma 迁移，不改已经部署的历史迁移：本地用 `pnpm prisma:migrate`，其他环境用 `prisma migrate deploy`。
3. 推荐规则只在 `packages/shared` 修改；必须保留输入快照、规则版本、探索配额和回放测试，不能用 LLM 主观评分直接排序教师。
4. 所有 AI 内容先存草稿，教师确认后才对家长生效；原始草稿和教师修改均保留。
5. 事件只保存状态、版本、计数和引用；不得写入电话、详细地址、证件原文、支付敏感信息、AI 全文或自由文本评论。
6. 权限、持久写、支付回调、worker 和异步 UI 改动必须补真实入口测试；每次功能完成后执行安全审查。
7. 不提交 `.env`、真实附件、真实家庭/教师个人信息、测试截图中的敏感信息或生产转储。

## 协作流程

```bash
git checkout -b feat/<简短功能名>
# 修改并完成上述验证
git add -A
git commit -m "feat: <变更说明>"
git push -u origin feat/<简短功能名>
```

通过 Pull Request 二次开发。本轮按用户要求不创建 GitHub Workflow；协作者需在本地执行上述检查。

## 尚未完成、不能误称完成的事项

- 真实托管模型的密钥、预算、内容质量和故障恢复未做供应商验收；默认使用 Mock。
- 支付、退款和视频会议仍为沙箱；未发生真实交易。
- 未进行真实教师/家庭试点；合成履约数据不能证明付费、续课或学习效果。
- 当前没有为你的正式服务器部署公开 URL，也没有验证容器或 PostgreSQL 17；`infra/` 仅为早期草稿。
- 正式环境需要 HTTPS、Secure Cookie、独立强密钥、最小数据库权限、备份恢复、日志与监控，不能用本地弱口令上线。
