# 部署指南

本文定义基于 Docker Compose 的单机部署方式，适用于内部演示和二次开发环境。真实用户上线前仍需完成[安全模型](security.md)中的供应商、账号和运营验收。

候选提交可先通过 GitHub Actions 的 **Container verification** 手动工作流完成镜像构建和全栈冒烟；验证范围见[测试指南](testing.md)。该工作流不替代目标服务器的访问控制、备份和恢复验收。

## 服务组成

| 服务       | 职责                                | 默认主机访问     |
| ---------- | ----------------------------------- | ---------------- |
| `postgres` | PostgreSQL 14 与持久卷              | 不发布端口       |
| `migrate`  | 执行 `prisma migrate deploy` 后退出 | 无               |
| `api`      | NestJS API                          | `127.0.0.1:3001` |
| `worker`   | 邀请到期和后台任务                  | 不发布端口       |
| `web`      | Next.js 与同源 API 反向代理         | `127.0.0.1:3000` |

API 和 Web 默认仅绑定回环地址。局域网或公网访问应通过 SSH 隧道或受控 HTTPS 反向代理，不要直接把容器端口开放到所有接口。

## 环境要求

- 64 位 Linux 服务器，或支持 Docker 的本地开发机
- Docker Engine 与 Compose v2
- 建议至少 2 vCPU、4 GB 内存和 20 GB 可用磁盘
- 可选：域名和 HTTPS 反向代理

## 首次部署

### 1. 获取代码和配置

```bash
git clone https://github.com/Zhe-SH-CN/entropy-tutor-mvp.git
cd entropy-tutor-mvp
cp .env.example .env
```

### 2. 配置环境变量

替换 `.env` 中所有 `replace-with-*` 值。独立随机秘密可用以下方式生成：

```bash
openssl rand -hex 32
```

| 变量                     | 用途           | 部署要求                                               |
| ------------------------ | -------------- | ------------------------------------------------------ |
| `POSTGRES_USER`          | 容器数据库角色 | 使用独立应用角色名                                     |
| `POSTGRES_PASSWORD`      | 容器数据库密码 | 高熵随机值，建议仅使用 URL 安全字符                    |
| `POSTGRES_DB`            | 数据库名称     | 默认 `entropy_tutor`                                   |
| `APP_ORIGIN`             | 浏览器访问来源 | 本机为 `http://localhost:3000`；HTTPS 部署使用正式来源 |
| `SESSION_SECRET`         | 会话保护       | 至少 32 字符，使用独立随机值                           |
| `BYOK_MASTER_KEY`        | BYOK 加密      | 32 字节随机十六进制，共 64 个字符                      |
| `PAYMENT_WEBHOOK_SECRET` | 沙箱回调验签   | 至少 32 字符，使用独立随机值                           |
| `COOKIE_SECURE`          | Secure Cookie  | 本机 HTTP 为 `false`；HTTPS 必须为 `true`              |
| `AI_MODE`                | 模型模式       | 默认 `mock`                                            |
| `DEMO_SEED`              | Seed 开关      | 保持 `false`，仅初始化命令显式开启                     |

`DATABASE_URL` 用于本地非容器开发。Compose 会根据 `POSTGRES_*` 变量生成容器内连接串。

`.env` 包含秘密，不得提交 Git 或上传到公开渠道。

### 3. 构建并启动

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

> **破坏性操作：** Seed 会清空并重建 Demo 数据。升级和日常重启不得执行 Seed。

### 5. 验证

```bash
curl --fail http://127.0.0.1:3001/api/v1/health
curl --fail --head http://127.0.0.1:3000/server-demo
docker compose ps
```

应用入口为 `http://localhost:3000/server-demo`，OpenAPI 为 `http://localhost:3001/api/docs`。

## SSH 隧道访问

当 Web 仅绑定服务器回环地址时，可在访问端建立隧道：

```bash
ssh -N -L 3000:127.0.0.1:3000 <user>@<server>
```

随后访问 `http://localhost:3000/server-demo`。此方式不需要向公网开放 3000、3001 或 5432。

## HTTPS 反向代理

使用 Caddy 时，可将内部域名反代到 Web：

```caddyfile
tutor.internal.example {
    reverse_proxy 127.0.0.1:3000
}
```

同步修改 `.env`：

```dotenv
APP_ORIGIN=https://tutor.internal.example
COOKIE_SECURE=true
```

重建受配置影响的容器：

```bash
docker compose up -d
```

只开放 SSH 和 HTTPS 所需端口。统一演示密码仍然有效，因此 HTTPS 之外还必须配置内网限制、IP allowlist 或身份访问代理。

## 日常运维

### 查看状态和日志

```bash
docker compose ps
docker compose logs --since=1h api worker web
```

### 停止与恢复

```bash
docker compose stop
docker compose start
```

`docker compose down` 停止并删除容器，但保留 PostgreSQL 命名卷。除非明确需要永久删除全部 Demo 数据，不要使用 `docker compose down -v`。

### 升级

```bash
git pull --ff-only
docker compose up --build -d
docker compose ps
```

迁移任务会执行尚未应用的数据库迁移。升级前必须备份，升级过程不得执行 Seed。

## 备份与恢复

### 备份

```bash
mkdir -p backups
docker compose exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  > "backups/entropy_tutor_$(date +%Y%m%d_%H%M%S).sql"
chmod 600 backups/*.sql
```

备份包含业务数据，应按敏感文件管理并定期执行恢复演练。

### 恢复到独立数据库验证

```bash
docker compose exec -T postgres \
  sh -c 'createdb -U "$POSTGRES_USER" entropy_tutor_restore'

docker compose exec -T postgres \
  sh -c 'psql -U "$POSTGRES_USER" -d entropy_tutor_restore' \
  < backups/<backup-file>.sql
```

验证恢复库后再制定正式切换步骤。不要在未备份的情况下覆盖现有数据库。

## 回滚

代码回滚和数据库回滚必须分别评估：

1. 停止 Web、API 和 Worker 写入。
2. 确认当前迁移是否兼容旧代码。
3. 不兼容时，从升级前备份恢复到独立数据库并完成验证。
4. 部署目标提交并重新执行健康检查和主链冒烟。

仅切换到旧 Git 提交不能撤销不兼容的数据库迁移。

## 上线前检查

- 所有占位秘密均已替换，`.env` 权限受控。
- 演示账号不会被真实用户使用，真实账号开通流程已建立。
- HTTPS、Secure Cookie、访问控制和防火墙生效。
- PostgreSQL 不公开端口，应用数据库权限最小化。
- 备份、恢复和升级回滚已演练。
- 真实模型、支付、退款和会议供应商已分别验收。
- 日志、监控、配额和异常告警已配置。
