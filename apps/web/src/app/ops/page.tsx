"use client";

import { useState, type FormEvent } from "react";
import { AlertTriangle, ArrowRightLeft, Bot, CheckCircle2, ClipboardCheck, FileClock, GitBranch, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useDemo } from "@/components/demo-provider";
import { Badge, Card, EmptyState, SectionHeading } from "@/components/ui";
import { dateTimeLabel, slotLabel } from "@/lib/format";

export default function OpsPage() {
  const { state } = useDemo();
  const [tab, setTab] = useState<"overview" | "events" | "rules">("overview");
  const generated = Object.values(state.drafts).filter((draft) => draft.status !== "empty").length;
  const confirmed = Object.values(state.drafts).filter((draft) => draft.status === "confirmed").length;
  const accepted = Object.values(state.invitations).filter((status) => status === "accepted").length;
  const meetings = Object.values(state.meetings).filter((status) => status === "completed").length;

  return (
    <AppShell eyebrow="OPERATIONS / 运营控制台" title="把撮合漏斗，变成交付证据" description="运营不仅看需求数，还要能解释候选、处理异常、追踪教师审核，并对每次人工改派留痕。">
      <div className="grid-3" style={{ marginBottom: 18 }}>
        <div className="metric-card"><span>候选覆盖率</span><strong>{state.recommendation.candidates.length > 0 ? "100%" : "0%"}</strong><small>{state.recommendation.candidates.length} 名合格候选</small></div>
        <div className="metric-card"><span>已完成免费见面</span><strong>{meetings}</strong><small>{accepted} 名教师已接受邀请</small></div>
        <div className="metric-card"><span>历史同师第四课</span><strong>1</strong><small>仅为虚构关系，不代表真实北极星</small></div>
      </div>
      <div className="tabs" role="tablist" aria-label="运营功能">
        <button type="button" role="tab" aria-selected={tab === "overview"} className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}>交付与异常</button>
        <button type="button" role="tab" aria-selected={tab === "events"} className={tab === "events" ? "active" : ""} onClick={() => setTab("events")}>事件审计</button>
        <button type="button" role="tab" aria-selected={tab === "rules"} className={tab === "rules" ? "active" : ""} onClick={() => setTab("rules")}>推荐解释</button>
      </div>
      {tab === "overview" && (
        <div className="layout-sidebar">
          <div className="stack">
            <Card>
              <SectionHeading eyebrow="FUNNEL / 当前虚构需求" title="从候选到首课" />
              <div className="status-timeline"><span className="active">需求 1</span><span className="active">候选 {state.recommendation.candidates.length}</span><span className={Object.keys(state.invitations).length ? "active" : ""}>邀请 {Object.keys(state.invitations).length}</span><span className={meetings ? "active" : ""}>见面 {meetings}</span><span className={state.orderStatus === "paid_sandbox" ? "active" : ""}>首课 {state.orderStatus === "paid_sandbox" ? 1 : 0}</span></div>
              <div className="table-wrap mt">
                <table className="status-table">
                  <thead><tr><th>教师</th><th>具体时段</th><th>邀请</th><th>见面</th><th>当前关系</th></tr></thead>
                  <tbody>{state.recommendation.candidates.map((candidate) => <tr key={candidate.teacherId}><td><strong>{candidate.teacherName}</strong></td><td>{slotLabel(candidate.slot)}</td><td>{state.invitations[candidate.teacherId] ?? "未邀请"}</td><td>{state.meetings[candidate.teacherId] ?? "未预约"}</td><td>{state.selectedTeacherId === candidate.teacherId ? <Badge tone="success">已选择</Badge> : "—"}</td></tr>)}</tbody>
                </table>
              </div>
            </Card>
            <Card>
              <SectionHeading eyebrow="AI QUALITY / 人工审核" title="草稿确认率与发布边界" aside={<Bot size={20} />} />
              <div className="grid-3">
                <div className="metric-card"><span>已生成草稿</span><strong>{generated}</strong><small>全部 Mock</small></div>
                <div className="metric-card"><span>教师确认</span><strong>{confirmed}</strong><small>{generated ? Math.round(confirmed / generated * 100) : 0}% 确认率</small></div>
                <div className="metric-card"><span>自动发布</span><strong>0</strong><small>家长报告无自动发布</small></div>
              </div>
            </Card>
          </div>
          <div className="stack">
            <Card>
              <SectionHeading eyebrow="EXCEPTIONS / 异常队列" title={`${state.exceptionQueue.length} 条待处理`} aside={<AlertTriangle size={20} color="#b56a2b" />} />
              {state.exceptionQueue.length ? <ul className="exception-list">{state.exceptionQueue.map((item) => <li key={item}>{item}</li>)}</ul> : <EmptyState title="异常已处理" description="人工处理结果已经写入事件审计。" />}
            </Card>
            <Reassignment />
          </div>
        </div>
      )}
      {tab === "events" && (
        <Card>
          <SectionHeading eyebrow="EVENT LOG / 只增不改" title={`${state.events.length} 条本地演示事件`} aside={<Badge tone="info">不含个人信息</Badge>} />
          <ul className="event-list">{[...state.events].reverse().map((event) => <li key={event.id}><time>{dateTimeLabel(event.occurredAt)}</time><div><strong>{event.name} <Badge>{event.actorRole}</Badge></strong><p>{event.detail}</p><p>entity: {event.entityId}</p></div></li>)}</ul>
        </Card>
      )}
      {tab === "rules" && <RuleExplanation />}
    </AppShell>
  );
}

