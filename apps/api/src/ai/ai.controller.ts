import { Body, Controller, Get, Param, Post, Put, UseGuards } from "@nestjs/common";
import { AiService } from "./ai.service";
import { AuthGuard, CurrentUser, Roles, RolesGuard } from "../auth/auth.guard";
import type { AuthUser } from "../auth/auth.service";

@Controller()
@UseGuards(AuthGuard, RolesGuard)
export class AiController {
  constructor(private readonly ai: AiService) {}
  @Get("ai/settings")
  @Roles("teacher")
  settings(@CurrentUser() user: AuthUser) { return this.ai.getSettings(user); }

  @Put("ai/settings")
  @Roles("teacher")
  saveSettings(@CurrentUser() user: AuthUser, @Body() body: unknown) { return this.ai.saveSettings(user, body); }

  @Post("lessons/:id/artifacts")
  @Roles("teacher")
  generate(@Param("id") lessonId: string, @Body() body: unknown, @CurrentUser() user: AuthUser) { return this.ai.generate(lessonId, body, user); }

  @Post("relationships/:id/prep")
  @Roles("teacher")
  generatePrep(@Param("id") relationshipId: string, @CurrentUser() user: AuthUser) { return this.ai.generatePrep(relationshipId, user); }

  @Post("artifacts/:id/confirm")
  @Roles("teacher")
  confirm(@Param("id") artifactId: string, @Body() body: unknown, @CurrentUser() user: AuthUser) { return this.ai.confirm(artifactId, body, user); }
}
