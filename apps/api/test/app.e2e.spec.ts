import { createHmac } from "node:crypto";
import { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Prisma, PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { processDueWork } from "../src/worker";
import { validateRuntimeEnv } from "../src/runtime-env";
import { configureApp } from "../src/app.setup";
import { decryptSecret, encryptSecret } from "../src/ai/crypto";

interface Login {
  cookies: string[];
  csrf: string;
  sessionToken: string;
}

process.env.DATABASE_URL = "postgresql://mvp:mvp@127.0.0.1:5432/entropy_tutor_test";
process.env.BYOK_MASTER_KEY = "11".repeat(32);
process.env.PAYMENT_WEBHOOK_SECRET = "test-webhook-secret";
process.env.APP_ORIGIN = "http://127.0.0.1:3000";

const password = "DemoPass123!";
const demandId = "demand-synthetic-001";
const prisma = new PrismaClient();
let app: INestApplication;
let server: Parameters<typeof request>[0];
let primaryTeacher: Login;
let primaryParent: Login;
let primaryOps: Login;

async function login(email: string): Promise<Login> {
  const response = await request(server).post("/api/v1/auth/login").send({ email, password }).expect(201);
  const cookies = response.headers["set-cookie"] as unknown as string[];
  const csrf = decodeURIComponent(cookies.find((cookie) => cookie.startsWith("mvp_csrf="))!.split(";")[0]!.split("=")[1]!);
  const sessionToken = decodeURIComponent(cookies.find((cookie) => cookie.startsWith("mvp_session="))!.split(";")[0]!.split("=")[1]!);
  expect(cookies.find((cookie) => cookie.startsWith("mvp_session="))).toContain("HttpOnly");
  return { cookies, csrf, sessionToken };
}

const asUser = (auth: Login) => ({
  get: (path: string) => request(server).get(path).set("Cookie", auth.cookies),
  post: (path: string) => request(server).post(path).set("Cookie", auth.cookies).set("x-csrf-token", auth.csrf),
  put: (path: string) => request(server).put(path).set("Cookie", auth.cookies).set("x-csrf-token", auth.csrf),
});

beforeAll(async () => {
  process.env.DATABASE_URL = "postgresql://mvp:mvp@127.0.0.1:5432/entropy_tutor_test";
  process.env.BYOK_MASTER_KEY = "11".repeat(32);
  process.env.PAYMENT_WEBHOOK_SECRET = "test-webhook-secret";
  process.env.APP_ORIGIN = "http://127.0.0.1:3000";
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  await prisma.user.upsert({ where: { id: "user-parent-other" }, update: {}, create: { id: "user-parent-other", email: "parent-other@demo.test", passwordHash, role: "parent" } });
  await prisma.user.upsert({ where: { id: "user-teacher-other" }, update: { teacher: { connect: { id: "teacher-zhou" } } }, create: { id: "user-teacher-other", email: "teacher-other@demo.test", passwordHash, role: "teacher", teacher: { connect: { id: "teacher-zhou" } } } });
  app = await NestFactory.create(AppModule, { rawBody: true, logger: false });
  configureApp(app);
  await app.init();
  server = app.getHttpServer();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

test("B-01 公开 API 完成多角色闭环，同时拒绝 IDOR、无 CSRF、重复订单和未审核发布", async () => {
  await request(server).get("/api/v1/demo/bootstrap").expect(401);
  primaryParent = await login("parent@demo.test");
  const parent = primaryParent;
  const otherParent = await login("parent-other@demo.test");
  primaryTeacher = await login("teacher@demo.test");
  const teacher = primaryTeacher;
  const otherTeacher = await login("teacher-other@demo.test");
  primaryOps = await login("ops@demo.test");
  const ops = primaryOps;
  const storedSession = await prisma.session.findFirstOrThrow({ where: { userId: "user-parent-demo" }, orderBy: { createdAt: "desc" } });
  expect(storedSession.tokenHash).not.toBe(parent.sessionToken);

  await request(server).post(`/api/v1/demands/${demandId}/recommend`).set("Cookie", parent.cookies).expect(403);
  expect(await prisma.recommendationRun.count()).toBe(0);
  await asUser(otherParent).post(`/api/v1/demands/${demandId}/recommend`).expect(403);
  expect(await prisma.recommendationRun.count()).toBe(0);
  const recommendation = await asUser(parent).post(`/api/v1/demands/${demandId}/recommend`).expect(201);
  expect(recommendation.body.ruleVersion).toBe("rule_v0.2");
  expect(recommendation.body.candidates).toHaveLength(3);

  await request(server).post(`/api/v1/demands/${demandId}/invitations`).set("Cookie", parent.cookies).send({ teacherId: "teacher-lin" }).expect(403);
  expect(await prisma.invitation.count()).toBe(0);
  await asUser(otherParent).post(`/api/v1/demands/${demandId}/invitations`).send({ teacherId: "teacher-lin" }).expect(403);
  const invitation = (await asUser(parent).post(`/api/v1/demands/${demandId}/invitations`).send({ teacherId: "teacher-lin" }).expect(201)).body;
  await asUser(otherTeacher).post(`/api/v1/invitations/${invitation.id}/accept`).expect(403);
  expect((await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } })).status).toBe("invited");
  await asUser(teacher).post(`/api/v1/invitations/${invitation.id}/accept`).expect(201);

  await asUser(otherParent).post(`/api/v1/invitations/${invitation.id}/meeting`).expect(403);
  const meeting = (await asUser(parent).post(`/api/v1/invitations/${invitation.id}/meeting`).expect(201)).body;
  expect(meeting.provider).toBe("sandbox");
  await asUser(teacher).post(`/api/v1/meetings/${meeting.id}/complete`).expect(201);
  expect(await prisma.relationship.count({ where: { demandId } })).toBe(0);
  await asUser(parent).post(`/api/v1/meetings/${meeting.id}/outcome`).send({ continueIntent: true }).expect(201);
  const relationship = await prisma.relationship.findUniqueOrThrow({ where: { demandId } });

  await asUser(otherParent).post(`/api/v1/relationships/${relationship.id}/orders`).set("Idempotency-Key", "other-parent-order").expect(403);
  expect(await prisma.paymentOrder.count()).toBe(0);
  const firstOrder = (await asUser(parent).post(`/api/v1/relationships/${relationship.id}/orders`).set("Idempotency-Key", "demo-order-key-001").expect(201)).body;
  const secondOrder = (await asUser(parent).post(`/api/v1/relationships/${relationship.id}/orders`).set("Idempotency-Key", "demo-order-key-001").expect(201)).body;
  expect(secondOrder.id).toBe(firstOrder.id);
  expect(await prisma.paymentOrder.count()).toBe(1);

  await asUser(otherTeacher).post(`/api/v1/relationships/${relationship.id}/lessons`).send({ objective: "越权记课目标", evidence: "不应留下任何课次证据", nextPlan: "不应执行" }).expect(403);
  expect(await prisma.lesson.count()).toBe(0);
  const lesson = (await asUser(teacher).post(`/api/v1/relationships/${relationship.id}/lessons`).send({ objective: "用一次函数描述变化", evidence: "学生独立完成一道变式题，并说明斜率含义", nextPlan: "先无提示回忆，再做跨情境复核" }).expect(201)).body;
  expect(lesson.sequence).toBe(0);
  const confirmedLesson = (await asUser(parent).post(`/api/v1/lessons/${lesson.id}/confirm`).expect(201)).body;
  expect(confirmedLesson.sequence).toBe(1);
  expect(confirmedLesson.status).toBe("completed");
  const artifact = (await asUser(teacher).post(`/api/v1/lessons/${lesson.id}/artifacts`).send({ kind: "report" }).expect(201)).body;
  expect(artifact.status).toBe("draft");
  expect(artifact.provider).toBe("mock");
  expect((await asUser(parent).get("/api/v1/reports").expect(200)).body).toHaveLength(0);
  await asUser(otherTeacher).post(`/api/v1/artifacts/${artifact.id}/confirm`).send({ content: "另一位教师不能确认这份报告内容" }).expect(403);
  expect((await prisma.artifact.findUniqueOrThrow({ where: { id: artifact.id } })).status).toBe("draft");
  await asUser(teacher).post(`/api/v1/artifacts/${artifact.id}/confirm`).send({ content: "教师已复核：学生能独立完成一道变式题；下一课用新情境再次检查，不宣称掌握率。" }).expect(201);
  expect((await asUser(parent).get("/api/v1/reports").expect(200)).body).toHaveLength(1);

  const rawWebhook = JSON.stringify({ providerEventId: "sandbox-event-0001", orderId: firstOrder.id, status: "paid" });
  await request(server).post("/api/v1/payments/webhook").set("content-type", "application/json").set("x-demo-signature", "bad").send(rawWebhook).expect(401);
  const signature = createHmac("sha256", process.env.PAYMENT_WEBHOOK_SECRET!).update(rawWebhook).digest("hex");
  const firstWebhook = await request(server).post("/api/v1/payments/webhook").set("content-type", "application/json").set("x-demo-signature", signature).send(rawWebhook).expect(201);
  const secondWebhook = await request(server).post("/api/v1/payments/webhook").set("content-type", "application/json").set("x-demo-signature", signature).send(rawWebhook).expect(201);
  expect(firstWebhook.body.duplicate).toBe(false);
  expect(secondWebhook.body.duplicate).toBe(true);
  expect(await prisma.paymentEvent.count()).toBe(1);
  const events = (await asUser(ops).get("/api/v1/demo/bootstrap").expect(200)).body;
  expect(events.some((event: { name: string }) => event.name === "lesson_completion_confirmed")).toBe(true);
  expect(events.some((event: { name: string }) => event.name === "lesson_report_confirmed")).toBe(true);
});

