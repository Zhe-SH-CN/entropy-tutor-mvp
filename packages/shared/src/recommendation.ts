export const RULE_VERSION = "rule_v0.2" as const;

export type TeachingMode = "online" | "offline";
export type GradeBand = "小学" | "初中" | "高中";

export interface TimeSlot {
  day: number;
  startMinute: number;
  endMinute: number;
}

export interface Demand {
  id: string;
  subject: string;
  gradeBand: GradeBand;
  mode: TeachingMode;
  areaCode: string;
  budgetMinFen: number;
  budgetMaxFen: number;
  lessonMinutes: number;
  preferredSlots: TimeSlot[];
  objectives: string[];
  requiredExperience: string[];
  preferenceTags: string[];
}

export interface ReliabilityMetrics {
  attendedLessons: number;
  cancelledLessons: number;
  reportTotal: number;
  onTimeReports: number;
  continuedRelationships: number;
  endedRelationships: number;
}

export interface Teacher {
  id: string;
  displayName: string;
  subjects: string[];
  gradeBands: GradeBand[];
  teachingModes: TeachingMode[];
  areaCode: string;
  quotedPriceFen: number;
  targetGrossHourlyFen: number;
  identityVerified: boolean;
  educationVerified: boolean;
  transcriptVerified: boolean;
  interviewScore: number;
  currentLoad: number;
  maxCapacity: number;
  roundTripMinutes: number;
  prepMinutes: number;
  availability: TimeSlot[];
  goalTags: string[];
  experienceTags: string[];
  styleTags: string[];
  isNew: boolean;
  metrics: ReliabilityMetrics;
}

export interface ScoreInput {
  p: number;
  e: number;
  r: number;
  c: number;
  b: number;
  l: number;
  x: number;
}

export interface ScoreBreakdown extends ScoreInput {
  finalScore: number;
  weighted: {
    parentFit: number;
    teacherEarnings: number;
    reliability: number;
    continuation: number;
    burdenPenalty: number;
    loadPenalty: number;
    exploration: number;
  };
}

export interface CandidateScore {
  teacherId: string;
  teacherName: string;
  slot: TimeSlot;
  quotedPriceFen: number;
  effectiveHourlyFen: number;
  breakdown: ScoreBreakdown;
  reasons: string[];
}

export interface RejectedTeacher {
  teacherId: string;
  reasons: string[];
}

export interface RecommendationResult {
  demandId: string;
  ruleVersion: typeof RULE_VERSION;
  generatedAt: string;
  candidates: CandidateScore[];
  rejected: RejectedTeacher[];
  diagnostics: {
    eligibleTeacherCount: number;
    explorationAllowed: boolean;
    message: string;
  };
}

export interface RecommendationOptions {
  generatedAt: string;
  rollingExposureCount?: number;
  rollingExplorationCount?: number;
  explorationAllowed?: boolean;
}

export const clamp01 = (value: number): number =>
  Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

