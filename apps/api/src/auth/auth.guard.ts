import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { AuthService, type AuthUser } from "./auth.service";

export type AuthenticatedRequest = Request & { user: AuthUser };
export const Roles = (...roles: string[]) => SetMetadata("roles", roles);
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
  return request.user;
});

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = await this.auth.validate(request.cookies?.mvp_session as string | undefined);
    if (!user) throw new UnauthorizedException("请先登录");
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      const csrf = request.headers["x-csrf-token"];
      if (typeof csrf !== "string" || csrf !== user.csrfToken) {
        throw new ForbiddenException("CSRF 校验失败");
      }
    }
    request.user = user;
    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<string[]>("roles", [context.getHandler(), context.getClass()]);
    if (!roles || roles.length === 0) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return roles.includes(request.user.role);
  }
}
