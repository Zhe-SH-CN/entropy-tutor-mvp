import { Injectable, NotFoundException } from "@nestjs/common";
import { rankCandidates, type Demand, type RecommendationOptions, type RecommendationResult, type Teacher } from "@mvp/shared";
import { PrismaService } from "../prisma.service";

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview() {
    const now = Date.now();
    const since30 = new Date(now - 30 * 86400000);
    const since7 = new Date(now - 7 * 86400000);
    const [allDemands, events, artifacts, runs, latestRun, staleDrafts, staleInvitations] = await Promise.all([
      this.prisma.demand.findMany({ where: { confirmedAt: { not: null } }, include: { relationship: { include: { orders: true, lessons: true } } } }),
      this.prisma.eventLog.groupBy({ by: ["name"], _count: { _all: true }, orderBy: { name: "asc" } }),
      this.prisma.artifact.groupBy({ by: ["provider", "status"], _count: { _all: true } }),
      this.prisma.recommendationRun.findMany({ where: { createdAt: { gte: since7 } }, select: { results: true } }),
      this.prisma.recommendationRun.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true } }),
      this.prisma.artifact.count({ where: { status: "draft", createdAt: { lt: new Date(now - 86400000) } } }),
      this.prisma.invitation.count({ where: { status: "invited", createdAt: { lt: new Date(now - 12 * 3600000) } } }),
    ]);
    const demands = allDemands.filter((demand) => demand.createdAt >= since30);
    const mature = allDemands.filter((demand) => demand.createdAt <= since30 && !["excluded", "draft", "cancelled"].includes(demand.status));
    const paid = demands.filter((demand) => demand.relationship?.orders.some((order) => order.status === "paid"));
    const allPaid = allDemands.filter((demand) => demand.relationship?.orders.some((order) => order.status === "paid"));
    const within30 = (demandCreatedAt: Date, lessonCreatedAt: Date) => lessonCreatedAt >= demandCreatedAt && lessonCreatedAt.getTime() - demandCreatedAt.getTime() <= 30 * 86400000;
    const second = demands.filter((demand) => demand.relationship?.lessons.some((lesson) => lesson.status === "completed" && lesson.sequence >= 2 && within30(demand.createdAt, lesson.createdAt)));
    const fourth = mature.filter((demand) => demand.relationship?.lessons.some((lesson) => lesson.status === "completed" && lesson.sequence === 4 && within30(demand.createdAt, lesson.createdAt)));
    const candidates = runs.flatMap((run) => (run.results as unknown as RecommendationResult).candidates);
    const exploration = candidates.filter((candidate) => candidate.breakdown.x > 0).length;
    const generated = artifacts.filter((item) => item.status !== "rejected").reduce((sum, item) => sum + item._count._all, 0);
    const confirmed = artifacts.filter((item) => item.status === "confirmed").reduce((sum, item) => sum + item._count._all, 0);
    const exceptions = [
      ...allPaid.filter((demand) => demand.relationship!.lessons.length === 0).map((demand) => ({ type: "missing_lesson", entityId: demand.relationship!.id, reason: "已支付但尚无记课" })),
      ...(staleDrafts > 0 ? [{ type: "stale_ai_draft", entityId: "artifact", reason: `${staleDrafts} 份 AI 草稿超过 24 小时未审核` }] : []),
      ...(staleInvitations > 0 ? [{ type: "stale_invitation", entityId: "invitation", reason: `${staleInvitations} 份邀请超过 48 小时未响应` }] : []),
    ];
    return {
      cohort30d: {
        recentDemandCount: demands.length,
        matureDemandCount: mature.length,
        paidCount: paid.length,
        secondLessonCount: second.length,
        fourthLessonCount: fourth.length,
        northStarRate: mature.length ? fourth.length / mature.length : null,
      },
      eventFunnel: Object.fromEntries(events.map((event) => [event.name, event._count._all])),
      ai: { generated, confirmed, confirmationRate: generated ? confirmed / generated : 0, byProviderAndStatus: artifacts },
      recommendation: { runs7d: runs.length, candidateReturns7d: candidates.length, explorationReturns7d: exploration, explorationReturnRate7d: candidates.length ? exploration / candidates.length : 0, latestRunId: latestRun?.id ?? null },
      exceptions,
    };
  }

  async replay(runId: string) {
    const run = await this.prisma.recommendationRun.findUnique({ where: { id: runId } });
    if (!run) throw new NotFoundException("推荐快照不存在");
    const snapshot = run.inputSnapshot as unknown as { demand: Demand; teachers: Teacher[]; options?: Omit<RecommendationOptions, "generatedAt"> };
    const expected = run.results as unknown as RecommendationResult;
    const actual = rankCandidates(snapshot.demand, snapshot.teachers, { ...snapshot.options, generatedAt: run.createdAt.toISOString() });
    const signature = (result: RecommendationResult) => result.candidates.map((candidate) => ({ teacherId: candidate.teacherId, score: candidate.breakdown.finalScore.toFixed(4), slot: candidate.slot }));
    return { runId, ruleVersion: run.ruleVersion, matches: JSON.stringify(signature(expected)) === JSON.stringify(signature(actual)), expected: signature(expected), actual: signature(actual) };
  }
}
