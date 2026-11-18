"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Bot, CalendarClock, Check, CheckCircle2, Clock3, FilePenLine, KeyRound, NotebookPen, ShieldCheck, Sparkles, X } from "lucide-react";
import type { TimeSlot } from "@mvp/shared";
import { AppShell } from "@/components/app-shell";
import { useDemo } from "@/components/demo-provider";
import { Badge, Card, EmptyState, SectionHeading } from "@/components/ui";
import { demoTeachers } from "@/lib/demo-data";
import { moneyLabel, slotLabel } from "@/lib/format";
import type { AIKind } from "@/lib/types";

const aiLabels: Record<AIKind, string> = {
  prep: "下一课备课",
  quiz: "出题与 Rubric",
  report: "家长报告",
  learning_state: "学习状态建议",
};

export default function TeacherPage() {
  const { state } = useDemo();
  const [tab, setTab] = useState<"invitations" | "studio" | "evidence" | "settings">("invitations");
  const teacher = demoTeachers[0]!;

  return (
    <AppShell eyebrow="TEACHER / 教师工作台" title={`${teacher.displayName}，今天从证据开始`} description={`${teacher.school} · ${teacher.education}。邀请、备课、记课与 AI 审核在同一个工作流中完成。`}>
      <div className="grid-3" style={{ marginBottom: 18 }}>
        <div className="metric-card"><span>当前学生 / 容量</span><strong>{teacher.currentLoad}/{teacher.maxCapacity}</strong><small>满负载时将被硬过滤</small></div>
        <div className="metric-card"><span>报价 / 目标毛时薪</span><strong>{moneyLabel(teacher.quotedPriceFen)}</strong><small>目标 {moneyLabel(teacher.targetGrossHourlyFen)}/小时</small></div>
        <div className="metric-card"><span>待响应邀请</span><strong>{Object.values(state.invitations).filter((status) => status === "invited").length}</strong><small>接受前可查看具体时段与收益</small></div>
      </div>
      <div className="tabs" role="tablist" aria-label="教师功能">
        <button type="button" role="tab" aria-selected={tab === "invitations"} className={tab === "invitations" ? "active" : ""} onClick={() => setTab("invitations")}>邀请与可用时间</button>
        <button type="button" role="tab" aria-selected={tab === "studio"} className={tab === "studio" ? "active" : ""} onClick={() => setTab("studio")}>记课与 AI 备课</button>
        <button type="button" role="tab" aria-selected={tab === "evidence"} className={tab === "evidence" ? "active" : ""} onClick={() => setTab("evidence")}>学习证据</button>
        <button type="button" role="tab" aria-selected={tab === "settings"} className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>模型与 BYOK</button>
      </div>
      {tab === "invitations" && <InvitationsAndAvailability />}
      {tab === "studio" && <TeachingStudio />}
      {tab === "evidence" && <LearningEvidence />}
      {tab === "settings" && <ModelSettings />}
    </AppShell>
  );
}

