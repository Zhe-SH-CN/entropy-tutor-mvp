import { Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import * as argon2 from "argon2";
import { PrismaService } from "../prisma.service";

export interface AuthUser {
  id: string;
  role: string;
  teacherId: string | null;
  csrfToken: string;
  sessionId: string;
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user || !(await argon2.verify(user.passwordHash, password))) return null;
    const token = randomBytes(32).toString("base64url");
    const csrfToken = randomBytes(32).toString("base64url");
    const session = await this.prisma.session.create({
      data: {
        id: randomBytes(16).toString("hex"),
        tokenHash: hashToken(token),
        csrfToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
      },
    });
    return { token, csrfToken, sessionId: session.id, user: { id: user.id, role: user.role, email: user.email } };
  }

  async validate(token: string | undefined): Promise<AuthUser | null> {
    if (!token) return null;
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { include: { teacher: true } } },
    });
    if (!session || session.expiresAt <= new Date()) return null;
    return {
      id: session.user.id,
      role: session.user.role,
      teacherId: session.user.teacher?.id ?? null,
      csrfToken: session.csrfToken,
      sessionId: session.id,
    };
  }

  async logout(sessionId: string) {
    await this.prisma.session.deleteMany({ where: { id: sessionId } });
  }
}