test("B-02 BYOK 拒绝本机地址，配置读取不回显秘密，AES-GCM 可逆且篡改失败", async () => {
  const teacher = primaryTeacher;
  await asUser(teacher).put("/api/v1/ai/settings").send({ mode: "byok", baseUrl: "https://127.0.0.1/v1", model: "demo", apiKey: "super-secret-demo-key" }).expect(400);
  await asUser(teacher).put("/api/v1/ai/settings").send({ mode: "byok", baseUrl: "http://api.example.com/v1", model: "demo", apiKey: "super-secret-demo-key" }).expect(400);
  expect(await prisma.modelConfig.count()).toBe(0);
  const settings = (await asUser(teacher).get("/api/v1/ai/settings").expect(200)).body;
  expect(JSON.stringify(settings)).not.toContain("super-secret-demo-key");
  expect(settings).not.toHaveProperty("encryptedKey");
  const encrypted = encryptSecret("super-secret-demo-key");
  expect(encrypted).not.toContain("super-secret-demo-key");
  expect(decryptSecret(encrypted)).toBe("super-secret-demo-key");
  expect(() => decryptSecret(`${encrypted.slice(0, -1)}x`)).toThrow();
});

test("B-03 并发订单与支付回调保持唯一，不产生重复业务副作用", async () => {
  const source = await prisma.demand.findUniqueOrThrow({ where: { id: demandId } });
  const concurrentDemandId = "demand-concurrency-001";
  await prisma.demand.create({ data: {
    id: concurrentDemandId, parentId: source.parentId, subject: source.subject, gradeBand: source.gradeBand,
    mode: source.mode, areaCode: source.areaCode, budgetMinFen: source.budgetMinFen, budgetMaxFen: source.budgetMaxFen,
    lessonMinutes: source.lessonMinutes, preferredSlots: source.preferredSlots as Prisma.InputJsonValue, objectives: source.objectives as Prisma.InputJsonValue,
    requiredExperience: source.requiredExperience as Prisma.InputJsonValue, preferenceTags: source.preferenceTags as Prisma.InputJsonValue,
    status: "confirmed", confirmedAt: new Date(),
  } });
  await prisma.invitation.create({ data: {
    id: "invitation-concurrency-001", demandId: concurrentDemandId, teacherId: "teacher-lin", status: "accepted",
    meeting: { create: { id: "meeting-concurrency-001", status: "completed", meetingUrl: "https://meet.example.invalid/concurrency", scheduledAt: new Date(), completedAt: new Date() } },
  } });
  const relationship = await prisma.relationship.create({ data: { id: "relationship-concurrency-001", demandId: concurrentDemandId, teacherId: "teacher-lin" } });
  const responses = await Promise.all(Array.from({ length: 6 }, () =>
    asUser(primaryParent).post(`/api/v1/relationships/${relationship.id}/orders`).set("Idempotency-Key", "concurrent-order-key-001"),
  ));
  expect(responses.map((response) => response.status)).toEqual(Array(6).fill(201));
  expect(new Set(responses.map((response) => response.body.id)).size).toBe(1);
  expect(await prisma.paymentOrder.count({ where: { relationshipId: relationship.id } })).toBe(1);
  const rawWebhook = JSON.stringify({ providerEventId: "concurrent-event-0001", orderId: responses[0]!.body.id, status: "paid" });
  const signature = createHmac("sha256", process.env.PAYMENT_WEBHOOK_SECRET!).update(rawWebhook).digest("hex");
  const callbacks = await Promise.all(Array.from({ length: 6 }, () =>
    request(server).post("/api/v1/payments/webhook").set("content-type", "application/json").set("x-demo-signature", signature).send(rawWebhook),
  ));
  expect(callbacks.map((response) => response.status)).toEqual(Array(6).fill(201));
  expect(callbacks.filter((response) => response.body.duplicate === false)).toHaveLength(1);
  expect(await prisma.paymentEvent.count({ where: { providerEventId: "concurrent-event-0001" } })).toBe(1);
});