function InvitationsAndAvailability() {
  const { state, respondInvitation, completeMeeting, updateAvailability } = useDemo();
  const teacher = demoTeachers[0]!;
  const currentSlots = state.availabilityOverrides[teacher.id] ?? teacher.availability;
  const [slots, setSlots] = useState<TimeSlot[]>(currentSlots);
  const options: TimeSlot[] = [
    { day: 6, startMinute: 540, endMinute: 660 },
    { day: 2, startMinute: 1140, endMinute: 1260 },
    { day: 6, startMinute: 840, endMinute: 960 },
  ];
  const entries = Object.entries(state.invitations).filter(([teacherId]) => teacherId === teacher.id);

  const toggle = (slot: TimeSlot) => {
    const exists = slots.some((item) => item.day === slot.day && item.startMinute === slot.startMinute);
    setSlots(exists ? slots.filter((item) => !(item.day === slot.day && item.startMinute === slot.startMinute)) : [...slots, slot]);
  };

  return (
    <div className="layout-sidebar">
      <Card>
        <SectionHeading eyebrow="INVITATIONS / 双向选择" title="邀请与免费见面" />
        {entries.length === 0 ? (
          <EmptyState title="暂时没有新邀请" description="请先到家长端为林老师发送邀请。邀请后回到此页即可接受或拒绝。" />
        ) : entries.map(([teacherId, status]) => {
          const candidate = state.recommendation.candidates.find((item) => item.teacherId === teacherId)!;
          const meeting = state.meetings[teacherId];
          return (
            <div key={teacherId}>
              <div className="teacher-meta"><Badge tone="info">{state.demand.subject}</Badge><Badge>{slotLabel(candidate.slot)}</Badge><Badge tone="success">{moneyLabel(candidate.quotedPriceFen)}/小时</Badge><Badge>预计有效时薪 {moneyLabel(candidate.effectiveHourlyFen)}</Badge></div>
              <p className="small muted">家庭目标：{state.demand.objectives.join("、")}。线下区域仅显示到“{state.demand.areaCode}”，没有详细地址。</p>
              <div className="button-row">
                {status === "invited" && <><button className="button button-primary" type="button" onClick={() => respondInvitation(teacherId, true)}><Check size={15} /> 接受邀请</button><button className="button button-danger" type="button" onClick={() => respondInvitation(teacherId, false)}><X size={15} /> 拒绝</button></>}
                {status === "accepted" && !meeting && <Badge tone="success">已接受，等待家长预约见面</Badge>}
                {status === "declined" && <Badge tone="danger">已拒绝，未产生后续副作用</Badge>}
                {meeting === "scheduled" && <button className="button button-primary" type="button" onClick={() => completeMeeting(teacherId)}><CalendarClock size={15} /> 完成 15 分钟见面</button>}
                {meeting === "completed" && <Badge tone="success"><CheckCircle2 size={13} /> 见面已完成</Badge>}
              </div>
            </div>
          );
        })}
        {entries.length === 0 && <Link className="button button-ghost mt" href="/parent">去家长端发送邀请</Link>}
      </Card>
      <Card>
        <SectionHeading eyebrow="AVAILABILITY / 可用性" title="具体时段，而非模糊有空" />
        <div className="stack">
          {options.map((slot) => <label className="checkbox-label" key={`${slot.day}-${slot.startMinute}`}><input type="checkbox" checked={slots.some((item) => item.day === slot.day && item.startMinute === slot.startMinute)} onChange={() => toggle(slot)} />{slotLabel(slot)}</label>)}
        </div>
        <button className="button button-primary mt" type="button" onClick={() => updateAvailability(teacher.id, slots)}>保存可用时间</button>
        <p className="small muted mt">保存只更新教师供给；家长重新确认需求后才会生成新的候选快照。</p>
      </Card>
    </div>
  );
}

function TeachingStudio() {
  const { state, generateDraft, updateDraft, confirmDraft } = useDemo();
  const [kind, setKind] = useState<AIKind>("prep");
  const draft = state.drafts[kind];
  return (
    <div className="stack">
      <Card>
        <SectionHeading eyebrow="LESSON / 结构化记课" title="先保存事实，再生成报告" aside={<Badge tone={state.orderStatus === "paid_sandbox" ? "success" : "warning"}>{state.orderStatus === "paid_sandbox" ? "沙箱首课已支付" : "等待沙箱首课"}</Badge>} />
        <LessonForm />
      </Card>
      <Card>
        <SectionHeading eyebrow="AI STUDIO / 教师审核" title="AI 辅助，不自动发布" aside={<Badge tone="warning"><Bot size={13} /> 本地 Mock</Badge>} />
        <div className="ai-disclosure"><Sparkles size={18} /><span>当前不会请求任何外部模型，也不会产生模型费用。所有结果都是可识别的 Mock 草稿；教师确认前不影响家长报告或推荐。</span></div>
        <div className="tabs" role="tablist" aria-label="AI 工作类型">
          {(Object.keys(aiLabels) as AIKind[]).map((item) => <button type="button" role="tab" aria-selected={kind === item} className={kind === item ? "active" : ""} key={item} onClick={() => setKind(item)}>{aiLabels[item]}</button>)}
        </div>
        <div className="button-row" style={{ marginBottom: 16 }}>
          <button className="button button-primary" type="button" onClick={() => generateDraft(kind)}><Sparkles size={15} /> 生成{aiLabels[kind]} Mock 草稿</button>
          <Badge tone={draft.status === "confirmed" ? "success" : draft.status === "draft" ? "warning" : "neutral"}>{draft.status === "confirmed" ? "教师已确认" : draft.status === "draft" ? `草稿 v${draft.version}` : "尚未生成"}</Badge>
        </div>
        {draft.status === "empty" ? <EmptyState title="没有 AI 草稿" description="点击上方按钮生成。生成不等于确认，确认不等于自动提分。" /> : (
          <div className="field">
            <label htmlFor="ai-draft">AI 草稿内容（可编辑，修改后需重新确认）</label>
            <textarea id="ai-draft" value={draft.content} onChange={(event) => updateDraft(kind, event.target.value)} />
            <div className="button-row"><button className="button button-primary" type="button" disabled={draft.status === "confirmed"} onClick={() => confirmDraft(kind)}><FilePenLine size={15} /> {draft.status === "confirmed" ? "已确认" : "教师审核并确认"}</button>{kind === "report" && <span className="small muted">确认后才会出现在家长端</span>}</div>
          </div>
        )}
      </Card>
    </div>
  );
}

