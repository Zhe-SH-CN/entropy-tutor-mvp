import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { AnalyticsService } from "./analytics.service";
import { AuthGuard, Roles, RolesGuard } from "../auth/auth.guard";

@Controller("analytics")
@UseGuards(AuthGuard, RolesGuard)
@Roles("ops")
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}
  @Get("overview")
  overview() { return this.analytics.overview(); }
  @Get("replay/:runId")
  replay(@Param("runId") runId: string) { return this.analytics.replay(runId); }
}
