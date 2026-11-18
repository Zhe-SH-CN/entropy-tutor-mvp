# 事件字典与代码映射 v0.2

来源：在线 PRD《熵曦科技｜AI原生家教平台 MVP PRD v0.2》revision 13，第 8 节。本文是该版本 39 个事件在当前内部 Demo 中的实现对照，不新增第二套产品口径。

## 公共字段

| PRD 字段 | Prisma / API 实现 | 规则 |
|---|---|---|
| `event_id` | `EventLog.id` | 随机 UUID，不可复用 |
| `event_name` | `EventLog.name` | 使用下表 snake_case 名称 |
| `schema_version` | `EventLog.schemaVersion` | 当前 `v0.2` |
| `occurred_at` | `EventLog.occurredAt` | 业务实际发生时间 |
| `received_at` | `EventLog.receivedAt` | 服务端接收时间；迟到事件不覆盖发生时间 |
| `actor_type` | `EventLog.actorType` | `user` / `system` |
| `actor_id` | `EventLog.actorId` | 用户 ID；系统事件可为空 |
| `source` | `EventLog.source` | `client` / `server` / `worker` / `webhook` / `seed` |
| `idempotency_key` | `EventLog.idempotencyKey` | 数据库唯一约束；重复请求不重复写入 |

运营事件接口同时返回 Prisma 字段和上述 canonical 字段。`entityType/entityId` 关联需求、教师、课次、Artifact 等业务对象；properties 统一递归转换为 snake_case。

**隐私边界**：事件 properties 只保存状态、版本、计数和引用，不保存电话、详细地址、证件原文、支付敏感信息、AI 报告全文、教师观察原文或自由文本评论。详细内容留在受控业务表。纠错追加事件，不删除历史。

## 师资、需求与推荐（12）

| event_name | 当前真实触发点 | 关键 properties / 备注 |
|---|---|---|
| `teacher_application_submitted` | 合成待审核教师种子 | `subjects, grade_range, price_band`；公开入驻表单不属于当前 Demo |
| `teacher_review_completed` | 运营审核通过或暂停 | `result, reason_code, reviewer_role` |
| `teacher_availability_updated` | 教师刷新可授时间与容量 | `slot_count, mode, valid_range` |
| `demand_submitted` | 家长创建需求草稿 | `subject, grade, budget_band, mode, slot_count` |
| `demand_structured` | Mock 结构化完成 | `method, unknown_fields, generation_id`；Mock 的 generation_id 为空 |
| `demand_confirmed` | 家长确认结构化结果 | `edited_fields, valid_demand_flag`；这是有效需求起点 |
| `recommendation_requested` | 家长或运营请求推荐 | `trigger_type, rule_version` |
| `recommendation_completed` | 过滤、排序与快照保存完成 | `filter_counts, eligible_count, returned_count, latency_ms` |
| `candidate_exposed` | 浏览器卡片 ≥50% 可见且持续 1 秒 | `rank, final_score, score_version, exploration_bucket`；按 runId + teacherId 幂等，服务端不伪造曝光 |
| `teacher_offer_sent` | 家长发出邀请 | `slot_id, quoted_price, expires_at` |
| `teacher_offer_responded` | 教师接受、拒绝，或系统过期 | `response, reason_code, response_seconds`；过期由 system/worker 记录 `response=expired` |
| `candidate_selected` | 家长选择候选见面 | `rank, final_score, selection_channel`；不改历史推荐快照 |

## 见面、订单与课次（11）