function Reassignment() {
  const { state, reassign } = useDemo();
  const [teacherId, setTeacherId] = useState(state.recommendation.candidates[0]?.teacherId ?? "");
  const [reason, setReason] = useState("原邀请超时，按时段与履约分人工改派");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    reassign(teacherId, reason);
  };
  return (
    <Card>
      <SectionHeading eyebrow="MANUAL ACTION / 人工改派" title="必须填写原因" />
      <form onSubmit={submit}>
        <div className="field"><label htmlFor="reassign-teacher">改派到合格候选</label><select id="reassign-teacher" value={teacherId} onChange={(event) => setTeacherId(event.target.value)}>{state.recommendation.candidates.map((candidate) => <option key={candidate.teacherId} value={candidate.teacherId}>{candidate.teacherName}</option>)}</select></div>
        <div className="field mt"><label htmlFor="reassign-reason">改派原因</label><textarea id="reassign-reason" style={{ minHeight: 100 }} value={reason} onChange={(event) => setReason(event.target.value)} required minLength={3} maxLength={200} /></div>
        <button className="button button-primary mt" type="submit" disabled={!teacherId}><ArrowRightLeft size={15} /> 确认改派并留痕</button>
      </form>
      <p className="small muted mt">改派会取消当前沙箱订单资格，避免换老师后沿用原支付状态。</p>
    </Card>
  );
}

function RuleExplanation() {
  const { state } = useDemo();
  return (
    <div className="stack">
      <Card>
        <SectionHeading eyebrow="RULE SNAPSHOT / 规则快照" title={state.recommendation.ruleVersion} aside={<Badge tone="success"><GitBranch size={13} /> 可执行</Badge>} />
        <p className="hero-formula" style={{ color: "var(--teal-dark)", textAlign: "left", margin: 0 }}>40P + 20E + 20R + 20C − 10B − 10L² + X</p>
        <p className="small muted mt">生成时间：{dateTimeLabel(state.recommendation.generatedAt)}。E 只比较报价与目标毛时薪；通勤和备课仅在 B 扣分；有效时薪只在邀请页展示。</p>
        <div className="grid-3 mt">
          <div className="metric-card"><ClipboardCheck size={18} /><strong style={{ fontSize: 18 }}>硬过滤优先</strong><small>资质、模式、区域、预算、具体时段、容量</small></div>
          <div className="metric-card"><FileClock size={18} /><strong style={{ fontSize: 18 }}>冷启动先验</strong><small>个人观察权重 n/(n+5)</small></div>
          <div className="metric-card"><ShieldCheck size={18} /><strong style={{ fontSize: 18 }}>探索有配额</strong><small>Top 3 最多一名，滚动曝光默认不超过 20%</small></div>
        </div>
      </Card>
      <Card>
        <SectionHeading eyebrow="CANDIDATE BREAKDOWN / 七项明细" title="排序不是黑箱" />
        <div className="table-wrap"><table className="status-table"><thead><tr><th>教师</th><th>P</th><th>E</th><th>R</th><th>C</th><th>B</th><th>L</th><th>X</th><th>总分</th></tr></thead><tbody>{state.recommendation.candidates.map((candidate) => <tr key={candidate.teacherId}><td>{candidate.teacherName}</td><td>{candidate.breakdown.p.toFixed(3)}</td><td>{candidate.breakdown.e.toFixed(3)}</td><td>{candidate.breakdown.r.toFixed(3)}</td><td>{candidate.breakdown.c.toFixed(3)}</td><td>{candidate.breakdown.b.toFixed(3)}</td><td>{candidate.breakdown.l.toFixed(3)}</td><td>{candidate.breakdown.x}</td><td><strong>{candidate.breakdown.finalScore.toFixed(1)}</strong></td></tr>)}</tbody></table></div>
      </Card>
      <Card>
        <SectionHeading eyebrow="反哺限制" title="模型不能给自己制造排序证据" />
        <p className="small muted"><CheckCircle2 size={15} /> 只有教师确认后的到课、取消、报告及时、记课完整与持续上课事实可进入聚合。未确认学习状态、报告情绪词和 LLM 主观教师评分均不进入排序。</p>
      </Card>
    </div>
  );
}
