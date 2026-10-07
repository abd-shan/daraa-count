import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import type { AuthRequest } from './auth.types';
import { readConfig } from '../config';
export const Public = () => SetMetadata('public', true);
export const AdminOnly = () => SetMetadata('admin', true);
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}
  async canActivate(ctx: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>('public', [
        ctx.getHandler(),
        ctx.getClass(),
      ])
    )
      return true;
    const req = ctx.switchToHttp().getRequest<AuthRequest>();
    const session = await this.auth.authenticate(
      req.cookies[readConfig().SESSION_COOKIE_NAME],
    );
    req.actor = session.actor;
    req.sessionId = session.sessionId;
    if (
      this.reflector.getAllAndOverride<boolean>('admin', [
        ctx.getHandler(),
        ctx.getClass(),
      ]) &&
      req.actor.role !== 'SUPER_ADMIN'
    )
      throw new ForbiddenException('ليس لديك صلاحية لتنفيذ هذه العملية');
    return true;
  }
}