test("C-01 30 日 cohort、AI 指标、异常队列和规则回放来自持久事实", async () => {
  const relationship = await prisma.relationship.findUniqueOrThrow({ where: { demandId } });
  for (const sequence of [2, 3, 4]) {
    const lesson = (await asUser(primaryTeacher).post(`/api/v1/relationships/${relationship.id}/lessons`).send({ objective: `第 ${sequence} 次函数变式练习`, evidence: `教师确认第 ${sequence} 次独立完成证据`, nextPlan: "下一次先无提示回忆再复核" }).expect(201)).body;
    const confirmed = (await asUser(primaryParent).post(`/api/v1/lessons/${lesson.id}/confirm`).expect(201)).body;
    expect(confirmed.sequence).toBe(sequence);
  }
  const cohortStartedAt = new Date(Date.now() - 31 * 86400000);
  await prisma.demand.update({ where: { id: demandId }, data: { createdAt: cohortStartedAt } });
  const lessons = await prisma.lesson.findMany({ where: { relationshipId: relationship.id }, orderBy: { sequence: "asc" } });
  for (const lesson of lessons) {
    await prisma.lesson.update({ where: { id: lesson.id }, data: { createdAt: new Date(cohortStartedAt.getTime() + lesson.sequence * 86400000) } });
  }
  await asUser(primaryParent).get("/api/v1/analytics/overview").expect(403);
  const overview = (await asUser(primaryOps).get("/api/v1/analytics/overview").expect(200)).body;
  expect(overview.cohort30d.recentDemandCount).toBe(1);
  expect(overview.cohort30d.matureDemandCount).toBe(1);
  expect(overview.cohort30d.paidCount).toBe(1);
  expect(overview.cohort30d.secondLessonCount).toBe(0);
  expect(overview.cohort30d.fourthLessonCount).toBe(1);
  expect(overview.cohort30d.northStarRate).toBe(1);
  expect(overview.ai.generated).toBe(1);
  expect(overview.ai.confirmed).toBe(1);
  expect(overview.ai.confirmationRate).toBe(1);
  expect(overview.recommendation.explorationReturnRate7d).toBeLessThanOrEqual(0.2);
  expect(overview.exceptions.some((item: { type: string }) => item.type === "missing_lesson")).toBe(true);
  const replay = (await asUser(primaryOps).get(`/api/v1/analytics/replay/${overview.recommendation.latestRunId}`).expect(200)).body;
  expect(replay.matches).toBe(true);
  expect(replay.expected).toEqual(replay.actual);
});

