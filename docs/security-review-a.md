# 阶段 A 功能与安全审查

日期：2026-11-17｜结论：通过阶段 A 门禁；不据此宣称生产安全或真实外部履约。

## 已执行验证

- `rule_v0.2`：13/13 单元测试通过，覆盖 PRD A/B/C 算例与 81.5 舍入、冷启动收缩、硬过滤、空候选、教师唯一、探索配额、时段多样和有效时薪不重复计分。
- 浏览器：5/5 Chromium 测试通过，覆盖跨角色邀请/接受/见面/沙箱首课/记课/教师确认报告/运营事件，空候选、XSS、390px 移动端和 BYOK 本地密钥边界。
- Next.js 生产构建通过；前端与共享包 lint、TypeScript 检查通过。
- `pnpm audit --prod --audit-level=high`：0 个已知漏洞；peer dependency 检查通过。Prisma 间接依赖 `deepmerge-ts` 已固定到修复版本。
- 静态检查：未发现 `dangerouslySetInnerHTML`、`eval`、`new Function`、`document.write` 或直接 `innerHTML` 赋值。
- 敏感信息扫描：未发现手机号或真实 API Key；区域只保留“闵行”等编码。命中的“详细地址/联系方式”均为禁止收集的提示文案。

## 安全判断

- React 默认 escaped 渲染有效，XSS 输入只作为文本出现。
- 所有人物、需求和事件均为合成数据；不导入附件中的个人信息。
- 阶段 A 明确标识浏览器本地状态和本地 Mock，不声称已调用真实模型。
- BYOK 密钥输入禁用，不进入 localStorage；沙箱支付不创建真实扣款。
- 推荐硬过滤先于评分，空候选不伪造结果，教师探索奖励有显式配额。

## 留给阶段 B 的阻断项

认证/RBAC、资源级 IDOR、会话与 CSRF、数据库事务与竞态、append-only 事件持久化、BYOK 加密与 SSRF、真实 OpenAI 兼容适配、支付回调验签/幂等和敏感日志必须在真实 API/PostgreSQL 入口验证。阶段 A 的本地状态检查不能替代这些证明。

## 已知维护提示

ESLint 9 与 Next 插件兼容但上游已标记维护结束，后续应在插件支持 ESLint 10 后统一升级。该项不是当前已知漏洞，不掩盖为维护事项。
