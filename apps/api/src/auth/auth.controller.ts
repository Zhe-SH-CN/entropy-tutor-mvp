import { Body, Controller, Get, Post, Res, UnauthorizedException, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import { z } from "zod";
import { AuthService, type AuthUser } from "./auth.service";
import { AuthGuard, CurrentUser } from "./auth.guard";

const loginSchema = z.object({ email: z.string().email().max(200), password: z.string().min(8).max(200) });

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("login")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async login(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) throw new UnauthorizedException("邮箱或密码错误");
    const result = await this.auth.login(parsed.data.email, parsed.data.password);
    if (!result) throw new UnauthorizedException("邮箱或密码错误");
    const secure = process.env.COOKIE_SECURE === "true";
    response.cookie("mvp_session", result.token, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 8 * 60 * 60 * 1000 });
    response.cookie("mvp_csrf", result.csrfToken, { httpOnly: false, sameSite: "lax", secure, path: "/", maxAge: 8 * 60 * 60 * 1000 });
    return { user: result.user };
  }

  @Get("me")
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return { user: { id: user.id, role: user.role, teacherId: user.teacherId } };
  }

  @Post("logout")
  @UseGuards(AuthGuard)
  async logout(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(user.sessionId);
    response.clearCookie("mvp_session", { path: "/" });
    response.clearCookie("mvp_csrf", { path: "/" });
    return { ok: true };
  }
}