test("D-01 PRD 内部演示缺口均有真实状态、权限与追加事件", async () => {
  const source = await prisma.demand.findUniqueOrThrow({ where: { id: demandId } });
  const demandInput = {
    subject: source.subject, gradeBand: source.gradeBand, mode: source.mode, areaCode: source.areaCode,
    budgetMinFen: source.budgetMinFen, budgetMaxFen: source.budgetMaxFen, lessonMinutes: source.lessonMinutes,
    preferredSlots: source.preferredSlots, objectives: source.objectives, requiredExperience: source.requiredExperience,
    preferenceTags: source.preferenceTags, rawText: "合成家庭：初二数学，希望先见面再决定正式课。",
  };
  const draft = (await asUser(primaryParent).post("/api/v1/demands").send(demandInput).expect(201)).body;
  expect(draft.status).toBe("draft");
  await asUser(primaryParent).post(`/api/v1/demands/${draft.id}/recommend`).expect(409);
  await asUser(primaryParent).post(`/api/v1/demands/${draft.id}/structure`).expect(201);
  await asUser(primaryParent).post(`/api/v1/demands/${draft.id}/confirm`).expect(201);
  const draftRecommendation = (await asUser(primaryParent).post(`/api/v1/demands/${draft.id}/recommend`).expect(201)).body;
  expect(draftRecommendation.candidates.every((candidate: { teacherId: string }) => candidate.teacherId !== "teacher-pending")).toBe(true);
  expect((await asUser(primaryParent).post(`/api/v1/recommendations/${draftRecommendation.runId}/exposures`).send({ teacherId: "teacher-lin" }).expect(201)).body.recorded).toBe(true);
  expect((await asUser(primaryParent).post(`/api/v1/recommendations/${draftRecommendation.runId}/exposures`).send({ teacherId: "teacher-lin" }).expect(201)).body.recorded).toBe(false);
  await asUser(primaryParent).post(`/api/v1/recommendations/${draftRecommendation.runId}/exposures`).send({ teacherId: "not-a-candidate" }).expect(400);

  const reviewed = (await asUser(primaryOps).post("/api/v1/teachers/teacher-pending/review").send({ action: "approve", reason: "合成材料与试讲均已复核" }).expect(201)).body;
  expect(reviewed.reviewStatus).toBe("approved");
  expect(reviewed.reviewedBy).toBe("user-ops-demo");

  const declinedInvitation = (await asUser(primaryParent).post(`/api/v1/demands/${draft.id}/invitations`).send({ teacherId: "teacher-lin" }).expect(201)).body;
  await asUser(primaryTeacher).post(`/api/v1/invitations/${declinedInvitation.id}/decline`).send({ reason: "时间不合适" }).expect(201);
  expect((await prisma.invitation.findUniqueOrThrow({ where: { id: declinedInvitation.id } })).status).toBe("declined");

  const expiredDemand = (await asUser(primaryParent).post("/api/v1/demands").send(demandInput).expect(201)).body;
  await asUser(primaryParent).post(`/api/v1/demands/${expiredDemand.id}/structure`).expect(201);
  await asUser(primaryParent).post(`/api/v1/demands/${expiredDemand.id}/confirm`).expect(201);
  const expired = await prisma.invitation.create({ data: { id: "invitation-expired-demo", demandId: expiredDemand.id, teacherId: "teacher-lin", expiresAt: new Date(Date.now() - 1000), createdAt: new Date(Date.now() - 13 * 3600000) } });
  await asUser(primaryTeacher).post(`/api/v1/invitations/${expired.id}/accept`).expect(409);
  expect((await prisma.invitation.findUniqueOrThrow({ where: { id: expired.id } })).status).toBe("expired");

  const beforeOverride = await prisma.recommendationRun.findUniqueOrThrow({ where: { id: draftRecommendation.runId } });
  const override = (await asUser(primaryOps).post(`/api/v1/recommendations/${draftRecommendation.runId}/overrides`).send({ toTeacherId: "teacher-chen", reasonCode: "supply_review", reasonText: "运营补充新教师供给" }).expect(201)).body;
  expect(override.reasonCode).toBe("supply_review");
  const afterOverride = await prisma.recommendationRun.findUniqueOrThrow({ where: { id: draftRecommendation.runId } });
  expect(afterOverride.results).toEqual(beforeOverride.results);

  const exceptionMeeting = await prisma.meeting.create({ data: { id: "meeting-exception-demo", invitation: { create: { id: "invitation-exception-demo", demandId: expiredDemand.id, teacherId: "teacher-chen", status: "accepted" } }, meetingUrl: "https://meet.example.invalid/exception", scheduledAt: new Date() } });
  const rescheduled = (await asUser(primaryParent).post(`/api/v1/meetings/${exceptionMeeting.id}/exception`).send({ action: "reschedule", reason: "家长临时有事" }).expect(201)).body;
  expect(rescheduled.rescheduleCount).toBe(1);
  const noShow = (await asUser(primaryParent).post(`/api/v1/meetings/${exceptionMeeting.id}/exception`).send({ action: "no_show", reason: "教师未到场", noShowParty: "teacher" }).expect(201)).body;
  expect(noShow.status).toBe("no_show");

  const relationship = await prisma.relationship.findUniqueOrThrow({ where: { demandId } });
  const prep = (await asUser(primaryTeacher).post(`/api/v1/relationships/${relationship.id}/prep`).expect(201)).body;
  expect(prep.kind).toBe("prep");
  expect(prep.rawContent.length).toBeGreaterThan(20);
  await asUser(primaryTeacher).post(`/api/v1/artifacts/${prep.id}/confirm`).send({ content: "教师确认的备课卡：先无提示回忆，再用一道跨情境题检查；没有证据时不宣称掌握。" }).expect(201);
  expect((await asUser(primaryOps).get("/api/v1/ops/artifacts").expect(200)).body.some((artifact: { id: string }) => artifact.id === prep.id)).toBe(true);
  await asUser(primaryOps).post(`/api/v1/artifacts/${prep.id}/review`).send({ resultCode: "pass", severeErrorFlag: false, evaluationSetVersion: "demo_eval_v1", rubricVersion: "rubric_v1" }).expect(201);

  const firstLesson = await prisma.lesson.findFirstOrThrow({ where: { relationshipId: relationship.id, status: "completed" }, orderBy: { sequence: "asc" } });
  const learningArtifact = (await asUser(primaryTeacher).post(`/api/v1/lessons/${firstLesson.id}/artifacts`).send({ kind: "learning_state" }).expect(201)).body;
  await asUser(primaryTeacher).post(`/api/v1/artifacts/${learningArtifact.id}/confirm`).send({ content: "教师确认：当前能独立完成同情境题，但跨情境迁移仍需下一课复验。" }).expect(201);
  const learningState = await prisma.learningState.findUniqueOrThrow({ where: { artifactId: learningArtifact.id } });
  expect(learningState.stateCode).toBe("teacher_confirmed");
  expect(learningState.confirmedBy).toBe("user-teacher-demo");

  const fifth = (await asUser(primaryTeacher).post(`/api/v1/relationships/${relationship.id}/lessons`).send({ objective: "第五次函数综合练习", evidence: "教师记录第五次独立完成证据", nextPlan: "后续继续复验迁移" }).expect(201)).body;
  await asUser(primaryParent).post(`/api/v1/lessons/${fifth.id}/confirm`).expect(201);
  const secondLesson = await prisma.lesson.findFirstOrThrow({ where: { relationshipId: relationship.id, sequence: 2, status: "completed" } });
  await asUser(primaryParent).post(`/api/v1/lessons/${secondLesson.id}/cancel`).send({ reason: "合成取消，不占正式课序号" }).expect(201);
  const remaining = await prisma.lesson.findMany({ where: { relationshipId: relationship.id, status: "completed" }, orderBy: { sequence: "asc" } });
  expect(remaining.map((lesson) => lesson.sequence)).toEqual([1, 2, 3, 4]);

  const report = await prisma.artifact.findFirstOrThrow({ where: { lesson: { relationshipId: relationship.id }, kind: "report", status: "confirmed" } });
  const viewed = (await asUser(primaryParent).post(`/api/v1/reports/${report.id}/view`).expect(201)).body;
  expect(viewed.viewedAt).not.toBeNull();
  await asUser(primaryParent).post(`/api/v1/relationships/${relationship.id}/feedback`).send({ continueIntent: "continue", reasonCodes: ["teacher_fit"] }).expect(201);
  const rematch = (await asUser(primaryParent).post(`/api/v1/relationships/${relationship.id}/feedback`).send({ continueIntent: "rematch", reasonCodes: ["schedule_change"] }).expect(201)).body;
  expect(rematch.newDemand.previousDemandId).toBe(demandId);
  expect(rematch.newDemand.status).toBe("draft");

  const workerNow = new Date();
  await prisma.invitation.create({ data: { id: "invitation-worker-expiry", demandId: draft.id, teacherId: "teacher-chen", expiresAt: new Date(workerNow.getTime() - 1000), createdAt: new Date(workerNow.getTime() - 13 * 3600000) } });
  await prisma.job.create({ data: { id: "job-worker-retry", kind: "email.invitation", payload: {}, availableAt: workerNow } });
  await prisma.job.create({ data: { id: "job-worker-success", kind: "demo.noop", payload: {}, availableAt: workerNow } });
  const firstBatch = await processDueWork(prisma, workerNow);
  expect(firstBatch.expiredInvitations).toBe(1);
  expect(firstBatch.completed).toBe(1);
  expect(firstBatch.retried).toBe(1);
  expect((await prisma.invitation.findUniqueOrThrow({ where: { id: "invitation-worker-expiry" } })).status).toBe("expired");
  await processDueWork(prisma, new Date(workerNow.getTime() + 1000));
  expect((await prisma.job.findUniqueOrThrow({ where: { id: "job-worker-retry" } })).attempts).toBe(1);
  await processDueWork(prisma, new Date(workerNow.getTime() + 61000));
  const deadBatch = await processDueWork(prisma, new Date(workerNow.getTime() + 200000));
  expect(deadBatch.dead).toBe(1);
  const deadJob = await prisma.job.findUniqueOrThrow({ where: { id: "job-worker-retry" } });
  expect(deadJob.status).toBe("dead");
  expect(deadJob.attempts).toBe(3);
  expect(JSON.stringify(deadJob.payload)).toContain("No real worker adapter");

  await prisma.modelConfig.upsert({ where: { teacherId: "teacher-lin" }, update: { mode: "byok", baseUrl: "https://127.0.0.1:9/v1", model: "synthetic-failure", encryptedKey: encryptSecret("synthetic-key") }, create: { id: "model-config-failure-test", teacherId: "teacher-lin", mode: "byok", baseUrl: "https://127.0.0.1:9/v1", model: "synthetic-failure", encryptedKey: encryptSecret("synthetic-key") } });
  await asUser(primaryTeacher).post(`/api/v1/lessons/${firstLesson.id}/artifacts`).send({ kind: "quiz" }).expect(400);
  await prisma.modelConfig.delete({ where: { teacherId: "teacher-lin" } });

  const events = (await asUser(primaryOps).get("/api/v1/demo/bootstrap").expect(200)).body;
  for (const event of events) {
    expect(event.schemaVersion).toBe("v0.2");
    expect(event.idempotencyKey).toBeTruthy();
    expect(event.receivedAt).toBeTruthy();
    expect(event.event_name).toBe(event.name);
    expect(event.actor_type).toBeTruthy();
    expect(["server", "worker", "webhook", "seed", "client"]).toContain(event.source);
  }
  for (const name of ["teacher_application_submitted", "teacher_review_completed", "teacher_offer_responded", "candidate_exposed", "candidate_selected", "meeting_no_show", "prep_card_confirmed", "next_lesson_plan_accepted", "learning_state_confirmed", "lesson_note_submitted", "lesson_report_sent", "lesson_cancelled", "parent_feedback_submitted", "rematch_requested", "manual_match_overridden", "recommendation_feature_updated", "ai_output_reviewed", "ai_generation_failed"]) {
    expect(events.some((event: { name: string }) => event.name === name)).toBe(true);
  }
  const confirmedEvent = events.find((event: { name: string }) => event.name === "lesson_completion_confirmed");
  expect(confirmedEvent.payload.same_teacher_sequence).toEqual(expect.any(Number));
  expect(confirmedEvent.payload.paid_verified).toBe(true);
});

test("D-02 生产启动拒绝占位密钥、弱密钥与不安全公网 Cookie 配置", () => {
  const valid: NodeJS.ProcessEnv = {
    NODE_ENV: "production", DATABASE_URL: "postgresql://example.internal/entropy", APP_ORIGIN: "http://localhost:3000",
    SESSION_SECRET: "a-very-long-session-secret-for-demo-only", BYOK_MASTER_KEY: "a".repeat(64),
    PAYMENT_WEBHOOK_SECRET: "a-very-long-webhook-secret-for-demo-only", COOKIE_SECURE: "false",
  };
  expect(() => validateRuntimeEnv(valid)).not.toThrow();
  expect(() => validateRuntimeEnv({ ...valid, SESSION_SECRET: "short" })).toThrow("SESSION_SECRET");
  expect(() => validateRuntimeEnv({ ...valid, BYOK_MASTER_KEY: "not-hex" })).toThrow("BYOK_MASTER_KEY");
  expect(() => validateRuntimeEnv({ ...valid, APP_ORIGIN: "https://demo.example.com" })).toThrow("COOKIE_SECURE");
  expect(() => validateRuntimeEnv({ ...valid, APP_ORIGIN: "http://demo.example.com" })).toThrow("明文 HTTP");
});
