import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";

function normalizePayload(value: unknown): Prisma.InputJsonValue {
  if (Array.isArray(value)) return value.map(normalizePayload);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`), normalizePayload(item)])) as Prisma.InputJsonValue;
  }
  return value as Prisma.InputJsonValue;
}

@Injectable()
export class EventsService {
  async record(
    tx: Prisma.TransactionClient,
    data: { idempotencyKey: string; name: string; actorId: string | null; actorType?: string; source?: string; entityType: string; entityId: string; payload?: Prisma.InputJsonValue },
  ) {
    return tx.eventLog.create({
      data: {
        id: randomUUID(),
        idempotencyKey: data.idempotencyKey,
        name: data.name,
        actorId: data.actorId,
        actorType: data.actorType ?? (data.actorId ? "user" : "system"),
        source: data.source ?? "server",
        entityType: data.entityType,
        entityId: data.entityId,
        payload: normalizePayload(data.payload ?? {}),
      },
    });
  }
}
