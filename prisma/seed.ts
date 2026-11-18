import { Prisma, PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";
import type { Demand, Teacher } from "@mvp/shared";

const prisma = new PrismaClient();
const json = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

type SeedTeacher = Teacher & { school: string; education: string; bio: string; reviewStatus?: string };

const baseTeacher: SeedTeacher = {
  id: "teacher-base",
  userId: undefined as never,
  displayName: "合成教师",
  school: "虚构大学",
  education: "本科三年级",
  bio: "仅用于 Demo 的虚构教师档案。",
  subjects: ["初中数学"],
  gradeBands: ["初中"],
  teachingModes: ["online", "offline"],
  areaCode: "闵行",
  quotedPriceFen: 15000,
  targetGrossHourlyFen: 15000,
  identityVerified: true,
  educationVerified: true,
  transcriptVerified: true,
  interviewScore: 85,
  currentLoad: 2,
  maxCapacity: 8,
  roundTripMinutes: 0,
  prepMinutes: 20,
  availability: [
    { day: 6, startMinute: 540, endMinute: 660 },
    { day: 2, startMinute: 1140, endMinute: 1260 },
  ],
  goalTags: ["函数", "几何"],
  experienceTags: ["初中数学"],
  styleTags: ["结构化", "耐心"],
  isNew: false,
  metrics: { attendedLessons: 20, cancelledLessons: 1, reportTotal: 20, onTimeReports: 19, continuedRelationships: 7, endedRelationships: 3 },
} as SeedTeacher;

const teachers: SeedTeacher[] = [
  { ...baseTeacher, id: "teacher-lin", displayName: "林老师", school: "上海交通大学", education: "硕士二年级 · 应用数学", interviewScore: 92, currentLoad: 4, metrics: { attendedLessons: 24, cancelledLessons: 1, reportTotal: 24, onTimeReports: 23, continuedRelationships: 8, endedRelationships: 2 } },
  { ...baseTeacher, id: "teacher-zhou", displayName: "周老师", school: "华东师范大学", education: "本科四年级 · 数学与应用数学", quotedPriceFen: 13000, targetGrossHourlyFen: 12000, currentLoad: 7, roundTripMinutes: 20, prepMinutes: 15, goalTags: ["函数"], styleTags: ["耐心"], metrics: { attendedLessons: 12, cancelledLessons: 3, reportTotal: 15, onTimeReports: 11, continuedRelationships: 2, endedRelationships: 6 } },
  { ...baseTeacher, id: "teacher-chen", displayName: "陈老师", school: "上海交通大学", education: "本科三年级 · 数学与应用数学", quotedPriceFen: 14000, targetGrossHourlyFen: 13000, roundTripMinutes: 40, isNew: true, metrics: { attendedLessons: 0, cancelledLessons: 0, reportTotal: 0, onTimeReports: 0, continuedRelationships: 0, endedRelationships: 0 } },
  { ...baseTeacher, id: "teacher-pending", displayName: "沈老师", school: "上海大学", education: "本科三年级 · 数学类", reviewStatus: "submitted", interviewScore: 88, currentLoad: 0, isNew: true, metrics: { attendedLessons: 0, cancelledLessons: 0, reportTotal: 0, onTimeReports: 0, continuedRelationships: 0, endedRelationships: 0 } },
];

const demand: Demand = {
  id: "demand-synthetic-001",
  subject: "初中数学",
  gradeBand: "初中",
  mode: "offline",
  areaCode: "闵行",
  budgetMinFen: 12000,
  budgetMaxFen: 18000,
  lessonMinutes: 60,
  preferredSlots: [
    { day: 6, startMinute: 540, endMinute: 660 },
    { day: 2, startMinute: 1140, endMinute: 1260 },
  ],
  objectives: ["函数", "几何"],
  requiredExperience: ["初中数学"],
  preferenceTags: ["结构化", "耐心"],
};

async function main() {
  if (process.env.DEMO_SEED !== "true") throw new Error("Refusing to seed unless DEMO_SEED=true");
  const passwordHash = await argon2.hash("DemoPass123!", { type: argon2.argon2id });
  await prisma.$transaction([
    prisma.paymentEvent.deleteMany(), prisma.paymentOrder.deleteMany(), prisma.learningState.deleteMany(),
    prisma.parentFeedback.deleteMany(), prisma.manualOverride.deleteMany(), prisma.artifact.deleteMany(),
    prisma.lesson.deleteMany(), prisma.relationship.deleteMany(), prisma.meeting.deleteMany(),
    prisma.invitation.deleteMany(), prisma.recommendationRun.deleteMany(), prisma.demand.deleteMany(),
    prisma.modelConfig.deleteMany(), prisma.eventLog.deleteMany(), prisma.job.deleteMany(),
    prisma.session.deleteMany(), prisma.teacher.deleteMany(), prisma.user.deleteMany(),
  ]);
  await prisma.user.createMany({
    data: [
      { id: "user-parent-demo", email: "parent@demo.test", passwordHash, role: "parent" },
      { id: "user-teacher-demo", email: "teacher@demo.test", passwordHash, role: "teacher" },
      { id: "user-ops-demo", email: "ops@demo.test", passwordHash, role: "ops" },
    ],
  });
  for (const teacher of teachers) {
    await prisma.teacher.create({
      data: {
        id: teacher.id,
        userId: teacher.id === "teacher-lin" ? "user-teacher-demo" : null,
        displayName: teacher.displayName,
        school: teacher.school,
        education: teacher.education,
        bio: teacher.bio,
        subjects: json(teacher.subjects), gradeBands: json(teacher.gradeBands), teachingModes: json(teacher.teachingModes),
        areaCode: teacher.areaCode, quotedPriceFen: teacher.quotedPriceFen, targetGrossHourlyFen: teacher.targetGrossHourlyFen,
        identityVerified: teacher.identityVerified, educationVerified: teacher.educationVerified, transcriptVerified: teacher.transcriptVerified,
        interviewScore: teacher.interviewScore, currentLoad: teacher.currentLoad, maxCapacity: teacher.maxCapacity,
        roundTripMinutes: teacher.roundTripMinutes, prepMinutes: teacher.prepMinutes, availability: json(teacher.availability),
        goalTags: json(teacher.goalTags), experienceTags: json(teacher.experienceTags), styleTags: json(teacher.styleTags),
        isNew: teacher.isNew, metrics: json(teacher.metrics), reviewStatus: teacher.reviewStatus ?? "approved",
      },
    });
  }
  await prisma.demand.create({
    data: {
      id: demand.id, parentId: "user-parent-demo", subject: demand.subject, gradeBand: demand.gradeBand,
      mode: demand.mode, areaCode: demand.areaCode, budgetMinFen: demand.budgetMinFen, budgetMaxFen: demand.budgetMaxFen,
      lessonMinutes: demand.lessonMinutes, preferredSlots: json(demand.preferredSlots), objectives: json(demand.objectives),
      requiredExperience: json(demand.requiredExperience), preferenceTags: json(demand.preferenceTags), status: "confirmed", confirmedAt: new Date(),
    },
  });
  await prisma.eventLog.createMany({
    data: [
      {
        id: "evt-seed-demand", idempotencyKey: "seed:demand:001", name: "demand_confirmed", actorId: "user-parent-demo", actorType: "user", source: "seed",
        entityType: "demand", entityId: demand.id, payload: json({ synthetic: true, area_code: demand.areaCode, valid_demand_flag: true }),
      },
      {
        id: "evt-seed-teacher-application", idempotencyKey: "seed:teacher:pending:application", name: "teacher_application_submitted", actorType: "system", source: "seed",
        entityType: "teacher", entityId: "teacher-pending", payload: json({ synthetic: true, subjects: ["初中数学"], grade_range: ["初中"], price_band: "100_200_cny_hour" }),
      },
    ],
  });
  console.log("Seeded four synthetic teachers (one pending review), one confirmed demand, and three demo users.");
}

main().finally(() => prisma.$disconnect());
