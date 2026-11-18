import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { createDemandSchema, rankCandidates, type Demand, type RecommendationResult, type Teacher as RuleTeacher } from "@mvp/shared";
import { PrismaService } from "../prisma.service";
import { EventsService } from "../events.service";
import type { AuthUser } from "../auth/auth.service";

const asJson = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;
const id = () => randomUUID();
const demandInputSchema = createDemandSchema.and(z.object({ rawText: z.string().trim().max(5000).optional() }));
const lessonSchema = z.object({ objective: z.string().trim().min(4).max(300), evidence: z.string().trim().min(8).max(3000), nextPlan: z.string().trim().min(4).max(1000), scheduledAt: z.string().datetime().optional() });
const reasonSchema = z.object({ reason: z.string().trim().min(2).max(500) });
const orderSchema = z.object({ lessonCount: z.number().int().min(1).max(4).default(1) });
const reviewSchema = z.object({ action: z.enum(["approve", "reject", "suspend"]), reason: z.string().trim().min(2).max(500) });
const slotSchema = z.object({ day: z.number().int().min(0).max(6), startMinute: z.number().int().min(0).max(1439), endMinute: z.number().int().min(1).max(1440) }).refine((slot) => slot.endMinute > slot.startMinute, "结束时间必须晚于开始时间");
const availabilitySchema = z.object({ availability: z.array(slotSchema).min(1).max(30), maxCapacity: z.number().int().min(1).max(50) });
const outcomeSchema = z.object({ continueIntent: z.boolean(), reason: z.string().trim().max(500).optional() });
const meetingExceptionSchema = z.object({ action: z.enum(["reschedule", "cancel", "no_show"]), reason: z.string().trim().min(2).max(500), noShowParty: z.enum(["parent", "teacher", "both", "unknown"]).optional() });
const feedbackSchema = z.object({ lessonId: z.string().optional(), continueIntent: z.enum(["continue", "pause", "rematch"]), reasonCodes: z.array(z.enum(["teacher_fit", "schedule_change", "price", "learning_goal", "other"])).max(8).default([]), comment: z.string().trim().max(1000).optional() });
const overrideSchema = z.object({ fromTeacherId: z.string().optional(), toTeacherId: z.string().min(1), reasonCode: z.string().trim().min(2).max(60), reasonText: z.string().trim().min(2).max(500) });
const qualityReviewSchema = z.object({ resultCode: z.enum(["pass", "needs_revision", "reject"]), severeErrorFlag: z.boolean(), evaluationSetVersion: z.string().trim().min(2).max(60).default("demo_eval_v1"), rubricVersion: z.string().trim().min(2).max(60).default("rubric_v1") });

@Injectable()
export class DemoService {
  constructor(private readonly prisma: PrismaService, private readonly events: EventsService) {}

  async bootstrap(user: AuthUser) {
    if (user.role === "parent") {
      return this.prisma.demand.findMany({
        where: { parentId: user.id },
        include: {
          recommendations: { orderBy: { createdAt: "desc" }, take: 1 },
          invitations: { include: { teacher: true, meeting: true } },
          relationship: { include: { teacher: true, orders: true, lessons: { include: { artifacts: true }, orderBy: { createdAt: "asc" } }, artifacts: true, feedback: true, learningStates: true } },
        },
        orderBy: { createdAt: "desc" },
      });
    }
    if (user.role === "teacher") {
      const teacherId = user.teacherId ?? "none";
      const [invitations, relationships, profile] = await Promise.all([
        this.prisma.invitation.findMany({ where: { teacherId }, include: { demand: true, meeting: true }, orderBy: { createdAt: "desc" } }),
        this.prisma.relationship.findMany({ where: { teacherId }, include: { demand: true, orders: true, lessons: { include: { artifacts: true }, orderBy: { createdAt: "asc" } }, artifacts: true, feedback: true, learningStates: true }, orderBy: { createdAt: "desc" } }),
        this.prisma.teacher.findUnique({ where: { id: teacherId } }),
      ]);
      return { invitations, relationships, profile };
    }
    const events = await this.prisma.eventLog.findMany({ orderBy: { occurredAt: "desc" }, take: 100 });
    return events.map((event) => ({ ...event, event_id: event.id, event_name: event.name, schema_version: event.schemaVersion, occurred_at: event.occurredAt, received_at: event.receivedAt, actor_type: event.actorType, actor_id: event.actorId, idempotency_key: event.idempotencyKey }));
  }

