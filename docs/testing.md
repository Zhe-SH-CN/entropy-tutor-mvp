# 测试与质量门禁

## 测试分层

| 层级                    | 位置                                         | 验证重点                                               |
| ----------------------- | -------------------------------------------- | ------------------------------------------------------ |
| 规则单元测试            | `packages/shared/src/recommendation.test.ts` | 过滤、评分、冷启动、负载、探索和舍入                   |
| API/PostgreSQL 集成测试 | `apps/api/test/app.e2e.spec.ts`              | 认证授权、事务、并发、状态机、事件、Worker 和运行配置  |
| Chromium 端到端测试     | `tests/e2e/`                                 | 三角色真实浏览器流程、BYOK、曝光、运营评审和响应式布局 |
| 静态与构建检查          | 全仓                                         | TypeScript、ESLint、Next.js/NestJS 构建和依赖审计      |

## 标准检查

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm audit --prod
```

当前测试套件包括：

- 13 项推荐规则测试；
- 6 组 API/PostgreSQL 集成测试；
- 8 项 Chromium 端到端测试。

## 浏览器测试

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

Playwright 使用生产 Next.js 入口和真实 PostgreSQL，不是静态组件快照。失败时检查 `test-results/` 和 `playwright-report/` 中的截图与 trace。

## 手动容器验收

仓库提供 `.github/workflows/container-verification.yml`，只在 GitHub Actions 页面手动选择 **Container verification → Run workflow** 时运行，不因 push 自动触发。

该工作流在隔离的 Linux runner 中：

1. 生成不离开 runner 的随机配置；
2. 构建多阶段 Dockerfile 并启动完整 Compose 服务；
3. 执行数据库迁移和合成数据初始化；
4. 检查 API/Web 健康、非 root 运行用户和数据库端口隔离；
5. 执行 8 项 Chromium 产品流程；
6. 重建容器并验证 PostgreSQL 持久卷中的业务数据保持不变。

日志、Playwright 报告和失败 trace 作为运行产物保留 7 天。工作流只验证候选提交，不发布镜像，也不部署到服务器；CI 数据库卷在结束时删除。

## 数据库副作用

测试具有明确的数据重置行为：

- `pnpm test` 使用并重置 `entropy_tutor_test`。
- `pnpm test:e2e` 使用并重置主 Demo 数据库。
- 两个命令都不得指向包含重要数据的数据库。

API 测试依赖本地开发角色具有创建 Prisma shadow database 的权限。共享或生产环境不应复用该角色配置。

## 改动对应的最小验证

| 改动类型       | 必须覆盖                                       |
| -------------- | ---------------------------------------------- |
| 推荐规则       | 规则单元测试、快照/回放和受影响的 API 测试     |
| 权限或公开 API | 真实 HTTP 入口的成功、拒绝及无副作用证明       |
| 数据模型或事务 | 新迁移、持久状态、冲突与必要的并发验证         |
| Worker 或重试  | 到期条件、领取、重试次数、退避和终态           |
| AI 或 BYOK     | 草稿审核、密钥不回显、SSRF 拒绝和失败降级      |
| 前端异步流程   | 真实入口、忙态、错误恢复和角色切换后的结果归属 |
| 响应式布局     | 桌面与移动视口、溢出、键盘和触控可达性         |
| 容器配置       | 构建、迁移、健康检查、主链冒烟、重启和持久卷   |

## 发布检查

1. 所有受影响的自动化检查通过。
2. 生产依赖审计无未处置的已知漏洞。
3. 危险 HTML 渲染、动态代码执行和敏感日志经过审查。
4. 仓库不包含秘密、真实个人数据或原始调研附件。
5. 文档中的命令、产品能力和实际行为一致。
6. 未执行的供应商或环境验证明确列入发布边界，不以代码存在代替运行证据。

自动化测试不能替代真实模型质量、支付、会议、备份恢复或生产安全验收。
