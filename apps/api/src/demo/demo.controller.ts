import { BadRequestException, Body, Controller, Get, Headers, Param, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { DemoService } from "./demo.service";
import { AuthGuard, CurrentUser, Roles, RolesGuard } from "../auth/auth.guard";
import type { AuthUser } from "../auth/auth.service";

const teacherIdSchema = z.object({ teacherId: z.string().min(1).max(100) });

@Controller()
@UseGuards(AuthGuard, RolesGuard)
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  @Get("demo/bootstrap")
  bootstrap(@CurrentUser() user: AuthUser) { return this.demo.bootstrap(user); }

  @Post("demands")
  @Roles("parent")
  createDemand(@CurrentUser() user: AuthUser, @Body() body: unknown) { return this.demo.createDemand(user, body); }

  @Post("demands/:id/structure")
  @Roles("parent")
  structureDemand(@Param("id") demandId: string, @CurrentUser() user: AuthUser) { return this.demo.structureDemand(demandId, user); }

  @Post("demands/:id/confirm")
  @Roles("parent")
  confirmDemand(@Param("id") demandId: string, @CurrentUser() user: AuthUser) { return this.demo.confirmDemand(demandId, user); }

  @Post("demands/:id/recommend")
  @Roles("parent", "ops")
  recommend(@Param("id") demandId: string, @CurrentUser() user: AuthUser) { return this.demo.recommend(demandId, user); }

  @Post("recommendations/:runId/exposures")
  @Roles("parent")
  candidateExposed(@Param("runId") runId: string, @Body() body: unknown, @CurrentUser() user: AuthUser) {
    const parsed = teacherIdSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("teacherId 无效");
    return this.demo.candidateExposed(runId, parsed.data.teacherId, user);
  }

  @Post("demands/:id/invitations")
  @Roles("parent")
  invite(@Param("id") demandId: string, @Body() body: unknown, @CurrentUser() user: AuthUser) {
    const parsed = teacherIdSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("teacherId 无效");
    return this.demo.invite(demandId, parsed.data.teacherId, user);
  }

  @Post("invitations/:id/accept")
  @Roles("teacher")
  accept(@Param("id") invitationId: string, @CurrentUser() user: AuthUser) { return this.demo.accept(invitationId, user); }

  @Post("invitations/:id/decline")
  @Roles("teacher")
  decline(@Param("id") invitationId: string, @Body() body: unknown, @CurrentUser() user: AuthUser) { return this.demo.decline(invitationId, body, user); }

  @Post("invitations/:id/meeting")
  @Roles("parent")
  scheduleMeeting(@Param("id") invitationId: string, @CurrentUser() user: AuthUser) { return this.demo.scheduleMeeting(invitationId, user); }

  @Post("meetings/:id/complete")
  @Roles("teacher")
  completeMeeting(@Param("id") meetingId: string, @CurrentUser() user: AuthUser) { return this.demo.completeMeeting(meetingId, user); }

  @Post("meetings/:id/outcome")
  @Roles("parent", "teacher")
  meetingOutcome(@Param("id") meetingId: string, @Body() body: unknown, @CurrentUser() user: AuthUser) { return this.demo.meetingOutcome(meetingId, body, user); }

  @Post("meetings/:id/exception")
  @Roles("parent", "teacher")
  meetingException(@Param("id") meetingId: string, @Body() body: unknown, @CurrentUser() user: AuthUser) { return this.demo.meetingException(meetingId, body, user); }

  @Post("relationships/:id/orders")
  @Roles("parent")
  createOrder(@Param("id") relationshipId: string, @Headers("idempotency-key") key: string, @Body() body: unknown, @CurrentUser() user: AuthUser) { return this.demo.createOrder(relationshipId, key, body, user); }

  @Post("relationships/:id/lessons")
  @Roles("teacher")
  recordLesson(@Param("id") relationshipId: string, @Body() body: unknown, @CurrentUser() user: AuthUser) { return this.demo.recordLesson(relationshipId, body, user); }

  @Post("lessons/:id/confirm")
  @Roles("parent", "ops")
  confirmLesson(@Param("id") lessonId: string, @CurrentUser() user: AuthUser) { return this.demo.confirmLesson(lessonId, user); }

  @Post("lessons/:id/cancel")
  @Roles("parent", "teacher", "ops")
  cancelLesson(@Param("id") lessonId: string, @Body() body: unknown, @CurrentUser() user: AuthUser) { return this.demo.cancelLesson(lessonId, body, user); }

  @Post("lessons/:id/no-show")
  @Roles("parent", "teacher", "ops")
  noShowLesson(@Param("id") lessonId: string, @Body() body: unknown, @CurrentUser() user: AuthUser) { return this.demo.cancelLesson(lessonId, body, user, true); }

  @Get("reports")
  @Roles("parent")
  reports(@CurrentUser() user: AuthUser) { return this.demo.reports(user); }

  @Post("reports/:id/view")
  @Roles("parent")
  viewReport(@Param("id") artifactId: string, @CurrentUser() user: AuthUser) { return this.demo.markReportViewed(artifactId, user); }

  @Post("relationships/:id/feedback")
  @Roles("parent")
  feedback(@Param("id") relationshipId: string, @Body() body: unknown, @CurrentUser() user: AuthUser) { return this.demo.feedback(relationshipId, body, user); }

  @Get("ops/teachers")
  @Roles("ops")
  opsTeachers() { return this.demo.opsTeachers(); }

  @Get("ops/artifacts")
  @Roles("ops")
  opsArtifacts() { return this.demo.opsArtifacts(); }

  @Post("artifacts/:id/review")
  @Roles("ops")
  reviewArtifact(@Param("id") artifactId: string, @Body() body: unknown, @CurrentUser() user: AuthUser) { return this.demo.reviewArtifact(artifactId, body, user); }

  @Post("teachers/:id/review")
  @Roles("ops")
  reviewTeacher(@Param("id") teacherId: string, @Body() body: unknown, @CurrentUser() user: AuthUser) { return this.demo.reviewTeacher(teacherId, body, user); }

  @Post("teacher/availability")
  @Roles("teacher")
  updateAvailability(@Body() body: unknown, @CurrentUser() user: AuthUser) { return this.demo.updateAvailability(body, user); }

  @Post("recommendations/:runId/overrides")
  @Roles("ops")
  manualOverride(@Param("runId") runId: string, @Body() body: unknown, @CurrentUser() user: AuthUser) { return this.demo.manualOverride(runId, body, user); }
}
