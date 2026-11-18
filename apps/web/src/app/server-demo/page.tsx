"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { RecommendationResult } from "@mvp/shared";
import {
  AlertTriangle, ArrowLeft, BarChart3, CalendarClock, Check, ChevronRight,
  CircleCheck, ClipboardCheck, Database, GraduationCap, LogOut, Play,
  RotateCcw, Settings2, ShieldCheck, Sparkles, UserRound, Users,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1";
type Role = "parent" | "teacher" | "ops";
type User = { id: string; role: Role; email?: string; teacherId?: string | null };
type Meeting = { id: string; status: string; provider: string; meetingUrl: string; scheduledAt: string; rescheduleCount: number };
type Invitation = { id: string; demandId: string; teacherId: string; status: string; expiresAt?: string | null; declineReason?: string | null; teacher?: { displayName: string }; meeting?: Meeting | null };
type Artifact = { id: string; kind: string; content: string; rawContent?: string; status: string; provider: string; model: string; viewedAt?: string | null };
type OpsArtifact = { id: string; kind: string; provider: string; model: string; confirmedAt: string | null };
type Lesson = { id: string; sequence: number; objective: string; evidence: string; status: string; scheduledAt?: string | null; artifacts?: Artifact[] };
type Feedback = { id: string; continueIntent: string; createdAt: string };
type Relationship = { id: string; demandId: string; teacherId: string; teacher?: { displayName: string }; orders: Array<{ id: string; status: string; provider: string; lessonCount?: number }>; lessons: Lesson[]; artifacts?: Artifact[]; feedback?: Feedback[] };
type Demand = { id: string; subject: string; status: string; rawText?: string; structuredPayload?: unknown; invitations: Invitation[]; relationship?: Relationship | null };
type TeacherProfile = { id: string; displayName: string; reviewStatus: string; reviewNote?: string | null; maxCapacity: number; availability: Array<{ day: number; startMinute: number; endMinute: number }>; availabilityUpdatedAt: string };
type TeacherData = { invitations: Invitation[]; relationships: Relationship[]; profile: TeacherProfile | null };
type Candidate = RecommendationResult["candidates"][number];
type Event = { id: string; name: string; entityType: string; entityId: string; occurredAt: string; schemaVersion: string; source: string };
type Analytics = {
  cohort30d: { recentDemandCount: number; matureDemandCount: number; paidCount: number; secondLessonCount: number; fourthLessonCount: number; northStarRate: number | null };
  ai: { generated: number; confirmed: number; confirmationRate: number };
  recommendation: { runs7d: number; explorationReturnRate7d: number; latestRunId: string | null };
  exceptions: Array<{ type: string; entityId: string; reason: string }>;
};

async function api<T>(path: string, method = "GET", body?: unknown, extraHeaders?: Record<string, string>): Promise<T> {
  const csrf = document.cookie.split("; ").find((part) => part.startsWith("mvp_csrf="))?.split("=")[1];
  const response = await fetch(`${API}${path}`, {
    method, credentials: "include",
    headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...(method === "GET" ? {} : { "x-csrf-token": decodeURIComponent(csrf ?? "") }), ...extraHeaders },
    body: body === undefined ? null : JSON.stringify(body),
  });
  const data = await response.json() as { message?: string | string[] };
  if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join("；") : data.message ?? `请求失败（${response.status}）`);
  return data as T;
}

const roleMeta = {
  parent: { label: "家长", icon: UserRound, email: "parent@demo.test", description: "确认结构化需求、比较 Top 3、确认见面与课次，并提交续课反馈。" },
  teacher: { label: "教师", icon: GraduationCap, email: "teacher@demo.test", description: "维护可授时间、响应邀请、备课记课，并审核所有 AI 草稿。" },
  ops: { label: "运营", icon: BarChart3, email: "ops@demo.test", description: "审核教师、处理改派与异常，观察 cohort 并回放推荐规则。" },
} as const;

function SlotText({ slot }: { slot: Candidate["slot"] }) {
  const time = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return <span>周{["日", "一", "二", "三", "四", "五", "六"][slot.day]} · {time(slot.startMinute)}—{time(slot.endMinute)}</span>;
}

function StatusPill({ value }: { value: string }) {
  const success = ["confirmed", "completed", "accepted", "approved", "paid", "active"].includes(value);
  const warning = ["draft", "submitted", "invited", "scheduled", "completion_marked", "pending"].includes(value);
  return <span className={`badge ${success ? "badge-success" : warning ? "badge-warning" : ""}`}>{value}</span>;
}

function CandidateExposure({ runId, teacherId, children }: { runId: string; teacherId: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || !runId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let sent = false;
    setFailed(false);
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting && entry.intersectionRatio >= 0.5) {
        if (!timer && !sent) timer = setTimeout(() => {
          sent = true;
          void api(`/recommendations/${runId}/exposures`, "POST", { teacherId }).catch(() => setFailed(true));
        }, 1000);
      } else if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    }, { threshold: [0, 0.5, 1] });
    observer.observe(element);
    return () => { observer.disconnect(); if (timer) clearTimeout(timer); };
  }, [runId, teacherId]);
  return <article className="candidate-card" ref={ref}>{children}{failed && <p className="candidate-note" role="alert">曝光事件上报失败；刷新页面可重试，不影响选择教师。</p>}</article>;
}