export const round = (value: number, digits = 4): number => {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

export const shrink = (
  observedValue: number,
  sampleCount: number,
  prior: number,
): number => {
  const n = Math.max(0, sampleCount);
  return prior + (n / (n + 5)) * (clamp01(observedValue) - prior);
};

export function scoreCandidate(input: ScoreInput): ScoreBreakdown {
  const p = clamp01(input.p);
  const e = clamp01(input.e);
  const r = clamp01(input.r);
  const c = clamp01(input.c);
  const b = clamp01(input.b);
  const l = clamp01(input.l);
  const x = Math.max(0, Math.min(5, input.x));
  const weighted = {
    parentFit: 40 * p,
    teacherEarnings: 20 * e,
    reliability: 20 * r,
    continuation: 20 * c,
    burdenPenalty: 10 * b,
    loadPenalty: 10 * l ** 2,
    exploration: x,
  };
  const finalScore =
    weighted.parentFit +
    weighted.teacherEarnings +
    weighted.reliability +
    weighted.continuation -
    weighted.burdenPenalty -
    weighted.loadPenalty +
    weighted.exploration;

  return {
    p,
    e,
    r,
    c,
    b,
    l,
    x,
    finalScore: round(finalScore),
    weighted: {
      parentFit: round(weighted.parentFit),
      teacherEarnings: round(weighted.teacherEarnings),
      reliability: round(weighted.reliability),
      continuation: round(weighted.continuation),
      burdenPenalty: round(weighted.burdenPenalty),
      loadPenalty: round(weighted.loadPenalty),
      exploration: round(weighted.exploration),
    },
  };
}

export function slotsOverlap(a: TimeSlot, b: TimeSlot): boolean {
  return (
    a.day === b.day &&
    a.startMinute < b.endMinute &&
    b.startMinute < a.endMinute
  );
}

export const slotKey = (slot: TimeSlot): string =>
  `${slot.day}-${slot.startMinute}-${slot.endMinute}`;

const overlapRatio = (wanted: string[], actual: string[]): number => {
  if (wanted.length === 0) return 1;
  const actualSet = new Set(actual);
  return wanted.filter((item) => actualSet.has(item)).length / wanted.length;
};

function calculateFeatures(
  demand: Demand,
  teacher: Teacher,
  explorationAllowed: boolean,
): ScoreInput {
  const attendanceN = teacher.metrics.attendedLessons + teacher.metrics.cancelledLessons;
  const attendanceRaw = attendanceN === 0
    ? 0
    : teacher.metrics.attendedLessons / attendanceN;
  const attendance = shrink(attendanceRaw, attendanceN, 0.85);
  const reportRaw = teacher.metrics.reportTotal === 0
    ? 0
    : teacher.metrics.onTimeReports / teacher.metrics.reportTotal;
  const report = shrink(reportRaw, teacher.metrics.reportTotal, 0.7);
  const continuationN =
    teacher.metrics.continuedRelationships + teacher.metrics.endedRelationships;
  const continuationRaw = continuationN === 0
    ? 0
    : teacher.metrics.continuedRelationships / continuationN;

  const p = clamp01(
    0.35 +
      0.25 * overlapRatio(demand.objectives, teacher.goalTags) +
      0.2 * overlapRatio(demand.requiredExperience, teacher.experienceTags) +
      0.1 * overlapRatio(demand.preferenceTags, teacher.styleTags) +
      0.1 * attendance,
  );
  const e = clamp01(
    0.5 +
      Math.log(teacher.quotedPriceFen / teacher.targetGrossHourlyFen) / 2,
  );
  const r = clamp01(0.6 * attendance + 0.4 * report);
  const c = shrink(continuationRaw, continuationN, 0.35);
  const b = clamp01(
    (teacher.roundTripMinutes / demand.lessonMinutes) * 0.6 +
      (teacher.prepMinutes / demand.lessonMinutes) * 0.4,
  );
  const l = clamp01(teacher.currentLoad / teacher.maxCapacity);

  return {
    p,
    e,
    r,
    c,
    b,
    l,
    x: teacher.isNew && explorationAllowed ? 5 : 0,
  };
}

function eligibilityReasons(demand: Demand, teacher: Teacher): string[] {
  const reasons: string[] = [];
  if (
    !teacher.identityVerified ||
    !teacher.educationVerified ||
    !teacher.transcriptVerified
  ) {
    reasons.push("身份或教学资质未完整核验");
  }
  if (teacher.interviewScore < 60) reasons.push("教学试讲未达到 60 分");
  if (!teacher.subjects.includes(demand.subject)) reasons.push("科目不匹配");
  if (!teacher.gradeBands.includes(demand.gradeBand)) reasons.push("学段不匹配");
  if (!teacher.teachingModes.includes(demand.mode)) reasons.push("授课模式不匹配");
  if (demand.mode === "offline" && teacher.areaCode !== demand.areaCode) {
    reasons.push("线下授课区域不匹配");
  }
  if (
    teacher.quotedPriceFen < demand.budgetMinFen ||
    teacher.quotedPriceFen > demand.budgetMaxFen
  ) {
    reasons.push("报价不在需求预算内");
  }
  if (teacher.currentLoad >= teacher.maxCapacity) reasons.push("教师当前已满负载");
  if (
    !demand.preferredSlots.some((slot) =>
      teacher.availability.some((available) => slotsOverlap(slot, available)),
    )
  ) {
    reasons.push("没有具体可重叠时段");
  }
  return reasons;
}

function buildReasons(score: ScoreBreakdown, explorationAllowed: boolean): string[] {
  const reasons = [
    `家长目标适配 ${Math.round(score.p * 100)}%`,
    `时间与履约可靠性 ${Math.round(score.r * 100)}%`,
    `教师报价收益 ${Math.round(score.e * 100)}%`,
  ];
  if (score.b > 0) reasons.push(`通勤/备课负担扣分 ${score.weighted.burdenPenalty.toFixed(1)}`);
  if (score.l > 0) reasons.push(`当前负载 ${Math.round(score.l * 100)}%，平方扣分 ${score.weighted.loadPenalty.toFixed(1)}`);
  if (score.x > 0) {
    reasons.push(`新教师探索 +${score.x}（${explorationAllowed ? "配额内" : "未启用"}）`);
  }
  return reasons;
}

export function rankCandidates(
  demand: Demand,
  teachers: Teacher[],
  options: RecommendationOptions,
): RecommendationResult {
  const rollingExposureCount = Math.max(0, options.rollingExposureCount ?? 0);
  const rollingExplorationCount = Math.max(0, options.rollingExplorationCount ?? 0);
  const explorationAllowed = options.explorationAllowed ?? (
    rollingExposureCount === 0 ||
    rollingExplorationCount / rollingExposureCount < 0.2
  );
  const rejected: RejectedTeacher[] = [];
  const pool: CandidateScore[] = [];

  for (const teacher of teachers) {
    const reasons = eligibilityReasons(demand, teacher);
    if (reasons.length > 0) {
      rejected.push({ teacherId: teacher.id, reasons });
      continue;
    }
    const score = scoreCandidate(calculateFeatures(demand, teacher, explorationAllowed));
    const matchedSlots = demand.preferredSlots.filter((slot) =>
      teacher.availability.some((available) => slotsOverlap(slot, available)),
    );
    for (const slot of matchedSlots) {
      pool.push({
        teacherId: teacher.id,
        teacherName: teacher.displayName,
        slot,
        quotedPriceFen: teacher.quotedPriceFen,
        effectiveHourlyFen: Math.round(
          (teacher.quotedPriceFen * demand.lessonMinutes) /
            (demand.lessonMinutes + teacher.roundTripMinutes + teacher.prepMinutes),
        ),
        breakdown: score,
        reasons: buildReasons(score, explorationAllowed),
      });
    }
  }

  pool.sort(
    (a, b) =>
      b.breakdown.finalScore - a.breakdown.finalScore ||
      a.teacherId.localeCompare(b.teacherId) ||
      slotKey(a.slot).localeCompare(slotKey(b.slot)),
  );

  const selected: CandidateScore[] = [];
  const selectedTeachers = new Set<string>();
  let explorationSelected = false;
  for (const candidate of pool) {
    if (selectedTeachers.has(candidate.teacherId)) continue;
    if (candidate.breakdown.x > 0 && explorationSelected) continue;
    selected.push(candidate);
    selectedTeachers.add(candidate.teacherId);
    if (candidate.breakdown.x > 0) explorationSelected = true;
    if (selected.length === 3) break;
  }

  if (
    selected.length > 1 &&
    new Set(selected.map((candidate) => slotKey(candidate.slot))).size === 1
  ) {
    const alternative = pool.find(
      (candidate) =>
        !selectedTeachers.has(candidate.teacherId) &&
        slotKey(candidate.slot) !== slotKey(selected[0]!.slot) &&
        (!(candidate.breakdown.x > 0) || !explorationSelected),
    );
    if (alternative) {
      selected[selected.length - 1] = alternative;
    }
  }

  const eligibleTeacherCount = new Set(pool.map((candidate) => candidate.teacherId)).size;
  return {
    demandId: demand.id,
    ruleVersion: RULE_VERSION,
    generatedAt: options.generatedAt,
    candidates: selected,
    rejected,
    diagnostics: {
      eligibleTeacherCount,
      explorationAllowed,
      message:
        selected.length > 0
          ? `返回 ${selected.length} 名候选；教师唯一、最多一名探索候选，并尽可能保持时段多样。`
          : "当前没有满足全部硬约束的教师。请调整具体时段、预算、授课模式或补充候选教师。",
    },
  };
}
