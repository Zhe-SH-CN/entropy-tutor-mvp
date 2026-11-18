"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createDemandSchema, rankCandidates, timeSlotSchema, type Demand, type TimeSlot } from "@mvp/shared";
import { createInitialState, demoTeachers } from "@/lib/demo-data";
import type { AIKind, DemoEvent, DemoState, LearningStatus } from "@/lib/types";

const STORAGE_KEY = "entropy-tutor-demo-v1";

const mockContent: Record<AIKind, string> = {
  prep: `【下一课目标】\n1. 学生能独立判断一次函数图象与参数变化。\n2. 学生能说明错题属于概念、方法还是计算问题。\n\n【承接证据】\n上一课 3 道变式题中，学生在无提示条件下完成 2 道；错误集中于斜率符号。\n\n【课堂流程】\n5 分钟独立回忆 → 10 分钟错题复述 → 20 分钟变式练习 → 15 分钟无提示检测 → 10 分钟总结。\n\n【待教师确认】\n题目难度是否符合学生当前教材进度；不得把本草稿直接发布给家长。`,
  quiz: `【AI 出题草稿｜教师专用】\n1. 已知 y=2x+b 经过点 (1,5)，求 b，并解释每一步依据。\n2. 将上题斜率改为 -2，图象如何变化？请先独立作图再说明。\n3. 给出一个含一次函数的实际计费场景，要求学生列式、求解并检查定义域。\n\n【评分 Rubric】\n列式 40%｜推理 30%｜计算 20%｜独立检查 10%。答案与解析仅用于教师审核，不自动推送学生。`,
  report: `【家长报告草稿｜待教师确认】\n本课围绕一次函数图象与参数变化展开。学生能够在提示后修正斜率符号错误，并在两道同类题中独立完成一道。\n\n证据：课堂练习第 2、4 题；离开 AI 提示后的独立检测结果。\n下一步：下一课前 10 分钟进行无提示回忆，再决定是否进入综合应用题。\n\n说明：本报告不声称短期提分，不包含模型自动生成的教师评分。`,
  learning_state: `【学习状态建议｜unverified】\n知识点：一次函数斜率与图象。\n观察证据：变式题第 2 题首次作答错误，独立重做正确；样本仅 1 次。\n建议状态：needs_recheck，而非“已掌握”。建议下一课用一道不同情境题复核。`,
};

interface DemoContextValue {
  state: DemoState;
  submitDemand: (demand: Demand) => boolean;
  inviteTeacher: (teacherId: string) => void;
  respondInvitation: (teacherId: string, accept: boolean) => void;
  scheduleMeeting: (teacherId: string) => void;
  completeMeeting: (teacherId: string) => void;
  paySandbox: () => void;
  updateAvailability: (teacherId: string, slots: TimeSlot[]) => boolean;
  recordLesson: (objective: string, evidence: string, nextPlan: string) => boolean;
  generateDraft: (kind: AIKind) => void;
  updateDraft: (kind: AIKind, content: string) => void;
  confirmDraft: (kind: AIKind) => void;
  advanceLearningState: () => void;
  reassign: (teacherId: string, reason: string) => boolean;
  resetDemo: () => void;
}

const DemoContext = createContext<DemoContextValue | null>(null);

const event = (
  name: string,
  actorRole: DemoEvent["actorRole"],
  entityId: string,
  detail: string,
): DemoEvent => ({
  id: globalThis.crypto?.randomUUID() ?? `evt-${Date.now()}`,
  name,
  actorRole,
  entityId,
  occurredAt: new Date().toISOString(),
  detail,
});

const appendEvent = (state: DemoState, nextEvent: DemoEvent, lastAction: string): DemoState => ({
  ...state,
  events: [...state.events, nextEvent].slice(-200),
  lastAction,
});

const isRestorableState = (value: unknown): value is DemoState => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DemoState>;
  return (
    candidate.schemaVersion === 1 &&
    typeof candidate.demand?.id === "string" &&
    Array.isArray(candidate.events) &&
    Array.isArray(candidate.recommendation?.candidates)
  );
};