  async createDemand(user: AuthUser, body: unknown) {
    const parsed = demandInputSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues.map((issue) => issue.message));
    const { rawText = "", ...data } = parsed.data;
    const demand = await this.prisma.demand.create({ data: { id: id(), parentId: user.id, subject: data.subject, gradeBand: data.gradeBand, mode: data.mode, areaCode: data.areaCode, budgetMinFen: data.budgetMinFen, budgetMaxFen: data.budgetMaxFen, lessonMinutes: data.lessonMinutes, preferredSlots: asJson(data.preferredSlots), objectives: asJson(data.objectives), requiredExperience: asJson(data.requiredExperience), preferenceTags: asJson(data.preferenceTags), rawText, status: "draft" } });
    await this.events.record(this.prisma, { idempotencyKey: `demand:${demand.id}:submitted`, name: "demand_submitted", actorId: user.id, entityType: "demand", entityId: demand.id, payload: { synthetic: true, subject: data.subject, grade: data.gradeBand, budgetBand: `${data.budgetMinFen}_${data.budgetMaxFen}`, mode: data.mode, slotCount: data.preferredSlots.length } });
    return demand;
  }

  async structureDemand(demandId: string, user: AuthUser) {
    const demand = await this.ownedDemand(demandId, user);
    if (!["draft", "submitted"].includes(demand.status)) throw new ConflictException("当前需求无需重复结构化");
    const structuredPayload = { method: "mock_structurer", schemaVersion: "v0.2", unknownFields: [], fields: this.toDemand(demand) };
    const updated = await this.prisma.demand.update({ where: { id: demandId }, data: { status: "submitted", structuredPayload: asJson(structuredPayload) } });
    await this.events.record(this.prisma, { idempotencyKey: `demand:${demandId}:structured`, name: "demand_structured", actorId: user.id, entityType: "demand", entityId: demandId, payload: { method: "mock_structurer", unknownFields: [], generationId: null } });
    return updated;
  }

  async confirmDemand(demandId: string, user: AuthUser) {
    const demand = await this.ownedDemand(demandId, user);
    if (demand.status === "confirmed") return demand;
    if (demand.status !== "submitted" || !demand.structuredPayload) throw new ConflictException("请先完成需求结构化");
    const updated = await this.prisma.demand.update({ where: { id: demandId }, data: { status: "confirmed", confirmedAt: new Date() } });
    await this.events.record(this.prisma, { idempotencyKey: `demand:${demandId}:confirmed`, name: "demand_confirmed", actorId: user.id, entityType: "demand", entityId: demandId, payload: { editedFields: [], validDemandFlag: true } });
    return updated;
  }

  async recommend(demandId: string, user: AuthUser) {
    const startedAt = Date.now();
    const demand = await this.prisma.demand.findUnique({ where: { id: demandId } });
    if (!demand) throw new NotFoundException("需求不存在");
    if (user.role !== "ops" && demand.parentId !== user.id) throw new ForbiddenException("不能访问其他家庭的需求");
    if (!demand.confirmedAt || ["draft", "submitted", "excluded", "closed"].includes(demand.status)) throw new ConflictException("需求尚未由家长确认");
    const teachers = await this.prisma.teacher.findMany({ where: { reviewStatus: "approved", availabilityUpdatedAt: { gte: new Date(Date.now() - 30 * 86400000) } } });
    const ruleDemand = this.toDemand(demand);
    const ruleTeachers = teachers.map((teacher) => this.toTeacher(teacher));
    const recentRuns = await this.prisma.recommendationRun.findMany({ where: { createdAt: { gte: new Date(Date.now() - 7 * 86400000) } }, select: { results: true } });
    const recentCandidates = recentRuns.flatMap((run) => (run.results as unknown as RecommendationResult).candidates);
    const priorExploration = recentCandidates.filter((candidate) => candidate.breakdown.x > 0).length;
    const projectedAllowed = (priorExploration + 1) / (recentCandidates.length + 3) <= 0.2;
    let result = rankCandidates(ruleDemand, ruleTeachers, { generatedAt: new Date().toISOString(), rollingExposureCount: recentCandidates.length, rollingExplorationCount: priorExploration, explorationAllowed: projectedAllowed });
    const returnedExploration = result.candidates.filter((candidate) => candidate.breakdown.x > 0).length;
    if ((priorExploration + returnedExploration) / Math.max(1, recentCandidates.length + result.candidates.length) > 0.2) {
      result = rankCandidates(ruleDemand, ruleTeachers, { generatedAt: new Date().toISOString(), rollingExposureCount: recentCandidates.length, rollingExplorationCount: priorExploration, explorationAllowed: false });
    }
    const run = await this.prisma.recommendationRun.create({ data: { id: id(), demandId, ruleVersion: result.ruleVersion, inputSnapshot: asJson({ demand: ruleDemand, teachers: ruleTeachers, options: { rollingExposureCount: recentCandidates.length, rollingExplorationCount: priorExploration, explorationAllowed: result.diagnostics.explorationAllowed } }), results: asJson(result) } });
    if (demand.status === "confirmed") await this.prisma.demand.update({ where: { id: demandId }, data: { status: "candidates_ready" } });
    await this.events.record(this.prisma, { idempotencyKey: `recommendation:${run.id}:requested`, name: "recommendation_requested", actorId: user.id, entityType: "demand", entityId: demandId, payload: { runId: run.id, triggerType: user.role === "ops" ? "ops_request" : "parent_request", ruleVersion: result.ruleVersion } });
    await this.events.record(this.prisma, { idempotencyKey: `recommendation:${run.id}:completed`, name: "recommendation_completed", actorId: user.id, entityType: "demand", entityId: demandId, payload: { runId: run.id, filterCounts: { eligible: result.diagnostics.eligibleTeacherCount, rejected: result.rejected.length }, returnedCount: result.candidates.length, eligibleCount: result.diagnostics.eligibleTeacherCount, latencyMs: Date.now() - startedAt } });
    return { ...result, runId: run.id };
  }

  async candidateExposed(runId: string, teacherId: string, user: AuthUser) {
    const run = await this.prisma.recommendationRun.findUnique({ where: { id: runId }, include: { demand: true } });
    if (!run || run.demand.parentId !== user.id) throw new ForbiddenException("不能记录其他家庭的候选曝光");
    const result = run.results as unknown as RecommendationResult;
    const index = result.candidates.findIndex((candidate) => candidate.teacherId === teacherId);
    if (index < 0) throw new BadRequestException("教师不在该推荐快照中");
    const candidate = result.candidates[index]!;
    const idempotencyKey = `exposure:${runId}:${teacherId}`;
    const existing = await this.prisma.eventLog.findUnique({ where: { idempotencyKey } });
    if (existing) return { recorded: false };
    try {
      await this.events.record(this.prisma, { idempotencyKey, name: "candidate_exposed", actorId: user.id, source: "client", entityType: "recommendation_run", entityId: runId, payload: { teacherId, rank: index + 1, finalScore: candidate.breakdown.finalScore, scoreVersion: result.ruleVersion, explorationBucket: candidate.breakdown.x > 0 ? "explore" : "exploit" } });
      return { recorded: true };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { recorded: false };
      throw error;
    }
  }

  async invite(demandId: string, teacherId: string, user: AuthUser) {
    const demand = await this.prisma.demand.findUnique({ where: { id: demandId }, include: { recommendations: { orderBy: { createdAt: "desc" }, take: 1 } } });
    if (!demand) throw new NotFoundException("需求不存在");
    if (demand.parentId !== user.id) throw new ForbiddenException("不能操作其他家庭的需求");
    const latest = demand.recommendations[0];
    if (!latest) throw new ConflictException("请先生成候选快照");
    const result = latest.results as unknown as RecommendationResult;
    const selectedCandidate = result.candidates.find((candidate) => candidate.teacherId === teacherId);
    if (!selectedCandidate) throw new ForbiddenException("教师不在最新候选快照中");
    const existing = await this.prisma.invitation.findUnique({ where: { demandId_teacherId: { demandId, teacherId } } });
    if (existing) return existing;
    return this.prisma.$transaction(async (tx) => {
      const invitation = await tx.invitation.create({ data: { id: id(), demandId, teacherId, expiresAt: new Date(Date.now() + 12 * 3600000) } });
      await this.events.record(tx, { idempotencyKey: `invitation:${invitation.id}:sent`, name: "teacher_offer_sent", actorId: user.id, entityType: "invitation", entityId: invitation.id, payload: { demandId, teacherId, slotId: `${selectedCandidate.slot.day}-${selectedCandidate.slot.startMinute}-${selectedCandidate.slot.endMinute}`, quotedPriceFen: selectedCandidate.quotedPriceFen, expiresAt: invitation.expiresAt } });
      await this.events.record(tx, { idempotencyKey: `candidate:${latest.id}:selected:${teacherId}`, name: "candidate_selected", actorId: user.id, entityType: "recommendation_run", entityId: latest.id, payload: { teacherId, rank: result.candidates.indexOf(selectedCandidate) + 1, finalScore: selectedCandidate.breakdown.finalScore, selectionChannel: "top3" } });
      return invitation;
    });
  }

  async accept(invitationId: string, user: AuthUser) {
    const result = await this.prisma.$transaction(async (tx) => {
      const invitation = await tx.invitation.findUnique({ where: { id: invitationId } });
      if (!invitation) throw new NotFoundException("邀请不存在");
      if (invitation.teacherId !== user.teacherId) throw new ForbiddenException("不能响应其他教师的邀请");
      if (invitation.status === "accepted") return { invitation, expired: false };
      if (invitation.status !== "invited") throw new ConflictException("邀请已失效");
      if (invitation.expiresAt && invitation.expiresAt < new Date()) {
        const expired = await tx.invitation.update({ where: { id: invitationId }, data: { status: "expired", respondedAt: new Date() } });
        await this.events.record(tx, { idempotencyKey: `invitation:${invitationId}:expired`, name: "teacher_offer_responded", actorId: null, actorType: "system", source: "worker", entityType: "invitation", entityId: invitationId, payload: { response: "expired", reasonCode: "response_timeout", responseSeconds: Math.max(0, Math.floor((Date.now() - invitation.createdAt.getTime()) / 1000)) } });
        return { invitation: expired, expired: true };
      }
      const updated = await tx.invitation.update({ where: { id: invitationId }, data: { status: "accepted", respondedAt: new Date() } });
      await this.events.record(tx, { idempotencyKey: `invitation:${invitationId}:accepted`, name: "teacher_offer_responded", actorId: user.id, entityType: "invitation", entityId: invitationId, payload: { response: "accepted", reasonCode: "teacher_accepted", responseSeconds: Math.max(0, Math.floor((Date.now() - invitation.createdAt.getTime()) / 1000)) } });
      return { invitation: updated, expired: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (result.expired) throw new ConflictException("邀请已超过 12 小时响应时限");
    return result.invitation;
  }

  async decline(invitationId: string, body: unknown, user: AuthUser) {
    const parsed = reasonSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("拒绝原因必填");
    const invitation = await this.prisma.invitation.findUnique({ where: { id: invitationId } });
    if (!invitation) throw new NotFoundException("邀请不存在");
    if (invitation.teacherId !== user.teacherId) throw new ForbiddenException("不能响应其他教师的邀请");
    if (invitation.status !== "invited") throw new ConflictException("仅待响应邀请可拒绝");
    const updated = await this.prisma.invitation.update({ where: { id: invitationId }, data: { status: "declined", declineReason: parsed.data.reason, respondedAt: new Date() } });
    await this.events.record(this.prisma, { idempotencyKey: `invitation:${invitationId}:declined`, name: "teacher_offer_responded", actorId: user.id, entityType: "invitation", entityId: invitationId, payload: { response: "declined", reasonCode: "teacher_declined", responseSeconds: Math.max(0, Math.floor((Date.now() - invitation.createdAt.getTime()) / 1000)) } });
    return updated;
  }

  async scheduleMeeting(invitationId: string, user: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      const invitation = await tx.invitation.findUnique({ where: { id: invitationId }, include: { demand: true, meeting: true } });
      if (!invitation) throw new NotFoundException("邀请不存在");
      if (invitation.demand.parentId !== user.id) throw new ForbiddenException("不能操作其他家庭的见面");
      if (invitation.status !== "accepted") throw new ConflictException("教师接受后才能预约见面");
      if (invitation.meeting) return invitation.meeting;
      const meeting = await tx.meeting.create({ data: { id: id(), invitationId, scheduledAt: new Date(Date.now() + 86400000), meetingUrl: `https://meet.example.invalid/${invitationId}` } });
      await tx.demand.update({ where: { id: invitation.demandId }, data: { status: "meeting_scheduled" } });
      await this.events.record(tx, { idempotencyKey: `meeting:${meeting.id}:booked`, name: "meeting_scheduled", actorId: user.id, entityType: "meeting", entityId: meeting.id, payload: { provider: "sandbox", scheduledStartAt: meeting.scheduledAt, rescheduleCount: 0 } });
      return meeting;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async completeMeeting(meetingId: string, user: AuthUser) { return this.meetingOutcome(meetingId, { continueIntent: true }, user); }

  async meetingOutcome(meetingId: string, body: unknown, user: AuthUser) {
    const parsed = outcomeSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("见面结果无效");
    return this.prisma.$transaction(async (tx) => {
      const meeting = await tx.meeting.findUnique({ where: { id: meetingId }, include: { invitation: { include: { demand: true } } } });
      if (!meeting) throw new NotFoundException("见面不存在");
      const isParent = user.role === "parent" && meeting.invitation.demand.parentId === user.id;
      const isTeacher = user.role === "teacher" && meeting.invitation.teacherId === user.teacherId;
      if (!isParent && !isTeacher) throw new ForbiddenException("不能提交其他家庭的见面结果");
      if (!["scheduled", "completed"].includes(meeting.status)) throw new ConflictException("当前见面状态不可提交结果");
      const data = isParent ? { parentOutcome: parsed.data.continueIntent ? "continue" : "stop" } : { teacherOutcome: parsed.data.continueIntent ? "continue" : "stop" };
      let updated = await tx.meeting.update({ where: { id: meetingId }, data });
      await this.events.record(tx, { idempotencyKey: `meeting:${meetingId}:outcome:${user.role}`, name: "meeting_outcome_submitted", actorId: user.id, entityType: "meeting", entityId: meetingId, payload: { actorRole: user.role, continueIntent: parsed.data.continueIntent, reasonCode: parsed.data.continueIntent ? "continue" : "stop" } });
      if (!parsed.data.continueIntent) {
        updated = await tx.meeting.update({ where: { id: meetingId }, data: { status: "cancelled", cancelReason: parsed.data.reason ?? "一方不愿继续" } });
      } else if (updated.parentOutcome === "continue" && updated.teacherOutcome === "continue" && meeting.status !== "completed") {
        updated = await tx.meeting.update({ where: { id: meetingId }, data: { status: "completed", completedAt: new Date() } });
        await tx.relationship.upsert({ where: { demandId: meeting.invitation.demandId }, update: {}, create: { id: id(), demandId: meeting.invitation.demandId, teacherId: meeting.invitation.teacherId } });
        await tx.demand.update({ where: { id: meeting.invitation.demandId }, data: { status: "active" } });
        await this.events.record(tx, { idempotencyKey: `meeting:${meetingId}:completed`, name: "meeting_completed", actorId: user.id, entityType: "meeting", entityId: meetingId, payload: { actualDurationSeconds: 900 } });
      }
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async meetingException(meetingId: string, body: unknown, user: AuthUser) {
    const parsed = meetingExceptionSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("见面异常类型或原因无效");
    const meeting = await this.prisma.meeting.findUnique({ where: { id: meetingId }, include: { invitation: { include: { demand: true } } } });
    if (!meeting) throw new NotFoundException("见面不存在");
    const allowed = (user.role === "parent" && meeting.invitation.demand.parentId === user.id) || (user.role === "teacher" && meeting.invitation.teacherId === user.teacherId);
    if (!allowed) throw new ForbiddenException("不能处理其他家庭的见面");
    if (meeting.status !== "scheduled") throw new ConflictException("仅待举行见面可处理异常");
    const data = parsed.data.action === "reschedule"
      ? { scheduledAt: new Date(meeting.scheduledAt.getTime() + 86400000), rescheduleCount: { increment: 1 }, parentOutcome: null, teacherOutcome: null }
      : parsed.data.action === "no_show"
        ? { status: "no_show", noShowParty: parsed.data.noShowParty ?? "unknown", cancelReason: parsed.data.reason }
        : { status: "cancelled", cancelReason: parsed.data.reason };
    const updated = await this.prisma.meeting.update({ where: { id: meetingId }, data });
    const name = parsed.data.action === "reschedule" ? "meeting_scheduled" : parsed.data.action === "no_show" ? "meeting_no_show" : "meeting_outcome_submitted";
    await this.events.record(this.prisma, { idempotencyKey: `meeting:${meetingId}:${parsed.data.action}:${updated.rescheduleCount}:${Date.now()}`, name, actorId: user.id, entityType: "meeting", entityId: meetingId, payload: { reasonCode: parsed.data.action, noShowParty: parsed.data.noShowParty ?? null, noticeSeconds: Math.max(0, Math.floor((meeting.scheduledAt.getTime() - Date.now()) / 1000)), rescheduleCount: updated.rescheduleCount } });
    return updated;
  }

  async createOrder(relationshipId: string, idempotencyKey: string, body: unknown, user: AuthUser) {
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(idempotencyKey)) throw new BadRequestException("Idempotency-Key 格式无效");
    const parsed = orderSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException("首单课次数必须为 1—4");
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const existing = await this.prisma.paymentOrder.findUnique({ where: { idempotencyKey } });
      if (existing) {
        if (existing.relationshipId !== relationshipId) throw new ConflictException("幂等键已用于其他订单");
        return existing;
      }
      try {
        return await this.prisma.$transaction(async (tx) => {
          const relationship = await tx.relationship.findUnique({ where: { id: relationshipId }, include: { demand: true, teacher: true } });
          if (!relationship) throw new NotFoundException("关系不存在");
          if (relationship.demand.parentId !== user.id) throw new ForbiddenException("不能为其他家庭创建订单");
          const meeting = await tx.meeting.findFirst({ where: { invitation: { demandId: relationship.demandId, teacherId: relationship.teacherId }, status: "completed" } });
          if (!meeting) throw new ConflictException("必须双方完成免费见面");
          const order = await tx.paymentOrder.create({ data: { id: id(), relationshipId, demandId: relationship.demandId, amountFen: relationship.teacher.quotedPriceFen * parsed.data.lessonCount, lessonCount: parsed.data.lessonCount, status: "paid", idempotencyKey, providerRef: `sandbox_${id()}`, paidAt: new Date() } });
          await this.events.record(tx, { idempotencyKey: `order:${order.id}:created`, name: "order_created", actorId: user.id, entityType: "order", entityId: order.id, payload: { provider: "sandbox", amountFen: order.amountFen, amountBand: `${relationship.demand.budgetMinFen}_${relationship.demand.budgetMaxFen}`, pricePerHour: relationship.teacher.quotedPriceFen, lessonCount: order.lessonCount } });
          await this.events.record(tx, { idempotencyKey: `payment:${order.id}:paid`, name: "payment_status_changed", actorId: user.id, entityType: "order", entityId: order.id, payload: { provider: "sandbox", fromStatus: "pending", toStatus: "paid", verificationMethod: "sandbox" } });
          return order;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (!["P2002", "P40001"].includes((error as { code?: string }).code ?? "")) throw error;
      }
    }
    throw new ConflictException("并发订单暂未收敛，请使用相同幂等键重试");
  }

  async recordLesson(relationshipId: string, body: unknown, user: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      const relationship = await tx.relationship.findUnique({ where: { id: relationshipId }, include: { demand: true } });
      if (!relationship) throw new NotFoundException("关系不存在");
      if (relationship.teacherId !== user.teacherId) throw new ForbiddenException("不能给其他教师的关系记课");
      const parsed = lessonSchema.safeParse(body);
      if (!parsed.success) throw new BadRequestException("课次目标、证据或计划不完整");
      const paid = await tx.paymentOrder.findFirst({ where: { relationshipId, status: "paid" } });
      if (!paid) throw new ConflictException("正式课之前必须存在已支付订单");
      const scheduledAt = parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : new Date();
      const scheduleKey = `${relationship.teacherId}:${scheduledAt.toISOString()}`;
      const lesson = await tx.lesson.create({ data: { id: id(), relationshipId, sequence: 0, objective: parsed.data.objective, evidence: parsed.data.evidence, nextPlan: parsed.data.nextPlan, status: "completion_marked", scheduledAt, scheduleKey, completionMarkedAt: new Date() } });
      await this.events.record(tx, { idempotencyKey: `lesson:${lesson.id}:scheduled`, name: "lesson_scheduled", actorId: user.id, entityType: "lesson", entityId: lesson.id, payload: { scheduledStartAt: scheduledAt, durationMinutes: relationship.demand.lessonMinutes } });
      await this.events.record(tx, { idempotencyKey: `lesson:${lesson.id}:note`, name: "lesson_note_submitted", actorId: user.id, entityType: "lesson", entityId: lesson.id, payload: { contentTagCount: 1, evidenceCount: 1, minutesAfterLesson: 0 } });
      await this.events.record(tx, { idempotencyKey: `lesson:${lesson.id}:marked`, name: "lesson_completion_marked", actorId: user.id, entityType: "lesson", entityId: lesson.id, payload: { markedAt: lesson.completionMarkedAt, actualDurationMinutes: relationship.demand?.lessonMinutes ?? 60 } });
      return lesson;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async confirmLesson(lessonId: string, user: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      const lesson = await tx.lesson.findUnique({ where: { id: lessonId }, include: { relationship: { include: { demand: true, orders: true } } } });
      if (!lesson) throw new NotFoundException("课次不存在");
      const allowed = (user.role === "parent" && lesson.relationship.demand.parentId === user.id) || user.role === "ops";
      if (!allowed) throw new ForbiddenException("只有家长或运营可确认课次完成");
      if (!lesson.relationship.orders.some((order) => order.status === "paid")) throw new ConflictException("课次没有已支付订单");
      if (lesson.status === "completed") return lesson;
      if (lesson.status !== "completion_marked") throw new ConflictException("当前课次不可确认完成");
      await tx.lesson.update({ where: { id: lessonId }, data: { status: "completed", completedAt: new Date(), confirmedBy: user.id } });
      await this.resequence(tx, lesson.relationshipId);
      const updated = await tx.lesson.findUniqueOrThrow({ where: { id: lessonId } });
      await this.events.record(tx, { idempotencyKey: `lesson:${lessonId}:confirmed`, name: "lesson_completion_confirmed", actorId: user.id, entityType: "lesson", entityId: lessonId, payload: { sameTeacherSequence: updated.sequence, confirmedByRole: user.role, paidVerified: true } });
      await this.updateRecommendationFeatures(tx, lesson.relationship.teacherId, user.id);
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async cancelLesson(lessonId: string, body: unknown, user: AuthUser, noShow = false) {
    const parsed = reasonSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("取消或未到场原因必填");
    return this.prisma.$transaction(async (tx) => {
      const lesson = await tx.lesson.findUnique({ where: { id: lessonId }, include: { relationship: { include: { demand: true } } } });
      if (!lesson) throw new NotFoundException("课次不存在");
      const allowed = (user.role === "teacher" && lesson.relationship.teacherId === user.teacherId) || (user.role === "parent" && lesson.relationship.demand.parentId === user.id) || user.role === "ops";
      if (!allowed) throw new ForbiddenException("不能处理其他家庭的课次");
      if (["cancelled", "no_show"].includes(lesson.status)) return lesson;
      await tx.lesson.update({ where: { id: lessonId }, data: { status: noShow ? "no_show" : "cancelled", cancelReason: parsed.data.reason, scheduleKey: null } });
      await this.resequence(tx, lesson.relationshipId);
      await this.events.record(tx, { idempotencyKey: `lesson:${lessonId}:${noShow ? "no-show" : "cancelled"}`, name: noShow ? "lesson_no_show" : "lesson_cancelled", actorId: user.id, entityType: "lesson", entityId: lessonId, payload: { cancelledByRole: user.role, noShowParty: noShow ? "unknown" : null, noticeSeconds: Math.max(0, Math.floor(((lesson.scheduledAt?.getTime() ?? Date.now()) - Date.now()) / 1000)), reasonCode: noShow ? "no_show" : `cancelled_by_${user.role}` } });
      return tx.lesson.findUniqueOrThrow({ where: { id: lessonId } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async reports(user: AuthUser) {
    return this.prisma.artifact.findMany({ where: { status: "confirmed", kind: "report", lesson: { relationship: { demand: { parentId: user.id } } } }, orderBy: { confirmedAt: "desc" } });
  }

  async markReportViewed(artifactId: string, user: AuthUser) {
    const artifact = await this.prisma.artifact.findFirst({ where: { id: artifactId, kind: "report", status: "confirmed", lesson: { relationship: { demand: { parentId: user.id } } } } });
    if (!artifact) throw new NotFoundException("可见报告不存在");
    if (artifact.viewedAt) return artifact;
    const updated = await this.prisma.artifact.update({ where: { id: artifactId }, data: { viewedAt: new Date() } });
    await this.events.record(this.prisma, { idempotencyKey: `report:${artifactId}:viewed`, name: "parent_report_viewed", actorId: user.id, entityType: "artifact", entityId: artifactId, payload: { minutesAfterSent: Math.max(0, Math.floor((Date.now() - (artifact.confirmedAt?.getTime() ?? Date.now())) / 60000)) } });
    return updated;
  }

  async feedback(relationshipId: string, body: unknown, user: AuthUser) {
    const parsed = feedbackSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("反馈内容无效");
    return this.prisma.$transaction(async (tx) => {
      const relationship = await tx.relationship.findUnique({ where: { id: relationshipId }, include: { demand: true } });
      if (!relationship || relationship.demand.parentId !== user.id) throw new ForbiddenException("不能反馈其他家庭的关系");
      if (parsed.data.lessonId) {
        const lesson = await tx.lesson.findFirst({ where: { id: parsed.data.lessonId, relationshipId } });
        if (!lesson) throw new BadRequestException("课次不属于该教学关系");
      }
      const feedback = await tx.parentFeedback.create({ data: { id: id(), relationshipId, parentId: user.id, lessonId: parsed.data.lessonId ?? null, continueIntent: parsed.data.continueIntent, reasonCodes: asJson(parsed.data.reasonCodes), comment: parsed.data.comment ?? null } });
      await this.events.record(tx, { idempotencyKey: `feedback:${feedback.id}`, name: "parent_feedback_submitted", actorId: user.id, entityType: "relationship", entityId: relationshipId, payload: { continueIntent: parsed.data.continueIntent, reasonCodes: parsed.data.reasonCodes } });
      let newDemand = null;
      if (parsed.data.continueIntent === "rematch") {
        const source = relationship.demand;
        newDemand = await tx.demand.create({ data: { id: id(), parentId: user.id, subject: source.subject, gradeBand: source.gradeBand, mode: source.mode, areaCode: source.areaCode, budgetMinFen: source.budgetMinFen, budgetMaxFen: source.budgetMaxFen, lessonMinutes: source.lessonMinutes, preferredSlots: asJson(source.preferredSlots), objectives: asJson(source.objectives), requiredExperience: asJson(source.requiredExperience), preferenceTags: asJson(source.preferenceTags), status: "draft", rawText: source.rawText, previousDemandId: source.id } });
        await tx.relationship.update({ where: { id: relationshipId }, data: { status: "rematched" } });
        await this.events.record(tx, { idempotencyKey: `rematch:${newDemand.id}`, name: "rematch_requested", actorId: user.id, entityType: "demand", entityId: newDemand.id, payload: { previousDemandId: source.id, completedLessonCount: await tx.lesson.count({ where: { relationshipId, status: "completed" } }) } });
      }
      return { feedback, newDemand };
    });
  }

  async reviewTeacher(teacherId: string, body: unknown, user: AuthUser) {
    const parsed = reviewSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("审核动作与原因必填");
    const teacher = await this.prisma.teacher.findUnique({ where: { id: teacherId } });
    if (!teacher) throw new NotFoundException("教师不存在");
    const reviewStatus = parsed.data.action === "approve" ? "approved" : parsed.data.action === "reject" ? "rejected" : "suspended";
    const updated = await this.prisma.teacher.update({ where: { id: teacherId }, data: { reviewStatus, reviewNote: parsed.data.reason, reviewedBy: user.id } });
    await this.events.record(this.prisma, { idempotencyKey: `teacher:${teacherId}:review:${reviewStatus}:${Date.now()}`, name: "teacher_review_completed", actorId: user.id, entityType: "teacher", entityId: teacherId, payload: { result: reviewStatus, reasonCode: "ops_review_note_recorded", reviewerRole: user.role } });
    return updated;
  }

  async opsTeachers() { return this.prisma.teacher.findMany({ orderBy: [{ reviewStatus: "asc" }, { createdAt: "asc" }] }); }

  async opsArtifacts() {
    return this.prisma.artifact.findMany({ where: { status: "confirmed" }, select: { id: true, kind: true, provider: true, model: true, confirmedAt: true }, orderBy: { confirmedAt: "desc" }, take: 20 });
  }

  async reviewArtifact(artifactId: string, body: unknown, user: AuthUser) {
    const parsed = qualityReviewSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("AI 质量评审字段无效");
    const artifact = await this.prisma.artifact.findUnique({ where: { id: artifactId } });
    if (!artifact) throw new NotFoundException("Artifact 不存在");
    await this.events.record(this.prisma, { idempotencyKey: `artifact:${artifactId}:quality:${Date.now()}`, name: "ai_output_reviewed", actorId: user.id, entityType: "artifact", entityId: artifactId, payload: { generationId: artifactId, evaluationSetVersion: parsed.data.evaluationSetVersion, rubricVersion: parsed.data.rubricVersion, severeErrorFlag: parsed.data.severeErrorFlag, resultCode: parsed.data.resultCode } });
    return { reviewed: true, artifactId };
  }

  async updateAvailability(body: unknown, user: AuthUser) {
    if (!user.teacherId) throw new ForbiddenException("教师档案不存在");
    const parsed = availabilitySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("可授时间或容量无效");
    const updated = await this.prisma.teacher.update({ where: { id: user.teacherId }, data: { availability: asJson(parsed.data.availability), maxCapacity: parsed.data.maxCapacity, availabilityUpdatedAt: new Date() } });
    await this.events.record(this.prisma, { idempotencyKey: `teacher:${user.teacherId}:availability:${Date.now()}`, name: "teacher_availability_updated", actorId: user.id, entityType: "teacher", entityId: user.teacherId, payload: { slotCount: parsed.data.availability.length, mode: "declared_modes", validRange: "30_days", maxCapacity: parsed.data.maxCapacity } });
    return updated;
  }

  async manualOverride(runId: string, body: unknown, user: AuthUser) {
    const parsed = overrideSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("改派教师与原因必填");
    const [run, teacher] = await Promise.all([this.prisma.recommendationRun.findUnique({ where: { id: runId } }), this.prisma.teacher.findFirst({ where: { id: parsed.data.toTeacherId, reviewStatus: "approved" } })]);
    if (!run) throw new NotFoundException("推荐运行不存在");
    if (!teacher) throw new BadRequestException("改派目标不是已审核教师");
    const override = await this.prisma.manualOverride.create({ data: { id: id(), runId, operatorId: user.id, fromTeacherId: parsed.data.fromTeacherId ?? null, toTeacherId: parsed.data.toTeacherId, reasonCode: parsed.data.reasonCode, reasonText: parsed.data.reasonText } });
    await this.events.record(this.prisma, { idempotencyKey: `override:${override.id}`, name: "manual_match_overridden", actorId: user.id, entityType: "recommendation_run", entityId: runId, payload: { fromTeacherId: override.fromTeacherId, toTeacherId: override.toTeacherId, reasonCode: override.reasonCode } });
    return override;
  }

  private async updateRecommendationFeatures(tx: Prisma.TransactionClient, teacherId: string, actorId: string) {
    const [teacher, completedLessons, cancelledLessons, reports] = await Promise.all([
      tx.teacher.findUniqueOrThrow({ where: { id: teacherId } }),
      tx.lesson.count({ where: { relationship: { teacherId }, status: "completed" } }),
      tx.lesson.count({ where: { relationship: { teacherId }, status: "cancelled" } }),
      tx.artifact.findMany({ where: { kind: "report", status: "confirmed", lesson: { relationship: { teacherId } } }, select: { confirmedAt: true, lesson: { select: { createdAt: true } } } }),
    ]);
    const previous = teacher.metrics as unknown as RuleTeacher["metrics"];
    const onTimeReports = reports.filter((report) => report.lesson && report.confirmedAt && report.confirmedAt.getTime() - report.lesson.createdAt.getTime() <= 86400000).length;
    await tx.teacher.update({ where: { id: teacherId }, data: { metrics: asJson({ ...previous, attendedLessons: completedLessons, cancelledLessons, reportTotal: reports.length, onTimeReports }) } });
    await this.events.record(tx, { idempotencyKey: `teacher:${teacherId}:features:${completedLessons}:${cancelledLessons}:${reports.length}:${onTimeReports}`, name: "recommendation_feature_updated", actorId, entityType: "teacher", entityId: teacherId, payload: { featureVersion: "teacher_metrics_v1", sourceEventCount: completedLessons + cancelledLessons + reports.length, computedAt: new Date() } });
  }

  private async ownedDemand(demandId: string, user: AuthUser) {
    const demand = await this.prisma.demand.findUnique({ where: { id: demandId } });
    if (!demand) throw new NotFoundException("需求不存在");
    if (demand.parentId !== user.id) throw new ForbiddenException("不能访问其他家庭的需求");
    return demand;
  }

  private async resequence(tx: Prisma.TransactionClient, relationshipId: string) {
    const lessons = await tx.lesson.findMany({ where: { relationshipId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    for (const [index, lesson] of lessons.entries()) await tx.lesson.update({ where: { id: lesson.id }, data: { sequence: -(index + 1) } });
    const refreshed = await tx.lesson.findMany({ where: { relationshipId, status: "completed" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    for (const [index, lesson] of refreshed.entries()) await tx.lesson.update({ where: { id: lesson.id }, data: { sequence: index + 1 } });
    await tx.lesson.updateMany({ where: { relationshipId, status: { not: "completed" } }, data: { sequence: 0 } });
  }

  private toDemand(demand: Prisma.DemandGetPayload<object>): Demand {
    return { id: demand.id, subject: demand.subject, gradeBand: demand.gradeBand as Demand["gradeBand"], mode: demand.mode as Demand["mode"], areaCode: demand.areaCode, budgetMinFen: demand.budgetMinFen, budgetMaxFen: demand.budgetMaxFen, lessonMinutes: demand.lessonMinutes, preferredSlots: demand.preferredSlots as unknown as Demand["preferredSlots"], objectives: demand.objectives as string[], requiredExperience: demand.requiredExperience as string[], preferenceTags: demand.preferenceTags as string[] };
  }

  private toTeacher(teacher: Prisma.TeacherGetPayload<object>): RuleTeacher {
    return { id: teacher.id, displayName: teacher.displayName, subjects: teacher.subjects as string[], gradeBands: teacher.gradeBands as RuleTeacher["gradeBands"], teachingModes: teacher.teachingModes as RuleTeacher["teachingModes"], areaCode: teacher.areaCode, quotedPriceFen: teacher.quotedPriceFen, targetGrossHourlyFen: teacher.targetGrossHourlyFen, identityVerified: teacher.identityVerified, educationVerified: teacher.educationVerified, transcriptVerified: teacher.transcriptVerified, interviewScore: teacher.interviewScore, currentLoad: teacher.currentLoad, maxCapacity: teacher.maxCapacity, roundTripMinutes: teacher.roundTripMinutes, prepMinutes: teacher.prepMinutes, availability: teacher.availability as unknown as RuleTeacher["availability"], goalTags: teacher.goalTags as string[], experienceTags: teacher.experienceTags as string[], styleTags: teacher.styleTags as string[], isNew: teacher.isNew, metrics: teacher.metrics as unknown as RuleTeacher["metrics"] };
  }
}
