import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHmac, timingSafeEqual, createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { PrismaService } from "../prisma.service";
import { EventsService } from "../events.service";

const webhookSchema = z.object({ providerEventId: z.string().min(8).max(120), orderId: z.string().min(1).max(120), status: z.literal("paid") });

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService, private readonly events: EventsService) {}

  async handleWebhook(rawBody: Buffer | undefined, signature: string | undefined) {
    const secret = process.env.PAYMENT_WEBHOOK_SECRET;
    if (!secret || !rawBody || !signature) throw new UnauthorizedException("回调签名无效");
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    const suppliedBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (suppliedBuffer.length !== expectedBuffer.length || !timingSafeEqual(suppliedBuffer, expectedBuffer)) {
      throw new UnauthorizedException("回调签名无效");
    }
    let body: unknown;
    try { body = JSON.parse(rawBody.toString("utf8")); } catch { throw new BadRequestException("回调 JSON 无效"); }
    const parsed = webhookSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("回调结构无效");
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const existing = await this.prisma.paymentEvent.findUnique({ where: { providerEventId: parsed.data.providerEventId } });
      if (existing) return { ok: true, duplicate: true };
      const order = await this.prisma.paymentOrder.findUnique({ where: { id: parsed.data.orderId } });
      if (!order) throw new BadRequestException("订单不存在");
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.paymentEvent.create({ data: { id: randomUUID(), providerEventId: parsed.data.providerEventId, orderId: order.id, payloadHash: createHash("sha256").update(rawBody).digest("hex") } });
          await tx.paymentOrder.update({ where: { id: order.id }, data: { status: "paid", paidAt: order.paidAt ?? new Date() } });
          await this.events.record(tx, { idempotencyKey: `webhook:${parsed.data.providerEventId}`, name: "payment_status_changed", actorId: null, source: "webhook", entityType: "order", entityId: order.id, payload: { provider: "sandbox", providerEventId: parsed.data.providerEventId, fromStatus: order.status, toStatus: "paid", verificationMethod: "webhook_hmac" } });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        return { ok: true, duplicate: false };
      } catch (error) {
        if (!["P2002", "P40001"].includes((error as { code?: string }).code ?? "")) throw error;
      }
    }
    throw new ConflictException("并发回调暂未收敛，请稍后重试");
  }
}
