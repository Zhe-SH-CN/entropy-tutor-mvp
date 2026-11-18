"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import { CalendarCheck, Check, ChevronRight, CircleDollarSign, FileCheck2, MapPin, Send, ShieldCheck, Sparkles } from "lucide-react";
import type { Demand } from "@mvp/shared";
import { AppShell } from "@/components/app-shell";
import { useDemo } from "@/components/demo-provider";
import { Badge, Card, EmptyState, ScoreBar, SectionHeading, Stepper } from "@/components/ui";
import { demoTeachers } from "@/lib/demo-data";
import { moneyLabel, modeLabel, slotLabel } from "@/lib/format";

export default function ParentPage() {
  const { state, submitDemand, inviteTeacher, scheduleMeeting, paySandbox } = useDemo();
  const [tab, setTab] = useState<"matching" | "course">("matching");
  const [showDemandForm, setShowDemandForm] = useState(false);
  const selectedTeacher = demoTeachers.find((teacher) => teacher.id === state.selectedTeacherId);
  const currentStep = state.orderStatus === "paid_sandbox" ? 4 : state.selectedTeacherId ? 3 : 2;

  return (
    <AppShell eyebrow="PARENT / 家长端" title="从真实需求，到可持续的正式课" description="先看具体时段、匹配原因与报价，再决定是否邀请。免费见面之后才进入沙箱首课支付。">
      <Stepper current={currentStep} />
      <div className="tabs" role="tablist" aria-label="家长功能">
        <button type="button" role="tab" aria-selected={tab === "matching"} className={tab === "matching" ? "active" : ""} onClick={() => setTab("matching")}>需求与 Top 3</button>
        <button type="button" role="tab" aria-selected={tab === "course"} className={tab === "course" ? "active" : ""} onClick={() => setTab("course")}>课程与家长报告</button>
      </div>

      {tab === "matching" ? (
        <div className="layout-sidebar">
          <div className="stack">
            <Card>
              <SectionHeading
                eyebrow="01 / 当前需求"
                title={`${state.demand.gradeBand} · ${state.demand.subject}`}
                aside={<button className="button button-secondary" type="button" onClick={() => setShowDemandForm((value) => !value)}>{showDemandForm ? "收起编辑" : "调整需求"}</button>}
              />
              <div className="teacher-meta">
                <Badge tone="info">{modeLabel(state.demand.mode)}</Badge>
                <Badge><MapPin size={12} /> {state.demand.areaCode}</Badge>
                <Badge tone="success">{moneyLabel(state.demand.budgetMinFen)}–{moneyLabel(state.demand.budgetMaxFen)}/小时</Badge>
                {state.demand.objectives.map((objective) => <Badge key={objective}>{objective}</Badge>)}
              </div>
              <p className="muted small">可约时段：{state.demand.preferredSlots.map(slotLabel).join("；")}</p>
              {showDemandForm && <DemandForm onComplete={() => { setShowDemandForm(false); }} onSubmit={submitDemand} />}
            </Card>

            <div>
              <SectionHeading
                eyebrow="02 / 可解释双向匹配"
                title={`Top ${state.recommendation.candidates.length} 候选`}
                aside={<Badge tone="info">{state.recommendation.ruleVersion}</Badge>}
              />
              {state.recommendation.candidates.length === 0 ? (
                <EmptyState title="没有伪造的推荐结果" description={state.recommendation.diagnostics.message} />
              ) : (
                <div className="stack">
                  {state.recommendation.candidates.map((candidate, index) => {
                    const teacher = demoTeachers.find((item) => item.id === candidate.teacherId)!;
                    const invitation = state.invitations[teacher.id];
                    const meeting = state.meetings[teacher.id];
                    const isSelected = state.selectedTeacherId === teacher.id;
                    return (
                      <Card className="teacher-card" key={teacher.id}>
                        <div style={{ "--teacher-accent": teacher.accent } as CSSProperties}>
                          <div className="teacher-head">
                            <div className="teacher-identity">
                              <div className="avatar">{teacher.displayName.slice(0, 1)}</div>
                              <div><h3>#{index + 1} {teacher.displayName}</h3><p>{teacher.school} · {teacher.education}</p></div>
                            </div>
                            <div className="rank-score"><strong>{candidate.breakdown.finalScore.toFixed(1)}</strong><span>综合匹配分</span></div>
                          </div>
                          <div className="teacher-meta">
                            <Badge tone="success"><ShieldCheck size={12} /> 身份/学历/成绩已核验</Badge>
                            <Badge>试讲 {teacher.interviewScore} 分</Badge>
                            {candidate.breakdown.x > 0 && <Badge tone="warning"><Sparkles size={12} /> 探索候选 +{candidate.breakdown.x}</Badge>}
                            <Badge tone="info"><CalendarCheck size={12} /> {slotLabel(candidate.slot)}</Badge>
                          </div>
                          <p className="small muted">{teacher.bio}</p>
                          <div className="score-grid">
                            <ScoreBar label="家长目标适配 P" value={candidate.breakdown.p} />
                            <ScoreBar label="教师接单收益 E" value={candidate.breakdown.e} />
                            <ScoreBar label="履约可靠性 R" value={candidate.breakdown.r} />
                            <ScoreBar label="持续上课 C" value={candidate.breakdown.c} />
                            <ScoreBar label="通勤/备课负担 B" value={candidate.breakdown.b} negative />
                            <ScoreBar label="当前负载 L" value={candidate.breakdown.l} negative />
                          </div>
                          <details>
                            <summary className="small">查看为什么这样排序</summary>
                            <ul className="reason-list">{candidate.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
                            <p className="small muted">计算式：{candidate.breakdown.weighted.parentFit} + {candidate.breakdown.weighted.teacherEarnings} + {candidate.breakdown.weighted.reliability} + {candidate.breakdown.weighted.continuation} − {candidate.breakdown.weighted.burdenPenalty} − {candidate.breakdown.weighted.loadPenalty} + {candidate.breakdown.weighted.exploration}。</p>
                          </details>
                          <div className="price-line">
                            <div><strong>{moneyLabel(candidate.quotedPriceFen)}</strong><small> / 小时</small><p className="small muted">预计有效时薪 {moneyLabel(candidate.effectiveHourlyFen)}/小时，仅展示，不重复计入总分</p></div>
                            <Badge>负载 {teacher.currentLoad}/{teacher.maxCapacity}</Badge>
                          </div>
                          <div className="button-row">
                            {!invitation && <button className="button button-primary" type="button" onClick={() => inviteTeacher(teacher.id)}><Send size={15} /> 发送邀请</button>}
                            {invitation === "invited" && <button className="button button-secondary" type="button" disabled>等待教师响应</button>}
                            {invitation === "accepted" && !meeting && <button className="button button-primary" type="button" onClick={() => scheduleMeeting(teacher.id)}>确认免费 15 分钟见面 <ChevronRight size={15} /></button>}
                            {invitation === "declined" && <Badge tone="danger">教师已拒绝，可联系其他候选</Badge>}
                            {meeting === "scheduled" && <Badge tone="info">见面已预约，等待教师完成</Badge>}
                            {meeting === "completed" && isSelected && state.orderStatus === "none" && <button className="button button-primary" type="button" onClick={paySandbox}><CircleDollarSign size={16} /> 沙箱支付并预约首课</button>}
                            {meeting === "completed" && isSelected && state.orderStatus === "paid_sandbox" && <Badge tone="success"><Check size={13} /> 沙箱首课已支付</Badge>}
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="stack">
            <Card>
              <SectionHeading eyebrow="交付状态" title="没有跳步的演示路径" />
              <div className="status-timeline">
                <span className="active">需求已确认</span><span className="active">Top {state.recommendation.candidates.length}</span>
                <span className={Object.keys(state.invitations).length > 0 ? "active" : ""}>邀请</span>
                <span className={state.selectedTeacherId ? "active" : ""}>见面</span>
                <span className={state.orderStatus === "paid_sandbox" ? "active" : ""}>首课</span>
              </div>
              <div className="divider" />
              <p className="small muted">当前选择：{selectedTeacher?.displayName ?? "尚未选择教师"}</p>
              <p className="small muted">订单状态：{state.orderStatus === "paid_sandbox" ? "Sandbox 已支付" : "未创建真实支付"}</p>
            </Card>
            <Card>
              <SectionHeading eyebrow="安全与边界" title="平台不会替你做决定" />
              <ul className="reason-list">
                <li>推荐分不是教学质量或提分承诺。</li>
                <li>教师可以看到同一需求的具体时段与预计有效时薪。</li>
                <li>15 分钟见面不产生支付；此处支付始终是沙箱。</li>
                <li>家长只能看到教师确认后的报告，不展示 AI 原始草稿。</li>
              </ul>
            </Card>
            <Card>
              <SectionHeading eyebrow="硬过滤诊断" title={`${state.recommendation.rejected.length} 名候选未入选`} />
              {state.recommendation.rejected.slice(0, 3).map((rejected) => {
                const teacher = demoTeachers.find((item) => item.id === rejected.teacherId);
                return <p className="small muted" key={rejected.teacherId}><strong>{teacher?.displayName ?? rejected.teacherId}</strong>：{rejected.reasons.join("、")}</p>;
              })}
            </Card>
          </div>
        </div>
      ) : (
        <CourseReports />
      )}
    </AppShell>
  );
}

function DemandForm({ onSubmit, onComplete }: { onSubmit: (demand: Demand) => boolean; onComplete: () => void }) {
  const { state } = useDemo();
  const [form, setForm] = useState(state.demand);
  const [error, setError] = useState("");

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const success = onSubmit({ ...form, id: `demand-synthetic-${Date.now()}` });
    if (success) {
      setError("");
      onComplete();
    } else {
      setError("请检查预算、时段和必填信息；详细原因已显示在页面顶部。 ");
    }
  };

  const toggleSlot = (day: number) => {
    const exists = form.preferredSlots.some((slot) => slot.day === day);
    const defaults: Record<number, { startMinute: number; endMinute: number }> = {
      2: { startMinute: 1140, endMinute: 1260 },
      6: { startMinute: 540, endMinute: 660 },
    };
    setForm({
      ...form,
      preferredSlots: exists
        ? form.preferredSlots.filter((slot) => slot.day !== day)
        : [...form.preferredSlots, { day, ...defaults[day]! }],
    });
  };

  return (
    <form className="mt" onSubmit={handleSubmit}>
      <div className="form-grid">
        <div className="field"><label htmlFor="subject">科目</label><input id="subject" value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} required maxLength={50} /></div>
        <div className="field"><label htmlFor="grade">学段</label><select id="grade" value={form.gradeBand} onChange={(event) => setForm({ ...form, gradeBand: event.target.value as Demand["gradeBand"] })}><option>初中</option><option>小学</option><option>高中</option></select></div>
        <div className="field"><label htmlFor="mode">授课模式</label><select id="mode" value={form.mode} onChange={(event) => setForm({ ...form, mode: event.target.value as Demand["mode"] })}><option value="offline">线下</option><option value="online">线上</option></select></div>
        <div className="field"><label htmlFor="area">区域编码（非详细地址）</label><input id="area" value={form.areaCode} onChange={(event) => setForm({ ...form, areaCode: event.target.value })} required maxLength={30} /></div>
        <div className="field"><label htmlFor="budget-min">最低预算（元/小时）</label><input id="budget-min" type="number" min={50} max={1000} value={form.budgetMinFen / 100} onChange={(event) => setForm({ ...form, budgetMinFen: Math.round(Number(event.target.value) * 100) })} required /></div>
        <div className="field"><label htmlFor="budget-max">最高预算（元/小时）</label><input id="budget-max" type="number" min={50} max={1000} value={form.budgetMaxFen / 100} onChange={(event) => setForm({ ...form, budgetMaxFen: Math.round(Number(event.target.value) * 100) })} required /></div>
        <div className="field field-full"><label htmlFor="objectives">学习目标（逗号分隔）</label><input id="objectives" value={form.objectives.join("，")} onChange={(event) => setForm({ ...form, objectives: event.target.value.split(/[,，]/).map((item) => item.trim()).filter(Boolean) })} /></div>
        <div className="field field-full"><span>具体可约时段</span><div className="checkbox-row"><label className="checkbox-label"><input type="checkbox" checked={form.preferredSlots.some((slot) => slot.day === 6)} onChange={() => toggleSlot(6)} />周六 09:00–11:00</label><label className="checkbox-label"><input type="checkbox" checked={form.preferredSlots.some((slot) => slot.day === 2)} onChange={() => toggleSlot(2)} />周二 19:00–21:00</label></div></div>
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="button-row mt"><button className="button button-primary" type="submit">确认需求并重算 Top 3</button><span className="small muted">不会保存联系方式或详细地址</span></div>
    </form>
  );
}

function CourseReports() {
  const { state } = useDemo();
  const currentReport = state.drafts.report;
  const currentLessonConfirmed = state.drafts.prep.status === "confirmed";
  return (
    <div className="grid-2">
      <Card>
        <SectionHeading eyebrow="历史虚构关系" title="同师第 4 次正式课" aside={<Badge tone="success"><FileCheck2 size={13} /> 教师已确认</Badge>} />
        <div className="teacher-meta"><Badge>一次函数</Badge><Badge>60 分钟</Badge><Badge>线上</Badge></div>
        <p className="small">本课通过两道无提示变式题复核斜率与图象。学生能独立解释参数变化，但在实际计费情境中仍需检查定义域。</p>
        <div className="ai-disclosure"><ShieldCheck size={18} /><span>该历史报告是合成数据，用于展示“教师确认后家长可见”的边界，不代表真实教学效果。</span></div>
        <p className="small muted">下一步：保留 10 分钟独立回忆，不直接增加综合题难度。</p>
      </Card>
      <Card>
        <SectionHeading eyebrow="当前关系" title="AI 辅助报告" aside={currentReport.status === "confirmed" ? <Badge tone="success">已发布</Badge> : <Badge>未发布</Badge>} />
        {currentReport.status === "confirmed" ? <div className="ai-output">{currentReport.content}</div> : <EmptyState title="没有可展示的新报告" description="教师生成 Mock 草稿后，还必须编辑并确认。未确认内容不会出现在这里。" />}
      </Card>
      <Card>
        <SectionHeading eyebrow="学习证据" title="备课确认状态" />
        <p className="small muted">下一课备课：{currentLessonConfirmed ? "教师已确认" : "尚未确认"}。平台不使用自动掌握百分比替代教师判断。</p>
      </Card>
      <Card>
        <SectionHeading eyebrow="北极星口径" title="观察同师第四课" />
        <p className="small muted">当前仅有一条历史虚构关系到达同师第 4 课。未满 30 日的需求 cohort 不进入北极星最终结果。</p>
      </Card>
    </div>
  );
}
