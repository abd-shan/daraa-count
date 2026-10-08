import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { actorSelect } from './auth.types';
import { audit } from '../common/audit';
import { readConfig } from '../config';
const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');
@Injectable()
export class AuthService {
  private dummyHash = argon2.hash(randomBytes(32), { type: argon2.argon2id });
  constructor(private readonly db: PrismaService) {}
  async login(username: string, password: string) {
    const user = await this.db.user.findUnique({
      where: { username },
      include: { municipality: true },
    });
    const valid = await argon2.verify(
      user?.passwordHash ?? (await this.dummyHash),
      password,
    );
    if (!valid || !user || !user.isActive || user.role !== 'SUPER_ADMIN') {
      await audit(this.db, null, 'LOGIN_FAILED');
      throw new UnauthorizedException('اسم المستخدم أو كلمة المرور غير صحيحة');
    }
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(
      Date.now() + readConfig().SESSION_TTL_HOURS * 3600000,
    );
    const actor = await this.db.$transaction(async (tx) => {
      // Serialize login with password reset/disable and recheck the verified hash.
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id}::uuid FOR UPDATE`;
      const current = await tx.user.findUnique({
        where: { id: user.id },
        include: { municipality: true },
      });
      if (
        !current ||
        current.passwordHash !== user.passwordHash ||
        !current.isActive ||
        current.role !== 'SUPER_ADMIN'
      )
        throw new UnauthorizedException(
          'اسم المستخدم أو كلمة المرور غير صحيحة',
        );
      const actor = await tx.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
        select: actorSelect,
      });
      await tx.session.create({
        data: { userId: actor.id, tokenHash: hashToken(token), expiresAt },
      });
      await audit(tx, actor, 'LOGIN', 'User', actor.id);
      return actor;
    });
    return { token, expiresAt, actor };
  }
  async authenticate(token?: string) {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token))
      throw new UnauthorizedException(
        'انتهت جلسة الدخول. يرجى تسجيل الدخول مجدداً',
      );
    const session = await this.db.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { select: actorSelect } },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !session.user.isActive ||
      session.user.role !== 'SUPER_ADMIN'
    )
      throw new UnauthorizedException(
        'انتهت جلسة الدخول. يرجى تسجيل الدخول مجدداً',
      );
    // Limit session housekeeping writes to once every five minutes.
    if (session.lastUsedAt.getTime() < Date.now() - 300000)
      await this.db.session.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { lastUsedAt: new Date() },
      });
    return { actor: session.user, sessionId: session.id };
  }
  async logout(actor: import('./auth.types').Actor, sessionId: string) {
    await this.db.$transaction(async (tx) => {
      await tx.session.updateMany({
        where: { id: sessionId, userId: actor.id },
        data: { revokedAt: new Date() },
      });
      await audit(tx, actor, 'LOGOUT', 'User', actor.id);
    });
  }
}