export default function ServerDemoPage() {
  const [user, setUser] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [demands, setDemands] = useState<Demand[]>([]);
  const [selectedDemandId, setSelectedDemandId] = useState("");
  const [teacherData, setTeacherData] = useState<TeacherData>({ invitations: [], relationships: [], profile: null });
  const [opsTeachers, setOpsTeachers] = useState<TeacherProfile[]>([]);
  const [opsArtifacts, setOpsArtifacts] = useState<OpsArtifact[]>([]);
  const [reviewArtifactId, setReviewArtifactId] = useState("");
  const [events, setEvents] = useState<Event[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [replayMatches, setReplayMatches] = useState<boolean | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [recommendationRunId, setRecommendationRunId] = useState("");
  const [candidateDemandId, setCandidateDemandId] = useState("");
  const [reports, setReports] = useState<Artifact[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [modelSettings, setModelSettings] = useState({ baseUrl: "", model: "", apiKey: "", hasKey: false, mode: "mock" });
  const [lessonCount, setLessonCount] = useState(1);
  const [capacity, setCapacity] = useState(8);
  const [overrideTeacherId, setOverrideTeacherId] = useState("teacher-chen");
  const [newDemand, setNewDemand] = useState({ rawText: "孩子初二，一次函数基础不稳，希望先免费见面，再决定是否继续。", objectives: "一次函数图象与性质", budgetMaxFen: 18000 });
  const epoch = useRef(0);
  const selectedDemand = demands.find((demand) => demand.id === selectedDemandId) ?? demands[0];

  const refresh = useCallback(async (current: User) => {
    const currentEpoch = ++epoch.current;
    if (current.role === "parent") {
      const [demandData, reportData] = await Promise.all([api<Demand[]>("/demo/bootstrap"), api<Artifact[]>("/reports")]);
      if (epoch.current === currentEpoch) {
        setDemands(demandData); setReports(reportData);
        setSelectedDemandId((previous) => demandData.some((item) => item.id === previous) ? previous : demandData[0]?.id ?? "");
      }
    } else if (current.role === "teacher") {
      const [data, settings] = await Promise.all([api<TeacherData>("/demo/bootstrap"), api<typeof modelSettings>("/ai/settings")]);
      if (epoch.current === currentEpoch) {
        setTeacherData(data); setModelSettings((previous) => ({ ...previous, ...settings, apiKey: "" }));
        setCapacity(data.profile?.maxCapacity ?? 8);
        const initialEdits: Record<string, string> = {};
        data.relationships.forEach((relationship) => {
          [...(relationship.artifacts ?? []), ...relationship.lessons.flatMap((lesson) => lesson.artifacts ?? [])].forEach((artifact) => { initialEdits[artifact.id] = artifact.content; });
        });
        setEdits((previous) => ({ ...initialEdits, ...previous }));
      }
    } else {
      const [data, analyticsData, teachers, artifacts] = await Promise.all([api<Event[]>("/demo/bootstrap"), api<Analytics>("/analytics/overview"), api<TeacherProfile[]>("/ops/teachers"), api<OpsArtifact[]>("/ops/artifacts")]);
      if (epoch.current === currentEpoch) {
        setEvents(data); setAnalytics(analyticsData); setOpsTeachers(teachers); setOpsArtifacts(artifacts);
        setReviewArtifactId((previous) => artifacts.some((artifact) => artifact.id === previous) ? previous : artifacts[0]?.id ?? "");
      }
    }
  }, []);

  useEffect(() => { if (user) void refresh(user).catch((reason: Error) => setError(reason.message)); }, [user, refresh]);

  async function run(work: () => Promise<void>, successMessage?: string) {
    if (!user || busy) return;
    setBusy(true); setError(""); setNotice("");
    try { await work(); await refresh(user); if (successMessage) setNotice(successMessage); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "操作失败"); }
    finally { setBusy(false); }
  }

  async function login(email: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await api<{ user: User }>("/auth/login", "POST", { email, password: "DemoPass123!" });
      epoch.current += 1;
      setCandidates([]); setRecommendationRunId(""); setDemands([]); setTeacherData({ invitations: [], relationships: [], profile: null }); setEvents([]); setReports([]); setAnalytics(null); setOpsArtifacts([]); setReplayMatches(null);
      setUser(result.user);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "登录失败"); }
    finally { setBusy(false); }
  }

  async function logout() {
    if (!user) return;
    await run(async () => { await api("/auth/logout", "POST"); });
    epoch.current += 1; setUser(null); setError(""); setNotice("");
  }

  async function recommendDemand(demand: Demand) {
    if (!selectedDemand && !demand) return;
    await run(async () => {
      if (demand.status === "draft") {
        await api(`/demands/${demand.id}/structure`, "POST");
        await api(`/demands/${demand.id}/confirm`, "POST");
      } else if (demand.status === "submitted") {
        await api(`/demands/${demand.id}/confirm`, "POST");
      }
      const result = await api<{ candidates: Candidate[]; runId: string }>(`/demands/${demand.id}/recommend`, "POST");
      setCandidateDemandId(demand.id); setRecommendationRunId(result.runId); setCandidates(result.candidates);
    }, "需求已确认，Top 3 与输入快照已保存");
  }

  function confirmArtifact(artifact: Artifact) {
    void run(async () => { await api(`/artifacts/${artifact.id}/confirm`, "POST", { content: edits[artifact.id] ?? artifact.content }); }, "教师确认已持久化；原始草稿与修改内容均保留");
  }

  return (
    <main className="server-shell">
      <nav className="server-nav" aria-label="全栈演示导航">
        <Link className="server-brand" href="/"><span className="brand-mark"><Sparkles size={19} /></span><span><strong>熵曦</strong><small>AI NATIVE TUTORING</small></span></Link>
        <div className="server-nav-meta"><span><Database size={15} />NestJS + PostgreSQL</span><Link href="/"><ArrowLeft size={15} />返回本地演示</Link></div>
      </nav>

      <div className="server-container">
        <header className="server-hero">
          <div className="server-hero-copy">
            <span className="eyebrow">FULLSTACK DEMO · INTERNAL</span>
            <h1>让每一次匹配，<br /><em>留下可复用的证据。</em></h1>
            <p>从需求确认、Top 3、双方见面到备课、课次与 30 日复盘。业务动作穿过真实 API 和数据库；AI 只生成草稿，教师确认后才对家长生效。</p>
            <div className="trust-row"><span><ShieldCheck size={16} />资源级权限</span><span><CircleCheck size={16} />双边状态确认</span><span><RotateCcw size={16} />规则可回放</span></div>
          </div>
          <aside className="runtime-card">
            <div className="runtime-card-head"><span className="live-indicator" />运行边界</div>
            <dl><div><dt>业务状态</dt><dd>PostgreSQL 持久化</dd></div><div><dt>模型</dt><dd>本地 Mock / 托管 / BYOK</dd></div><div><dt>支付与会议</dt><dd>沙箱适配器</dd></div><div><dt>演示数据</dt><dd>全合成，不含真实家庭信息</dd></div></dl>
          </aside>
        </header>

        <ol className="workflow-strip" aria-label="业务闭环">
          {["结构化并确认需求", "双向 Top 3", "双方确认见面", "备课与课次确认", "反馈与 30 日复盘"].map((item, index) => <li key={item}><span>{String(index + 1).padStart(2, "0")}</span><strong>{item}</strong>{index < 4 && <ChevronRight size={15} />}</li>)}
        </ol>
        {error && <p className="error-banner" role="alert"><AlertTriangle size={17} />{error}</p>}
        {notice && <p className="success-banner" role="status"><CircleCheck size={17} />{notice}</p>}

        {!user ? <section className="login-section">
          <div className="section-intro"><span className="eyebrow">选择一个视角</span><h2>用三个角色走完同一条业务链</h2><p>统一合成账号密码 <code>DemoPass123!</code>。会话写入 HttpOnly Cookie，不进入 localStorage。</p></div>
          <div className="role-login-grid">{(Object.keys(roleMeta) as Role[]).map((role) => {
            const meta = roleMeta[role]; const Icon = meta.icon;
            return <article className="role-login-card" key={role}><div className="role-icon"><Icon size={22} /></div><span className="role-number">0{role === "parent" ? 1 : role === "teacher" ? 2 : 3}</span><h3>{meta.label}端</h3><p>{meta.description}</p><button className="button button-primary" disabled={busy} type="button" onClick={() => void login(meta.email)}>{meta.label}登录<Play size={15} /></button></article>;
          })}</div>
        </section> : <div className="active-role-bar"><div><span className={`role-dot role-${user.role}`} /><strong>{roleMeta[user.role].label}工作台</strong><span>{user.email}</span></div><button className="button button-secondary" type="button" onClick={() => void logout()}><LogOut size={15} />退出当前角色</button></div>}

        {user?.role === "parent" && <div className="role-workspace">
          <section className="card workflow-card">
            <div className="section-heading"><div><span className="eyebrow">01 · 需求与匹配</span><h2>先确认需求，再比较候选</h2><p>Mock 结构化只整理字段，不替家长做最终决定；候选来自审核通过且近期更新可用性的教师。</p></div>{selectedDemand && <button className="button button-primary" disabled={busy} type="button" onClick={() => void recommendDemand(selectedDemand)}>生成真实 Top 3<Sparkles size={16} /></button>}</div>
            <div className="demand-toolbar">
              <div className="field"><label htmlFor="demand-select">当前需求</label><select id="demand-select" value={selectedDemand?.id ?? ""} onChange={(event) => { setSelectedDemandId(event.target.value); setCandidates([]); setRecommendationRunId(""); }}>{demands.map((demand) => <option value={demand.id} key={demand.id}>{demand.subject} · {demand.status} · {demand.id.slice(0, 8)}</option>)}</select></div>
              {selectedDemand && <div className="demand-status"><StatusPill value={selectedDemand.status} /><span>{selectedDemand.structuredPayload ? "结构化草稿已生成" : "等待结构化"}</span></div>}
            </div>
            <details className="demand-builder"><summary>创建一条新的合成需求</summary><div className="form-grid demand-form"><div className="field field-full"><label htmlFor="raw-demand">家长原始描述</label><textarea id="raw-demand" rows={3} value={newDemand.rawText} onChange={(event) => setNewDemand({ ...newDemand, rawText: event.target.value })} /></div><div className="field"><label htmlFor="demand-objective">学习目标</label><input id="demand-objective" value={newDemand.objectives} onChange={(event) => setNewDemand({ ...newDemand, objectives: event.target.value })} /></div><div className="field"><label htmlFor="demand-budget">时薪上限（元）</label><input id="demand-budget" type="number" min={100} max={200} value={newDemand.budgetMaxFen / 100} onChange={(event) => setNewDemand({ ...newDemand, budgetMaxFen: Number(event.target.value) * 100 })} /></div></div><button className="button button-secondary" disabled={busy || !newDemand.rawText.trim() || !newDemand.objectives.trim()} type="button" onClick={() => void run(async () => {
              const created = await api<Demand>("/demands", "POST", { subject: "初中数学", gradeBand: "初中", mode: "online", areaCode: "310112", budgetMinFen: 10000, budgetMaxFen: newDemand.budgetMaxFen, lessonMinutes: 60, preferredSlots: [{ day: 6, startMinute: 540, endMinute: 660 }], objectives: [newDemand.objectives], requiredExperience: ["初中数学"], preferenceTags: ["耐心", "结构化反馈"], rawText: newDemand.rawText });
              setSelectedDemandId(created.id); await api(`/demands/${created.id}/structure`, "POST"); await api(`/demands/${created.id}/confirm`, "POST");
            }, "新需求已完成 Mock 结构化与家长确认")}>创建、结构化并确认需求</button></details>
            {candidates.length === 0 ? <div className="empty-state"><strong>候选尚未生成</strong><p>选择已确认需求并点击“生成真实 Top 3”，服务端会保存规则版本、输入快照与评分明细。</p></div> : <div className="candidate-grid">{candidates.map((candidate, index) => <CandidateExposure runId={recommendationRunId} teacherId={candidate.teacherId} key={candidate.teacherId}>
              <div className="candidate-top"><span className="candidate-rank">0{index + 1}</span><div className="candidate-score"><strong>{candidate.breakdown.finalScore.toFixed(1)}</strong><span>综合匹配分</span></div></div>
              <div className="candidate-person"><span className="candidate-avatar">{candidate.teacherName.slice(0, 1)}</span><div><h3>{candidate.teacherName}</h3><p><CalendarClock size={14} /><SlotText slot={candidate.slot} /></p></div></div>
              <div className="candidate-price"><span>预计有效时薪</span><strong>¥{(candidate.effectiveHourlyFen / 100).toFixed(0)}<small>/h</small></strong></div>
              <ul className="candidate-reasons">{candidate.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
              {candidate.teacherId === "teacher-lin" ? <button className="button button-primary candidate-action" disabled={busy} type="button" onClick={() => void run(async () => { await api(`/demands/${candidateDemandId}/invitations`, "POST", { teacherId: candidate.teacherId }); }, "邀请已发送，教师有 12 小时响应")}>邀请林老师<ChevronRight size={16} /></button> : <p className="candidate-note">仅查看；本 Demo 只提供林老师登录账号</p>}
            </CandidateExposure>)}</div>}
          </section>

          <div className="grid-2">
            <section className="card"><div className="section-heading"><div><span className="eyebrow">02 · 见面与订单</span><h2>双方愿意继续，才建立关系</h2></div></div>
              <div className="record-list">{demands.flatMap((demand) => demand.invitations).map((invitation) => <div className="record-row" key={invitation.id}><div><strong>{invitation.teacher?.displayName ?? invitation.teacherId}</strong><p>邀请：{invitation.status} · 见面：{invitation.meeting?.status ?? "未预约"}</p>{invitation.expiresAt && invitation.status === "invited" && <small>响应截止 {new Date(invitation.expiresAt).toLocaleString("zh-CN")}</small>}</div><div className="button-row">{invitation.status === "accepted" && !invitation.meeting && <button className="button button-primary" disabled={busy} type="button" onClick={() => void run(async () => { await api(`/invitations/${invitation.id}/meeting`, "POST"); })}>预约沙箱见面</button>}{invitation.meeting?.status === "scheduled" && <><button className="button button-primary" disabled={busy} type="button" onClick={() => void run(async () => { await api(`/meetings/${invitation.meeting!.id}/outcome`, "POST", { continueIntent: true }); }, "家长见面意愿已保存；仍需教师确认")}>家长确认继续</button><button className="button button-secondary" disabled={busy} type="button" onClick={() => void run(async () => { await api(`/meetings/${invitation.meeting!.id}/exception`, "POST", { action: "reschedule", reason: "家长需要改期" }); })}>改期 24 小时</button><button className="button button-secondary" disabled={busy} type="button" onClick={() => void run(async () => { await api(`/meetings/${invitation.meeting!.id}/exception`, "POST", { action: "no_show", reason: "家长登记见面未到场", noShowParty: "unknown" }); })}>登记见面异常</button></>}</div></div>)}
                {demands.filter((demand) => demand.relationship).map((demand) => <div className="record-row" key={demand.relationship!.id}><div><strong>与 {demand.relationship!.teacher?.displayName} 的教学关系</strong><p>订单 {demand.relationship!.orders.length} · 课次 {demand.relationship!.lessons.length}</p></div>{demand.relationship!.orders.length === 0 && <div className="order-controls"><label htmlFor="lesson-count">首单课次</label><select id="lesson-count" value={lessonCount} onChange={(event) => setLessonCount(Number(event.target.value))}>{[1, 2, 3, 4].map((count) => <option key={count} value={count}>{count} 课</option>)}</select><button className="button button-primary" disabled={busy} type="button" onClick={() => void run(async () => { await api(`/relationships/${demand.relationship!.id}/orders`, "POST", { lessonCount }, { "Idempotency-Key": `order-${demand.relationship!.id}` }); })}>创建幂等沙箱订单</button></div>}</div>)}
                {demands.every((demand) => demand.invitations.length === 0 && !demand.relationship) && <div className="empty-state"><strong>等待邀请</strong><p>邀请教师后，见面和订单状态会出现在这里。</p></div>}
              </div>
            </section>
            <section className="card"><div className="section-heading"><div><span className="eyebrow">03 · 报告可见性</span><h2>只给家长看教师确认版</h2></div></div>{reports.length === 0 ? <div className="empty-state"><strong>没有可见报告</strong><p>AI 草稿和未确认内容不会出现在这里。</p></div> : reports.map((report) => <article className="report-card" key={report.id}><span className="badge badge-success"><Check size={13} />教师已确认</span><p>{report.content}</p>{report.viewedAt ? <small>已读 · {new Date(report.viewedAt).toLocaleString("zh-CN")}</small> : <button className="button button-secondary" disabled={busy} type="button" onClick={() => void run(async () => { await api(`/reports/${report.id}/view`, "POST"); })}>标记报告已读</button>}</article>)}</section>
          </div>

          <section className="card"><div className="section-heading"><div><span className="eyebrow">04 · 课次与反馈</span><h2>记课不等于完成，家长确认才计入</h2><p>取消与 no_show 不占正式课序号；换老师会保留原需求来源并生成新草稿。</p></div></div>
            {demands.filter((demand) => demand.relationship).map((demand) => <div className="relationship-block" key={demand.relationship!.id}><div className="relationship-head"><div><Users size={18} /><strong>{demand.relationship!.teacher?.displayName} · 课次确认</strong></div><span className="badge">反馈 {demand.relationship!.feedback?.length ?? 0} 条</span></div>
              {demand.relationship!.lessons.map((lesson) => <div className="lesson-confirm-row" key={lesson.id}><div><strong>{lesson.status === "completed" ? `第 ${lesson.sequence} 课` : "待确认课次"} · {lesson.objective}</strong><p>{lesson.evidence}</p><StatusPill value={lesson.status} /></div><div className="button-row">{lesson.status === "completion_marked" && <button className="button button-primary" disabled={busy} type="button" onClick={() => void run(async () => { await api(`/lessons/${lesson.id}/confirm`, "POST"); }, "课次完成已确认并重新计算同师课序号")}>确认课次完成</button>}{!['cancelled', 'no_show'].includes(lesson.status) && <button className="button button-secondary" disabled={busy} type="button" onClick={() => void run(async () => { await api(`/lessons/${lesson.id}/cancel`, "POST", { reason: "合成取消场景" }); })}>取消课次</button>}</div></div>)}
              <div className="feedback-actions"><span>本阶段家长反馈</span><div className="button-row"><button className="button button-secondary" disabled={busy} type="button" onClick={() => void run(async () => { await api(`/relationships/${demand.relationship!.id}/feedback`, "POST", { continueIntent: "continue", reasonCodes: ["teacher_fit"] }); })}>满意并继续</button><button className="button button-secondary" disabled={busy} type="button" onClick={() => void run(async () => { await api(`/relationships/${demand.relationship!.id}/feedback`, "POST", { continueIntent: "pause", reasonCodes: ["schedule_change"] }); })}>暂停并反馈</button><button className="button button-secondary" disabled={busy} type="button" onClick={() => void run(async () => { await api(`/relationships/${demand.relationship!.id}/feedback`, "POST", { continueIntent: "rematch", reasonCodes: ["schedule_change"] }); }, "已生成关联原需求的新草稿，请重新结构化并确认")}>换老师并生成新需求</button></div></div>
            </div>)}
            {demands.every((demand) => !demand.relationship) && <div className="empty-state"><strong>还没有教学关系</strong><p>双方确认见面后，课次确认和家长反馈会在这里开放。</p></div>}
          </section>
        </div>}

        {user?.role === "teacher" && <div className="role-workspace">
          <section className="card"><div className="section-heading"><div><span className="eyebrow">01 · 教师档案</span><h2>审核状态与可授时间</h2><p>只有审核通过且 30 天内更新可用性的教师会进入推荐。</p></div><StatusPill value={teacherData.profile?.reviewStatus ?? "unknown"} /></div><div className="availability-bar"><span>最近更新：{teacherData.profile ? new Date(teacherData.profile.availabilityUpdatedAt).toLocaleString("zh-CN") : "无档案"}</span><label htmlFor="teacher-capacity">最大容量</label><select id="teacher-capacity" value={capacity} onChange={(event) => setCapacity(Number(event.target.value))}>{[4, 6, 8, 10, 12].map((value) => <option key={value} value={value}>{value} 个关系</option>)}</select><button className="button button-secondary" disabled={busy || !teacherData.profile} type="button" onClick={() => void run(async () => { await api("/teacher/availability", "POST", { availability: teacherData.profile!.availability, maxCapacity: capacity }); }, "可授时间与容量已刷新")}>刷新可授时间与容量</button></div></section>

          <section className="card"><div className="section-heading"><div><span className="eyebrow">02 · 响应与见面</span><h2>可以拒单，也必须处理异常</h2></div></div><div className="record-list">{teacherData.invitations.map((invitation) => <div className="record-row" key={invitation.id}><div><strong>脱敏需求 · {invitation.demandId.slice(0, 8)}</strong><p>{invitation.status} · {invitation.meeting?.status ?? "未预约"}</p>{invitation.declineReason && <small>拒单原因：{invitation.declineReason}</small>}</div><div className="button-row">{invitation.status === "invited" && <><button className="button button-primary" disabled={busy} type="button" onClick={() => void run(async () => { await api(`/invitations/${invitation.id}/accept`, "POST"); })}>接受邀请</button><button className="button button-secondary" disabled={busy} type="button" onClick={() => void run(async () => { await api(`/invitations/${invitation.id}/decline`, "POST", { reason: "可授时间不匹配" }); })}>拒绝邀请</button></>}{invitation.meeting?.status === "scheduled" && <><button className="button button-primary" disabled={busy} type="button" onClick={() => void run(async () => { await api(`/meetings/${invitation.meeting!.id}/outcome`, "POST", { continueIntent: true }); }, "教师见面意愿已保存；仍需家长确认")}>确认见面完成</button><button className="button button-secondary" disabled={busy} type="button" onClick={() => void run(async () => { await api(`/meetings/${invitation.meeting!.id}/exception`, "POST", { action: "no_show", reason: "教师登记见面异常", noShowParty: "unknown" }); })}>登记见面异常</button></>}</div></div>)}{teacherData.invitations.length === 0 && <div className="empty-state"><strong>暂无候选邀请</strong><p>家长发出邀请后，可在这里接受、拒绝或处理见面。</p></div>}</div></section>

          <section className="card"><div className="section-heading"><div><span className="eyebrow">03 · 教学交付</span><h2>关系备课、记课与教师审核</h2><p>备课卡属于教学关系；学习状态未经教师确认时保持 unverified。</p></div></div>{teacherData.relationships.map((relationship) => <div className="relationship-block" key={relationship.id}><div className="relationship-head"><div><Users size={18} /><strong>教学关系 {relationship.id.slice(0, 8)}</strong></div><span className="badge">订单 {relationship.orders[0]?.status ?? "无"}</span></div><div className="button-row"><button className="button button-secondary" disabled={busy} type="button" onClick={() => void run(async () => { const artifact = await api<Artifact>(`/relationships/${relationship.id}/prep`, "POST"); setEdits((previous) => ({ ...previous, [artifact.id]: artifact.content })); })}><ClipboardCheck size={16} />生成关系备课卡</button>{relationship.orders.some((order) => order.status === "paid") && <button className="button button-secondary" disabled={busy} type="button" onClick={() => void run(async () => { await api(`/relationships/${relationship.id}/lessons`, "POST", { objective: "用一次函数描述变化", evidence: "学生独立完成一道变式题，并说明斜率含义", nextPlan: "先无提示回忆，再做跨情境复核" }); }, "课次已记为 completion_marked，等待家长或运营确认")}><ClipboardCheck size={16} />记录第 {relationship.lessons.length + 1} 课</button>}</div>
              {(relationship.artifacts ?? []).filter((artifact) => artifact.kind === "prep").map((artifact) => <div className="ai-review" key={artifact.id}><div className="ai-review-meta"><span className="badge badge-warning">关系备课卡 · {artifact.status}</span><span>{artifact.provider} · {artifact.model}</span></div><div className="field"><label htmlFor={`edit-${artifact.id}`}>教师审核后的备课卡</label><textarea id={`edit-${artifact.id}`} rows={6} value={edits[artifact.id] ?? artifact.content} onChange={(event) => setEdits((previous) => ({ ...previous, [artifact.id]: event.target.value }))} /></div>{artifact.status !== "confirmed" && <button className="button button-primary" disabled={busy} type="button" onClick={() => confirmArtifact(artifact)}><Check size={16} />确认备课卡</button>}</div>)}
              {relationship.lessons.map((lesson) => <article className="lesson-card" key={lesson.id}><div className="lesson-number">{lesson.status === "completed" ? `第 ${lesson.sequence} 课` : "待确认"}</div><div className="lesson-content"><h3>{lesson.objective}</h3><p>{lesson.evidence}</p><StatusPill value={lesson.status} /><div className="button-row">{!(lesson.artifacts ?? []).some((artifact) => artifact.kind === "report") && <button className="button button-primary" disabled={busy} type="button" onClick={() => void run(async () => { const artifact = await api<Artifact>(`/lessons/${lesson.id}/artifacts`, "POST", { kind: "report" }); setEdits((previous) => ({ ...previous, [artifact.id]: artifact.content })); })}><Sparkles size={16} />生成报告 Mock 草稿</button>}{!(lesson.artifacts ?? []).some((artifact) => artifact.kind === "learning_state") && <button className="button button-secondary" disabled={busy} type="button" onClick={() => void run(async () => { const artifact = await api<Artifact>(`/lessons/${lesson.id}/artifacts`, "POST", { kind: "learning_state" }); setEdits((previous) => ({ ...previous, [artifact.id]: artifact.content })); })}>生成学习状态草稿</button>}</div>{(lesson.artifacts ?? []).map((artifact) => <div className="ai-review" key={artifact.id}><div className="ai-review-meta"><span className="badge badge-warning">{artifact.kind === "report" ? "课后报告" : "学习状态"} · {artifact.status}</span><span>{artifact.provider} · {artifact.model}{artifact.rawContent && artifact.rawContent !== artifact.content ? " · 教师已修改" : ""}</span></div><div className="field"><label htmlFor={`edit-${artifact.id}`}>教师审核后的{artifact.kind === "report" ? "报告" : "学习状态"}</label><textarea id={`edit-${artifact.id}`} rows={6} value={edits[artifact.id] ?? artifact.content} onChange={(event) => setEdits((previous) => ({ ...previous, [artifact.id]: event.target.value }))} /></div>{artifact.status !== "confirmed" && <button className="button button-primary" disabled={busy} type="button" onClick={() => confirmArtifact(artifact)}><Check size={16} />{artifact.kind === "report" ? "确认并发布给家长" : "教师确认学习状态"}</button>}</div>)}</div></article>)}</div>)}{teacherData.relationships.length === 0 && <div className="empty-state"><strong>还没有教学关系</strong><p>双方都确认继续后，记课、备课与 AI 审核会在这里开放。</p></div>}</section>

          <section className="card"><div className="section-heading"><div><span className="eyebrow">04 · 模型网关</span><h2><Settings2 size={21} />模型配置 / BYOK</h2><p>当前 {modelSettings.mode} · 已保存密钥：{modelSettings.hasKey ? "是" : "否"}。密钥提交后立即从输入框清除，不回显、不写 localStorage。</p></div></div><div className="form-grid"><div className="field"><label htmlFor="base-url">OpenAI 兼容 Base URL</label><input id="base-url" value={modelSettings.baseUrl} onChange={(event) => setModelSettings({ ...modelSettings, baseUrl: event.target.value })} placeholder="https://api.openai.com/v1" /></div><div className="field"><label htmlFor="model-name">Model</label><input id="model-name" value={modelSettings.model} onChange={(event) => setModelSettings({ ...modelSettings, model: event.target.value })} /></div><div className="field field-full"><label htmlFor="byok-key">API Key</label><input id="byok-key" type="password" autoComplete="off" value={modelSettings.apiKey} onChange={(event) => setModelSettings({ ...modelSettings, apiKey: event.target.value })} /></div></div><div className="button-row mt"><button className="button button-secondary" disabled={busy} type="button" onClick={() => void run(async () => { await api("/ai/settings", "PUT", { mode: "mock" }); })}>使用本地 Mock</button><button className="button button-primary" disabled={busy} type="button" onClick={() => { const apiKey = modelSettings.apiKey; setModelSettings((previous) => ({ ...previous, apiKey: "" })); void run(async () => { await api("/ai/settings", "PUT", { mode: "byok", baseUrl: modelSettings.baseUrl, model: modelSettings.model, ...(apiKey ? { apiKey } : {}) }); }); }}>加密保存 BYOK</button></div></section>
        </div>}

        {user?.role === "ops" && <div className="role-workspace">
          <section className="card"><div className="section-heading"><div><span className="eyebrow">01 · 30 日复盘</span><h2>成熟 cohort 与 AI 质量</h2><p>未满 30 天的需求只看过程；北极星只使用成熟需求、已支付关系与同师第四次已完成课。</p></div><button className="button button-secondary" disabled={busy || !analytics?.recommendation.latestRunId} type="button" onClick={() => void run(async () => { const result = await api<{ matches: boolean }>(`/analytics/replay/${analytics!.recommendation.latestRunId}`); setReplayMatches(result.matches); })}><RotateCcw size={16} />回放最新推荐规则</button></div>
            {analytics && <><div className="metric-grid"><div className="metric-card"><span>近 30 日需求 / 成熟需求</span><strong>{analytics.cohort30d.recentDemandCount} <small>/ {analytics.cohort30d.matureDemandCount}</small></strong></div><div className="metric-card"><span>过程指标 · 第二课</span><strong>{analytics.cohort30d.secondLessonCount}</strong></div><div className="metric-card"><span>成熟 cohort · 第四课</span><strong>{analytics.cohort30d.fourthLessonCount}</strong></div><div className="metric-card metric-accent"><span>北极星</span><strong>{analytics.cohort30d.northStarRate === null ? "待成熟" : `${(analytics.cohort30d.northStarRate * 100).toFixed(1)}%`}</strong></div><div className="metric-card"><span>AI 教师确认率</span><strong>{(analytics.ai.confirmationRate * 100).toFixed(1)}%</strong></div></div><div className="ops-footnote"><span>7 日探索候选返回占比 {(analytics.recommendation.explorationReturnRate7d * 100).toFixed(1)}%，上限 20%</span>{replayMatches !== null && <span className={replayMatches ? "replay-success" : "replay-failure"}>{replayMatches ? <><CircleCheck size={15} />回放一致</> : <><AlertTriangle size={15} />回放不一致</>}</span>}</div></>}
          </section>

          <div className="grid-2"><section className="card"><div className="section-heading"><div><span className="eyebrow">02 · 教师准入</span><h2>审核、拒绝与暂停</h2></div></div><div className="record-list">{opsTeachers.map((teacher) => <div className="record-row" key={teacher.id}><div><strong>{teacher.displayName}</strong><p>{teacher.id} · {teacher.reviewStatus}</p>{teacher.reviewNote && <small>{teacher.reviewNote}</small>}</div><div className="button-row">{teacher.reviewStatus !== "approved" && <button className="button button-primary" disabled={busy} type="button" onClick={() => void run(async () => { await api(`/teachers/${teacher.id}/review`, "POST", { action: "approve", reason: "合成材料与试讲均已复核" }); }, `${teacher.displayName} 已审核通过`)}>审核通过</button>}{teacher.reviewStatus === "approved" && <button className="button button-secondary" disabled={busy} type="button" onClick={() => void run(async () => { await api(`/teachers/${teacher.id}/review`, "POST", { action: "suspend", reason: "暂停接收新需求" }); })}>暂停接单</button>}</div></div>)}</div></section>
            <section className="card"><div className="section-heading"><div><span className="eyebrow">03 · 人工改派</span><h2>追加决定，不改历史得分</h2><p>仅记录运营改派原因；原 RecommendationRun 与评分明细保持不变。</p></div></div><div className="field"><label htmlFor="override-teacher">改派至已审核教师</label><select id="override-teacher" value={overrideTeacherId} onChange={(event) => setOverrideTeacherId(event.target.value)}>{opsTeachers.filter((teacher) => teacher.reviewStatus === "approved").map((teacher) => <option value={teacher.id} key={teacher.id}>{teacher.displayName} · {teacher.id}</option>)}</select></div><button className="button button-primary mt" disabled={busy || !analytics?.recommendation.latestRunId} type="button" onClick={() => void run(async () => { await api(`/recommendations/${analytics!.recommendation.latestRunId}/overrides`, "POST", { toTeacherId: overrideTeacherId, reasonCode: "supply_review", reasonText: "运营基于合成供给情况人工改派" }); }, "人工改派已追加事件，原推荐结果未修改")}>提交人工改派</button></section></div>

          <section className="card"><div className="section-heading"><div><span className="eyebrow">04 · AI 质量门禁</span><h2>人工评测与教师审核分开留痕</h2><p>这里只记录评测结果、规则版本与严重错误标记，不把报告全文复制进事件。</p></div></div>{opsArtifacts.length ? <div className="availability-bar"><div className="field"><label htmlFor="review-artifact">已确认 AI Artifact</label><select id="review-artifact" value={reviewArtifactId} onChange={(event) => setReviewArtifactId(event.target.value)}>{opsArtifacts.map((artifact) => <option value={artifact.id} key={artifact.id}>{artifact.kind} · {artifact.model} · {artifact.id.slice(0, 8)}</option>)}</select></div><button className="button button-primary" disabled={busy || !reviewArtifactId} type="button" onClick={() => void run(async () => { await api(`/artifacts/${reviewArtifactId}/review`, "POST", { resultCode: "pass", severeErrorFlag: false, evaluationSetVersion: "demo_eval_v1", rubricVersion: "rubric_v1" }); }, "AI 质量评审已追加事件")}>记录评审通过</button><button className="button button-secondary" disabled={busy || !reviewArtifactId} type="button" onClick={() => void run(async () => { await api(`/artifacts/${reviewArtifactId}/review`, "POST", { resultCode: "needs_revision", severeErrorFlag: true, evaluationSetVersion: "demo_eval_v1", rubricVersion: "rubric_v1" }); }, "严重错误评审已记录，不会修改教师原稿")}>记录严重错误</button></div> : <div className="empty-state"><strong>暂无可评审 Artifact</strong><p>教师确认备课卡或报告后，可在这里追加运营质量评测。</p></div>}</section>

          <div className="ops-grid"><section className="card"><div className="section-heading"><div><span className="eyebrow">05 · 异常处理</span><h2>运营异常队列</h2></div></div>{analytics?.exceptions.length ? <ul className="exception-list">{analytics.exceptions.map((exception) => <li key={`${exception.type}-${exception.entityId}`}><strong>{exception.type}</strong><p>{exception.reason}</p></li>)}</ul> : <div className="empty-state"><strong>当前无运营异常</strong><p>已支付未记课、超时邀请与未审核 AI 草稿会在这里出现。</p></div>}</section>
            <section className="card"><div className="section-heading"><div><span className="eyebrow">06 · 事件字典</span><h2>完整持久事件审计</h2><p>每条事件均带 schemaVersion、幂等键、receivedAt 与来源。</p></div></div><div className="table-wrap"><table className="status-table"><thead><tr><th>事件</th><th>实体 / 来源</th><th>时间</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td><code>{event.name}</code><br /><span className="muted">{event.schemaVersion}</span></td><td>{event.entityType}<br /><span className="muted">{event.entityId.slice(0, 12)} · {event.source}</span></td><td>{new Date(event.occurredAt).toLocaleString("zh-CN")}</td></tr>)}</tbody></table></div></section></div>
        </div>}

        <footer className="server-footer"><ShieldCheck size={16} /><p>数据库状态是真相源，刷新后可重新登录继续。真实托管模型、真实支付和真实会议仍需供应商凭据与生产适配验证。</p></footer>
      </div>
    </main>
  );
}