| event_name | 当前真实触发点 | 关键 properties / 备注 |
|---|---|---|
| `meeting_scheduled` | 沙箱见面预约或改期 | `scheduled_start_at, reschedule_count` |
| `meeting_completed` | 双方都选择继续 | `actual_duration_seconds`；同时建立教学关系 |
| `meeting_no_show` | 一方登记见面 no_show | `no_show_party, notice_seconds` |
| `meeting_outcome_submitted` | 任一方提交见面意愿或异常 | `actor_role, continue_intent, reason_code` |
| `order_created` | 幂等沙箱订单创建 | `lesson_count, amount_band, price_per_hour` |
| `payment_status_changed` | 沙箱支付或 HMAC 回调 | `from_status, to_status, verification_method`；webhook 来源独立标识 |
| `lesson_scheduled` | 教师记课并排定时间 | `scheduled_start_at, duration_minutes`；排课冲突键受数据库约束 |
| `lesson_completion_marked` | 教师标记完成 | `marked_at, actual_duration_minutes`；此时尚不计入北极星 |
| `lesson_completion_confirmed` | 家长或运营确认完成 | `confirmed_by_role, same_teacher_sequence, paid_verified`；此后重算同师序号和可信特征 |
| `lesson_cancelled` | 家长、教师或运营取消 | `cancelled_by_role, reason_code, notice_seconds`；不占正式课序号 |
| `lesson_no_show` | 登记课次未到场 | `no_show_party, reason_code`；不占正式课序号 |

## AI、反馈与运营（11）

| event_name | 当前真实触发点 | 关键 properties / 备注 |
|---|---|---|
| `prep_card_generated` | 关系备课卡草稿生成 | `generation_id, model_name, prompt_version, latency_ms` |
| `prep_card_confirmed` | 教师确认备课卡 | `edited_field_count, generation_id`；保留 rawContent |
| `lesson_note_submitted` | 教师提交结构化记课 | `content_tag_count, evidence_count, minutes_after_lesson` |
| `lesson_report_drafted` | AI 或 Mock 报告草稿生成 | `method, generation_id, revision_no` |
| `lesson_report_confirmed` | 教师确认报告 | `edited_field_count, minutes_after_lesson` |
| `lesson_report_sent` | 确认版报告通过站内渠道对家长可见 | `channel, revision_no`；未确认草稿不可见 |
| `parent_report_viewed` | 家长首次标记报告已读 | `minutes_after_sent` |
| `parent_feedback_submitted` | 家长继续、暂停或换老师反馈 | `continue_intent, reason_codes, optional_rating`；评论仅存受控业务表 |
| `manual_match_overridden` | 运营追加人工改派 | `action_type, reason_code, original_rank`；RecommendationRun 不变 |
| `rematch_requested` | 家长或运营发起换老师 | `initiator_role, reason_code, completed_lesson_count`；新草稿关联原需求 |
| `ai_generation_failed` | 模型调用、URL 安全校验或响应合同失败 | `generation_type, error_code, retry_count`；不记录密钥或原始错误敏感内容 |

## 学习状态、反哺与评测（5）

| event_name | 当前真实触发点 | 关键 properties / 备注 |
|---|---|---|
| `learning_state_proposed` | 生成学习状态草稿 | `state_id, knowledge_tag, source_generation_id, proposal_method`；初始 `unverified` |
| `learning_state_confirmed` | 教师确认学习状态 | `state_id, action, evidence_count, edited_flag`；未确认状态不反哺排序 |
| `next_lesson_plan_accepted` | 教师确认关系备课卡 | `based_on_state_count, edited_field_count, previous_lesson_id` |
| `recommendation_feature_updated` | 课次完成确认后重算教师聚合 | `feature_version, source_event_count, computed_at`；当前 `teacher_metrics_v1` |
| `ai_output_reviewed` | 运营完成独立质量评审 | `evaluation_set_version, rubric_version, severe_error_flag, result_code`；与教师内容确认分开 |

## 验证入口

- `apps/api/test/app.e2e.spec.ts`：验证事件公共字段、snake_case properties、曝光幂等、候选选择、课次序号、支付确认、AI 失败、质量评审和特征更新。
- `tests/e2e/stage-b.spec.ts`：真实浏览器滚动候选卡到视口后等待曝光 API，运营页面执行 AI 质量评审并检查事件表。
- 运营界面 `/server-demo` 的“事件字典”读取持久事件，而非前端临时拼接。
