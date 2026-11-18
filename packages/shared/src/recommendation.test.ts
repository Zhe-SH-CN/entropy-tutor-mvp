import { describe, expect, it } from "vitest";
import {
  rankCandidates,
  scoreCandidate,
  shrink,
  type Demand,
  type Teacher,
} from "./index";

const slot = { day: 6, startMinute: 540, endMinute: 660 };
const otherSlot = { day: 2, startMinute: 1140, endMinute: 1260 };

const demand: Demand = {
  id: "demand-demo",
  subject: "初中数学",
  gradeBand: "初中",
  mode: "offline",
  areaCode: "闵行",
  budgetMinFen: 10000,
  budgetMaxFen: 20000,
  lessonMinutes: 60,
  preferredSlots: [slot, otherSlot],
  objectives: ["函数", "几何"],
  requiredExperience: ["初中数学"],
  preferenceTags: ["结构化"],
};

const teacher: Teacher = {
  id: "teacher-a",
  displayName: "A 老师",
  subjects: ["初中数学"],
  gradeBands: ["初中"],
  teachingModes: ["online", "offline"],
  areaCode: "闵行",
  quotedPriceFen: 15000,
  targetGrossHourlyFen: 15000,
  identityVerified: true,
  educationVerified: true,
  transcriptVerified: true,
  interviewScore: 90,
  currentLoad: 4,
  maxCapacity: 8,
  roundTripMinutes: 0,
  prepMinutes: 20,
  availability: [slot, otherSlot],
  goalTags: ["函数", "几何"],
  experienceTags: ["初中数学"],
  styleTags: ["结构化"],
  isNew: false,
  metrics: {
    attendedLessons: 18,
    cancelledLessons: 2,
    reportTotal: 20,
    onTimeReports: 18,
    continuedRelationships: 7,
    endedRelationships: 3,
  },
};

const cloneTeacher = (patch: Partial<Teacher>): Teacher => ({
  ...teacher,
  ...patch,
  metrics: { ...teacher.metrics, ...patch.metrics },
});

describe("rule_v0.2 worked examples", () => {
  it("matches PRD A exactly", () => {
    const result = scoreCandidate({ p: 0.9, e: 0.75, r: 0.85, c: 0.7, b: 0.33, l: 0.5, x: 0 });
    expect(result.finalScore).toBe(76.2);
  });

  it("matches PRD B and rounds the displayed score to 81.5", () => {
    const result = scoreCandidate({ p: 0.82, e: 0.9, r: 0.88, c: 0.6, b: 0.33, l: 0.25, x: 5 });
    expect(result.finalScore).toBe(81.475);
    expect(result.finalScore.toFixed(1)).toBe("81.5");
  });

  it("matches PRD C after rounding", () => {
    const result = scoreCandidate({ p: 0.92, e: 0.55, r: 0.7, c: 0.8, b: 1, l: 0.75, x: 0 });
    expect(result.finalScore).toBe(62.175);
    expect(result.finalScore.toFixed(1)).toBe("62.2");
  });
});

describe("cold-start shrinkage", () => {
  it("uses the prior for zero observations", () => {
    expect(shrink(0, 0, 0.35)).toBe(0.35);
  });

  it("uses n/(n+5) personal observation weight", () => {
    expect(shrink(1, 5, 0)).toBe(0.5);
    expect(shrink(0.8, 10, 0.4)).toBeCloseTo(0.6666667);
  });
});

describe("ranking and safety constraints", () => {
  it("returns at most three unique teachers with at most one exploration candidate", () => {
    const teachers = [
      cloneTeacher({ id: "a", displayName: "A" }),
      cloneTeacher({ id: "b", displayName: "B", isNew: true }),
      cloneTeacher({ id: "c", displayName: "C", isNew: true }),
      cloneTeacher({ id: "d", displayName: "D" }),
    ];
    const result = rankCandidates(demand, teachers, { generatedAt: "2026-11-17T00:00:00Z" });
    expect(result.candidates).toHaveLength(3);
    expect(new Set(result.candidates.map((candidate) => candidate.teacherId)).size).toBe(3);
    expect(result.candidates.filter((candidate) => candidate.breakdown.x > 0)).toHaveLength(1);
  });

  it("prefers a second time slot when an eligible alternative exists", () => {
    const teachers = [
      cloneTeacher({ id: "a", displayName: "A", availability: [slot] }),
      cloneTeacher({ id: "b", displayName: "B", availability: [slot] }),
      cloneTeacher({ id: "c", displayName: "C", availability: [otherSlot], quotedPriceFen: 10000, targetGrossHourlyFen: 20000 }),
    ];
    const result = rankCandidates(demand, teachers, { generatedAt: "2026-11-17T00:00:00Z" });
    expect(new Set(result.candidates.map((candidate) => candidate.slot.day)).size).toBeGreaterThan(1);
  });

  it("disables exploration at the 20 percent exposure boundary", () => {
    const result = rankCandidates(demand, [cloneTeacher({ isNew: true })], {
      generatedAt: "2026-11-17T00:00:00Z",
      rollingExposureCount: 10,
      rollingExplorationCount: 2,
    });
    expect(result.diagnostics.explorationAllowed).toBe(false);
    expect(result.candidates[0]?.breakdown.x).toBe(0);
  });

  it.each([
    ["full capacity", { currentLoad: 8 }, "教师当前已满负载"],
    ["wrong area", { areaCode: "徐汇" }, "线下授课区域不匹配"],
    ["missing slot", { availability: [] }, "没有具体可重叠时段"],
    ["unverified", { identityVerified: false }, "身份或教学资质未完整核验"],
  ])("hard-filters %s before scoring", (_name, patch, reason) => {
    const result = rankCandidates(demand, [cloneTeacher(patch)], { generatedAt: "2026-11-17T00:00:00Z" });
    expect(result.candidates).toHaveLength(0);
    expect(result.rejected[0]?.reasons).toContain(reason);
    expect(result.diagnostics.message).toContain("调整具体时段");
  });

  it("does not include effective hourly wage as an eighth scoring term", () => {
    const result = rankCandidates(demand, [cloneTeacher({ roundTripMinutes: 0, prepMinutes: 0 })], {
      generatedAt: "2026-11-17T00:00:00Z",
    });
    const candidate = result.candidates[0]!;
    expect(candidate.effectiveHourlyFen).toBe(candidate.quotedPriceFen);
    expect(candidate.breakdown.b).toBe(0);
    expect(Object.keys(candidate.breakdown.weighted)).toHaveLength(7);
  });
});
