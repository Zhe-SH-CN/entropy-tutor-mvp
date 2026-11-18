# 服务器部署与 Docker / Workflow 研判

本文回答两个不同问题：如何现在把内部 Demo 放到自己的服务器，以及后续如何用 Docker 和 GitHub Actions 降低维护成本。公开 GitHub 仓库不代表应该把演示服务公开到互联网。

## 先选部署路径

| 路径                               | 当前建议                                   | 适用场景                                           |
| ---------------------------------- | ------------------------------------------ | -------------------------------------------------- |
| Node 22 + PostgreSQL + SSH 隧道    | **现在可用，已按此技术栈实际验证**         | 你和朋友短期内部演示，不开放公网                   |
| Dockerfile + Compose               | **推荐目标形态，但现有文件仍是未验证草稿** | 单机长期运行、统一依赖、简化迁移和重启             |
| GitHub Workflow CI                 | 推荐下一步实施                             | PR 自动跑规则、API、构建和浏览器测试               |
| Workflow 自动部署 CD               | 暂缓                                       | 需要服务器 SSH、域名、秘密管理、回滚和备份均已确定 |
| Kubernetes / 微服务 / 独立推荐服务 | 当前不做                                   | 没有吞吐量或团队规模依据                           |

**不需要复制云电脑，也不需要手工同步一堆全局依赖。** 目标服务器只需要代码、锁文件、`.env`、数据库迁移和合成种子。Docker 的价值是把 Node、pnpm、PostgreSQL 和三个进程封装成可重复环境，而不是增加一套必须学习的基础设施。

以下命令来自当前已验证的本地运行方式，但你的服务器主机、操作系统和 SSH 账号尚未提供，因此**尚未完成新服务器实机部署验证**。

## 路径 A：现在用 Node + PostgreSQL 做内部演示

### 服务器前提

建议 Ubuntu 22.04/24.04，至少 2 vCPU、4GB 内存、20GB 磁盘。Node 22、pnpm 11.7、PostgreSQL 14+；当前实测是 Node 22.23.4、pnpm 11.7.0、PostgreSQL 14.24。其他 PostgreSQL 版本需要先跑测试。

安全组/防火墙只开放 SSH；如后续启用 HTTPS，再开放 443。不要对公网开放 3000、3001、5432。

### 1. 安装和克隆

Node 可使用发行版可信的 NodeSource 安装脚本；执行前先检查下载内容：

```bash
curl -fsSLo /tmp/nodesource_setup.sh https://deb.nodesource.com/setup_22.x
less /tmp/nodesource_setup.sh
sudo -E bash /tmp/nodesource_setup.sh
sudo apt-get install -y nodejs postgresql
node --version
corepack enable
corepack prepare pnpm@11.7.0 --activate

git clone https://github.com/Zhe-SH-CN/entropy-tutor-mvp.git
cd entropy-tutor-mvp
pnpm install --frozen-lockfile
cp .env.example .env
```

### 2. 创建独立数据库账号

用强随机密码替换示例，不要继续使用 `mvp/mvp`，不要给应用账号 `CREATEDB`。密码写入 `DATABASE_URL` 前需要做 URL 编码。

```sql
CREATE ROLE entropy_app LOGIN PASSWORD '替换为独立强随机密码';
CREATE DATABASE entropy_tutor OWNER entropy_app;
```

本地开发迁移曾使用带 CREATEDB 的 `mvp` 角色；服务器不要照搬。

### 3. 配置服务器 `.env`

仅 SSH 隧道演示时使用：

```dotenv
NODE_ENV=production
DATABASE_URL=postgresql://entropy_app:URL编码后的密码@127.0.0.1:5432/entropy_tutor
APP_ORIGIN=http://localhost:3000
API_ORIGIN=http://127.0.0.1:3001
API_PORT=3001
SESSION_SECRET=替换为openssl生成的64位hex
COOKIE_SECURE=false
AI_MODE=mock
AI_BASE_URL=
AI_API_KEY=
AI_MODEL=
BYOK_MASTER_KEY=替换为另一组64位hex
PAYMENT_WEBHOOK_SECRET=替换为另一组至少32字符随机秘密
DEMO_SEED=false
```

用 `openssl rand -hex 32` 分别生成三组秘密，并只在服务器 `.env` 中保存。不要把生成结果发回聊天或提交 Git。`WEB_PORT` 当前只用于 Compose 主机端口映射，直接运行 Web 时固定为 3000。

### 4. 迁移、一次性种子和构建

```bash
pnpm prisma:generate
pnpm exec prisma migrate deploy --schema prisma/schema.prisma
DEMO_SEED=true pnpm seed
pnpm build
```

`seed` 会清空并重建 Demo 表，只能在全新的合成数据库执行一次。之后保持 `DEMO_SEED=false`，升级时绝不能再次 seed。