export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DemoState>(createInitialState);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (isRestorableState(parsed)) setState(parsed);
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    } finally {
      setRestored(true);
    }
  }, []);

  useEffect(() => {
    if (restored) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [restored, state]);

  const submitDemand = useCallback((demand: Demand) => {
    const parsed = createDemandSchema.safeParse(demand);
    if (!parsed.success) {
      setState((previous) => ({ ...previous, lastAction: parsed.error.issues[0]?.message ?? "需求输入无效" }));
      return false;
    }
    setState((previous) => {
      const teachers = demoTeachers.map((teacher) => ({
        ...teacher,
        availability: previous.availabilityOverrides[teacher.id] ?? teacher.availability,
      }));
      const recommendation = rankCandidates(demand, teachers, {
        generatedAt: new Date().toISOString(),
      });
      const next = {
        ...previous,
        demand,
        recommendation,
        invitations: {},
        meetings: {},
        selectedTeacherId: null,
        orderStatus: "none" as const,
      };
      return appendEvent(
        next,
        event("CandidateRanked", "system", demand.id, `${recommendation.candidates.length} 名候选；${recommendation.ruleVersion}。`),
        recommendation.candidates.length > 0 ? "需求已确认，Top 3 已按 rule_v0.2 重算" : recommendation.diagnostics.message,
      );
    });
    return true;
  }, []);

  const inviteTeacher = useCallback((teacherId: string) => {
    setState((previous) => {
      if (!previous.recommendation.candidates.some((candidate) => candidate.teacherId === teacherId)) {
        return { ...previous, lastAction: "该教师不在当前候选结果中" };
      }
      if (previous.invitations[teacherId] === "invited") {
        return { ...previous, lastAction: "邀请已发送，无需重复操作" };
      }
      const next = {
        ...previous,
        invitations: { ...previous.invitations, [teacherId]: "invited" as const },
      };
      return appendEvent(next, event("InvitationSent", "parent", teacherId, "已发送包含具体时段与报价的邀请。"), "邀请已发送，教师端现在可以响应");
    });
  }, []);

  const respondInvitation = useCallback((teacherId: string, accept: boolean) => {
    setState((previous) => {
      if (previous.invitations[teacherId] !== "invited") {
        return { ...previous, lastAction: "邀请状态已变化，请刷新后重试" };
      }
      const status = accept ? "accepted" as const : "declined" as const;
      const next = { ...previous, invitations: { ...previous.invitations, [teacherId]: status } };
      return appendEvent(
        next,
        event(accept ? "InvitationAccepted" : "InvitationDeclined", "teacher", teacherId, accept ? "教师接受邀请，等待家长确认免费见面。" : "教师拒绝邀请，未创建见面或订单。"),
        accept ? "教师已接受，请回到家长端确认 15 分钟见面" : "教师已拒绝邀请",
      );
    });
  }, []);

  const scheduleMeeting = useCallback((teacherId: string) => {
    setState((previous) => {
      if (previous.invitations[teacherId] !== "accepted") {
        return { ...previous, lastAction: "只有已接受邀请的教师可以预约见面" };
      }
      const next = {
        ...previous,
        selectedTeacherId: teacherId,
        orderStatus: "none" as const,
        meetings: { ...previous.meetings, [teacherId]: "scheduled" as const },
      };
      return appendEvent(next, event("MeetingBooked", "parent", teacherId, "15 分钟线上见面已预约；未产生支付。"), "免费见面已预约，教师端可完成见面");
    });
  }, []);

  const completeMeeting = useCallback((teacherId: string) => {
    setState((previous) => {
      if (previous.meetings[teacherId] !== "scheduled") {
        return { ...previous, lastAction: "见面尚未预约或已经完成" };
      }
      const next = { ...previous, meetings: { ...previous.meetings, [teacherId]: "completed" as const } };
      return appendEvent(next, event("MeetingCompleted", "teacher", teacherId, "双方完成见面，家长可进入沙箱支付演示。"), "见面已完成，家长端现在可以体验沙箱支付");
    });
  }, []);

  const paySandbox = useCallback(() => {
    setState((previous) => {
      const teacherId = previous.selectedTeacherId;
      if (!teacherId || previous.meetings[teacherId] !== "completed") {
        return { ...previous, lastAction: "必须先完成免费见面" };
      }
      if (previous.orderStatus === "paid_sandbox") {
        return { ...previous, lastAction: "沙箱订单已支付，重复点击未产生新订单" };
      }
      const next = { ...previous, orderStatus: "paid_sandbox" as const };
      return appendEvent(next, event("PaymentOrderPaid", "system", "order-sandbox-001", "Sandbox 支付成功；不代表真实收款或真实会议资源。"), "沙箱首课订单已支付，未发生真实扣款");
    });
  }, []);

  const updateAvailability = useCallback((teacherId: string, slots: TimeSlot[]) => {
    if (slots.length === 0 || slots.length > 10 || slots.some((slot) => !timeSlotSchema.safeParse(slot).success)) {
      setState((previous) => ({ ...previous, lastAction: "至少保留一个有效时段，最多 10 个" }));
      return false;
    }
    setState((previous) => {
      const next = {
        ...previous,
        availabilityOverrides: { ...previous.availabilityOverrides, [teacherId]: slots },
      };
      return appendEvent(next, event("TeacherAvailabilityUpdated", "teacher", teacherId, `保存 ${slots.length} 个可约时段；需重算需求后影响候选。`), "可用时间已保存，请回到家长端重算 Top 3");
    });
    return true;
  }, []);

  const recordLesson = useCallback((objective: string, evidence: string, nextPlan: string) => {
    if (objective.trim().length < 4 || evidence.trim().length < 8 || nextPlan.trim().length < 4) {
      setState((previous) => ({ ...previous, lastAction: "请完整填写教学目标、课堂证据和下一步计划" }));
      return false;
    }
    setState((previous) => {
      if (previous.orderStatus !== "paid_sandbox" || !previous.selectedTeacherId) {
        return { ...previous, lastAction: "沙箱首课支付后才可确认新正式课" };
      }
      const note = {
        id: globalThis.crypto?.randomUUID() ?? `lesson-${Date.now()}`,
        objective: objective.trim(),
        evidence: evidence.trim(),
        nextPlan: nextPlan.trim(),
        confirmedAt: new Date().toISOString(),
      };
      const next = {
        ...previous,
        lessonNotes: [...previous.lessonNotes, note],
        drafts: { ...previous.drafts, report: { ...previous.drafts.report, status: "empty" as const } },
      };
      return appendEvent(next, event("LessonConfirmed", "teacher", note.id, "结构化课次已保存；报告仍需单独生成与确认。"), "课次已确认，请生成并审核家长报告");
    });
    return true;
  }, []);

  const generateDraft = useCallback((kind: AIKind) => {
    setState((previous) => {
      const current = previous.drafts[kind];
      const next = {
        ...previous,
        drafts: {
          ...previous.drafts,
          [kind]: { ...current, content: mockContent[kind], status: "draft" as const, version: current.version + 1 },
        },
      };
      return appendEvent(next, event("ArtifactDraftGenerated", "teacher", kind, "明确标识的本地 Mock 草稿，未调用外部模型。"), "Mock 草稿已生成，请教师审核后确认");
    });
  }, []);

  const updateDraft = useCallback((kind: AIKind, content: string) => {
    setState((previous) => ({
      ...previous,
      drafts: {
        ...previous.drafts,
        [kind]: { ...previous.drafts[kind], content, status: "draft" as const },
      },
      lastAction: "草稿已修改；需要重新确认后才能发布",
    }));
  }, []);

  const confirmDraft = useCallback((kind: AIKind) => {
    setState((previous) => {
      if (previous.drafts[kind].content.trim().length < 20) {
        return { ...previous, lastAction: "草稿内容过短，不能确认" };
      }
      const next = {
        ...previous,
        drafts: { ...previous.drafts, [kind]: { ...previous.drafts[kind], status: "confirmed" as const } },
      };
      return appendEvent(next, event("ArtifactConfirmed", "teacher", kind, "教师已确认内容；仅报告草稿会对家长可见。"), kind === "report" ? "报告已确认，家长端现在可见" : "内容已由教师确认");
    });
  }, []);

  const advanceLearningState = useCallback(() => {
    setState((previous) => {
      const nextStatus: Record<LearningStatus, LearningStatus> = {
        unverified: "teacher_confirmed",
        teacher_confirmed: "needs_recheck",
        needs_recheck: "resolved",
        resolved: "needs_recheck",
      };
      const status = nextStatus[previous.learningStatus];
      const next = { ...previous, learningStatus: status };
      return appendEvent(next, event("LearningStateReviewed", "teacher", "knowledge-linear-function", `学习状态更新为 ${status}；不生成自动掌握百分比。`), `学习状态已更新为 ${status}`);
    });
  }, []);

  const reassign = useCallback((teacherId: string, reason: string) => {
    if (reason.trim().length < 3) {
      setState((previous) => ({ ...previous, lastAction: "改派原因至少填写 3 个字符" }));
      return false;
    }
    setState((previous) => {
      if (!previous.recommendation.candidates.some((candidate) => candidate.teacherId === teacherId)) {
        return { ...previous, lastAction: "只能改派到当前合格候选" };
      }
      const fromTeacherId = previous.selectedTeacherId ?? "尚未选择";
      const next = {
        ...previous,
        selectedTeacherId: teacherId,
        orderStatus: "none" as const,
        exceptionQueue: previous.exceptionQueue.filter((item) => !item.includes("未响应")),
      };
      return appendEvent(next, event("TeacherReassigned", "ops", teacherId, `从 ${fromTeacherId} 改派；原因：${reason.trim()}`), "改派已生效并写入审计事件");
    });
    return true;
  }, []);

  const resetDemo = useCallback(() => setState(createInitialState()), []);

  const value = useMemo<DemoContextValue>(() => ({
    state,
    submitDemand,
    inviteTeacher,
    respondInvitation,
    scheduleMeeting,
    completeMeeting,
    paySandbox,
    updateAvailability,
    recordLesson,
    generateDraft,
    updateDraft,
    confirmDraft,
    advanceLearningState,
    reassign,
    resetDemo,
  }), [state, submitDemand, inviteTeacher, respondInvitation, scheduleMeeting, completeMeeting, paySandbox, updateAvailability, recordLesson, generateDraft, updateDraft, confirmDraft, advanceLearningState, reassign, resetDemo]);

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo(): DemoContextValue {
  const context = useContext(DemoContext);
  if (!context) throw new Error("useDemo must be used within DemoProvider");
  return context;
}
