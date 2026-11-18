import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "./prisma.service";
import { validateRuntimeEnv } from "./runtime-env";

export type WorkerBatchResult = { expiredInvitations: number; claimed: number; completed: number; retried: number; dead: number };

export async function processDueWork(prisma: PrismaClient, now = new Date()): Promise<WorkerBatchResult> {
  const result: WorkerBatchResult = { expiredInvitations: 0, claimed: 0, completed: 0, retried: 0, dead: 0 };
  const staleInvitations = await prisma.invitation.findMany({ where: { status: "invited", OR: [{ expiresAt: { lte: now } }, { AND: [{ expiresAt: null }, { createdAt: { lte: new Date(now.getTime() - 12 * 3600000) } }] }] }, take: 50 });
  for (const invitation of staleInvitations) {
    const changed = await prisma.$transaction(async (tx) => {
      const update = await tx.invitation.updateMany({ where: { id: invitation.id, status: "invited" }, data: { status: "expired", respondedAt: now } });
      if (update.count === 0) return false;
      await tx.eventLog.create({ data: { id: randomUUID(), idempotencyKey: `invitation:${invitation.id}:expired`, name: "teacher_offer_responded", actorType: "system", source: "worker", entityType: "invitation", entityId: invitation.id, payload: { response: "expired", reason_code: "response_timeout", response_seconds: Math.max(0, Math.floor((now.getTime() - invitation.createdAt.getTime()) / 1000)) }, occurredAt: now } });
      return true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (changed) result.expiredInvitations += 1;
  }

  const jobs = await prisma.job.findMany({ where: { status: "queued", availableAt: { lte: now } }, orderBy: { createdAt: "asc" }, take: 20 });
  for (const candidate of jobs) {
    const claimed = await prisma.job.updateMany({ where: { id: candidate.id, status: "queued" }, data: { status: "running", attempts: { increment: 1 }, lockedAt: now } });
    if (claimed.count === 0) continue;
    result.claimed += 1;
    const job = await prisma.job.findUniqueOrThrow({ where: { id: candidate.id } });
    try {
      if (job.kind !== "demo.noop") throw new Error("No real worker adapter configured for this job type");
      await prisma.job.update({ where: { id: job.id }, data: { status: "done", lockedAt: null } });
      result.completed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : "Unknown job failure";
      const previousPayload = typeof job.payload === "object" && job.payload !== null && !Array.isArray(job.payload) ? job.payload : {};
      const payload = { ...previousPayload, lastError: message } as Prisma.InputJsonValue;
      if (job.attempts >= 3) {
        await prisma.job.update({ where: { id: job.id }, data: { status: "dead", payload, lockedAt: null } });
        result.dead += 1;
      } else {
        const delayMs = 60000 * 2 ** (job.attempts - 1);
        await prisma.job.update({ where: { id: job.id }, data: { status: "queued", payload, availableAt: new Date(now.getTime() + delayMs), lockedAt: null } });
        result.retried += 1;
      }
    }
  }
  return result;
}

async function main() {
  validateRuntimeEnv();
  const prisma = new PrismaService();
  await prisma.$connect();
  console.log("Synthetic Demo worker started. Unknown job kinds retry at most three times; no external adapter is claimed.");
  const timer = setInterval(async () => {
    try {
      const result = await processDueWork(prisma);
      if (result.expiredInvitations + result.claimed > 0) console.log(JSON.stringify({ at: new Date().toISOString(), ...result }));
    } catch (error) {
      console.error("Worker batch failed", error instanceof Error ? error.message : "unknown");
    }
  }, 10000);
  const stop = async () => {
    clearInterval(timer);
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", () => void stop());
  process.on("SIGINT", () => void stop());
}

if (require.main === module) void main();
