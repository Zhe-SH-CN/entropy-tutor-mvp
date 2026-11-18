import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { PrismaService } from "./prisma.service";
import { EventsService } from "./events.service";
import { HealthController } from "./health.controller";
import { AuthController } from "./auth/auth.controller";
import { AuthService } from "./auth/auth.service";
import { AuthGuard, RolesGuard } from "./auth/auth.guard";
import { DemoController } from "./demo/demo.controller";
import { DemoService } from "./demo/demo.service";
import { AiController } from "./ai/ai.controller";
import { AiService } from "./ai/ai.service";
import { PaymentsController } from "./payments/payments.controller";
import { PaymentsService } from "./payments/payments.service";
import { AnalyticsController } from "./analytics/analytics.controller";
import { AnalyticsService } from "./analytics/analytics.service";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ["../../.env", ".env"] }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
  ],
  controllers: [HealthController, AuthController, DemoController, AiController, PaymentsController, AnalyticsController],
  providers: [PrismaService, EventsService, AuthService, AuthGuard, RolesGuard, DemoService, AiService, PaymentsService, AnalyticsService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