function LessonForm() {
  const { state, recordLesson } = useDemo();
  const [objective, setObjective] = useState("一次函数图象与参数变化");
  const [evidence, setEvidence] = useState("学生在无提示变式题中独立完成 2/3，错误集中于实际情境定义域检查。 ");
  const [nextPlan, setNextPlan] = useState("下一课先用一道不同情境题复核，再决定是否增加综合题难度。 ");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    recordLesson(objective, evidence, nextPlan);
  };
  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <div className="field field-full"><label htmlFor="lesson-objective">本课目标</label><input id="lesson-objective" value={objective} onChange={(event) => setObjective(event.target.value)} required /></div>
        <div className="field field-full"><label htmlFor="lesson-evidence">课堂证据</label><textarea id="lesson-evidence" style={{ minHeight: 100 }} value={evidence} onChange={(event) => setEvidence(event.target.value)} required /></div>
        <div className="field field-full"><label htmlFor="lesson-next">下一课承接</label><input id="lesson-next" value={nextPlan} onChange={(event) => setNextPlan(event.target.value)} required /></div>
      </div>
      <div className="button-row mt"><button className="button button-primary" type="submit" disabled={state.orderStatus !== "paid_sandbox"}><NotebookPen size={15} /> 确认课次</button><span className="small muted">已保存 {state.lessonNotes.length} 条新记课；历史第 4 课单独展示</span></div>
    </form>
  );
}

function LearningEvidence() {
  const { state, advanceLearningState } = useDemo();
  return (
    <div className="grid-2">
      <Card>
        <SectionHeading eyebrow="LEARNING STATE / 证据状态" title="一次函数斜率与图象" aside={<Badge tone={state.learningStatus === "resolved" ? "success" : "warning"}>{state.learningStatus}</Badge>} />
        <p className="small">观察：变式题首次作答错误，独立重做正确。证据量只有一次，不能直接写成“掌握 90%”。</p>
        <div className="status-timeline"><span className={state.learningStatus === "unverified" ? "active" : ""}>unverified</span><span className={state.learningStatus === "teacher_confirmed" ? "active" : ""}>teacher_confirmed</span><span className={state.learningStatus === "needs_recheck" ? "active" : ""}>needs_recheck</span><span className={state.learningStatus === "resolved" ? "active" : ""}>resolved</span></div>
        <button className="button button-primary mt" type="button" onClick={advanceLearningState}><Clock3 size={15} /> 教师复核并推进状态</button>
      </Card>
      <Card>
        <SectionHeading eyebrow="推荐反哺边界" title="哪些事实可以进入排序" />
        <ul className="reason-list">
          <li>可以：教师确认后的到课、取消、报告及时与记课完整。</li>
          <li>可以：同师第二课、第四课等可重算的聚合事实。</li>
          <li>不可以：LLM 主观教师评分、报告情绪词和整段家长报告。</li>
          <li>不可以：未经确认的学习状态或模型生成的“掌握率”。</li>
        </ul>
      </Card>
    </div>
  );
}

function ModelSettings() {
  return (
    <div className="grid-2">
      <Card>
        <SectionHeading eyebrow="MODEL GATEWAY / 模型网关" title="Mock 是当前唯一已启用模式" aside={<Badge tone="warning">无外部调用</Badge>} />
        <label className="checkbox-label"><input type="radio" checked readOnly />本地 Mock（明确标识）</label>
        <label className="checkbox-label" style={{ marginTop: 10, opacity: .6 }}><input type="radio" disabled />服务端 OpenAI 兼容托管模型（阶段 B 接入）</label>
        <label className="checkbox-label" style={{ marginTop: 10, opacity: 0.6 }}><input type="radio" disabled />BYOK（阶段 B 接入）</label>
        <p className="small muted mt">没有真实 Base URL、API Key 和模型预算时，不会伪造“托管模型已可用”。</p>
      </Card>
      <Card>
        <SectionHeading eyebrow="BYOK / 安全边界" title="浏览器不收集密钥" />
        <div className="ai-disclosure"><KeyRound size={18} /><span>BYOK 密钥将在阶段 B 仅通过服务端接收、加密保存且永不回显；Base URL 会经过 HTTPS 与 SSRF 防护。</span></div>
        <div className="field"><label htmlFor="byok-disabled">API Key</label><input id="byok-disabled" disabled placeholder="阶段 A 不接收、不存储任何密钥" /></div>
        <p className="small muted mt"><ShieldCheck size={14} /> 当前页面没有隐藏密钥字段，也不会将设置写入 localStorage。</p>
      </Card>
    </div>
  );
}