### 5. 启动三个进程

临时演示可开三个 tmux/SSH 窗口，分别运行：

```bash
pnpm --filter @mvp/api start
pnpm --filter @mvp/api worker
pnpm --filter @mvp/web start
```

服务器本机检查：

```bash
curl --fail http://127.0.0.1:3001/api/v1/health
curl --fail --head http://127.0.0.1:3000/server-demo
```

你的电脑建立 SSH 隧道：

```bash
ssh -N -L 3000:127.0.0.1:3000 你的用户名@服务器IP
```

然后访问 `http://localhost:3000/server-demo`。朋友也可各自建立隧道；3000/3001 无需对公网开放。长期常驻建议改用已验证的 Compose，而不是一直依赖手工终端。

## 如确实需要域名和 HTTPS

只有在访问控制方案明确后再做。将 `demo.example.com` 解析到服务器，使用 Caddy/Nginx 反代 `127.0.0.1:3000`，开放 443 而继续关闭 3000/3001/5432，并修改：

```dotenv
APP_ORIGIN=https://demo.example.com
COOKIE_SECURE=true
```

API 的 OpenAPI 默认在 API 进程的 `/api/docs`；当前 Web 只反代 `/api/v1`，因此不应假设文档公网可访问。统一演示密码仍然存在，建议至少增加 IP allowlist、身份访问代理或内网限制，不能仅靠 HTTPS 保护演示账号。

## 备份、升级与恢复

备份，不要在升级前 seed：

```bash
sudo install -d -o postgres -g postgres -m 700 /var/lib/postgresql/backups
sudo -u postgres pg_dump --format=custom \
  --file=/var/lib/postgresql/backups/entropy_tutor_$(date +%Y%m%d_%H%M%S).dump entropy_tutor
```

升级：

```bash
cd entropy-tutor-mvp
git pull --ff-only
pnpm install --frozen-lockfile
pnpm prisma:generate
pnpm build
pnpm exec prisma migrate deploy --schema prisma/schema.prisma
# 按所选进程管理方式重启 api、worker、web
```

恢复应先恢复到新数据库做冒烟验证，不直接覆盖现有库：

```bash
sudo -u postgres createdb entropy_tutor_restore
sudo -u postgres pg_restore --dbname=entropy_tutor_restore /var/lib/postgresql/backups/备份文件.dump
```

回滚要同时考虑代码与数据库。仅凭 `git checkout` 旧提交不能撤销不兼容迁移，必要时应恢复升级前备份。

## 路径 B：Docker / Compose 可行性

现有 `infra/Dockerfile` 和 `infra/docker-compose.yml` 已具备 web/api/worker/postgres 的基本结构，但尚未执行过容器构建或冒烟测试，且仍有这些明确缺口：

1. Compose 写的是 PostgreSQL 17，当前实测版本是 14.24，需要先统一或重新验证。
2. 生产镜像复制整个 build 目录，包含开发依赖，镜像偏大；还应以非 root 用户运行。
3. API 启动时自动执行迁移，正式环境应使用独立迁移步骤/角色，避免多副本同时迁移。
4. 需要验证 Prisma 引擎、Argon2 原生依赖、Next standalone/工作区依赖和 worker 信号退出。
5. 需要限制 API 主机端口、设置容器只读文件系统/资源限制，并证明备份卷可用。

**建议保留单仓库多阶段 Dockerfile，Compose 管四个服务；不需要直接复制云电脑，也不需要 Kubernetes。** 但只有在构建、启动、迁移、三角色主链和备份恢复都通过后，才能把 Compose 写成推荐的一键部署命令。

### 这台云电脑能否直接装 Docker

当前检查结果：无 Docker/Podman；有免密 sudo、约 9.7GB 可用磁盘、3.9GB 内存，但 `systemd` 状态为 offline，说明它是沙箱而非标准云服务器。具备尝试安装的基础，不代表 Docker daemon、iptables 和嵌套容器权限一定可用。需要实际安装并运行 `docker info`、构建和容器冒烟后才能下结论；本轮没有把“可能可行”写成“已验证可行”。

## GitHub Workflow 研判

推荐先做两个 GitHub-hosted CI job，不做自动部署：

1. `verify`：PostgreSQL 14 service → Node 22 + pnpm 11.7 → frozen install → Prisma generate/migrate → typecheck/lint → 规则与 API 测试 → build → production audit。
2. `browser`：安装 Chromium 依赖，使用独立合成数据库执行 8 条 Playwright；上传失败 trace 和截图。

约束：workflow 默认 `permissions: contents: read`，只用 `ubuntu` GitHub-hosted runner，不执行不可信 PR 的自托管任务，不注入生产秘密。Docker build job 等 Dockerfile 实际验证后再加；CD 等服务器、SSH、域名和回滚方案确定后再加。
