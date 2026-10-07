import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { z } from 'zod';
import type { Response } from 'express';
import type { AuthRequest } from './auth.types';
import { AuthService } from './auth.service';
import { Public } from './auth.guard';
import { parse } from '../common/validation';
import { readConfig } from '../config';
const loginSchema = z
  .object({
    username: z.string().trim().toLowerCase().max(80),
    password: z.string().min(1).max(128),
  })
  .strict();
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Public()
  @Post('login')
  async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = parse(loginSchema, body);
    const session = await this.auth.login(input.username, input.password);
    const config = readConfig();
    res.cookie(config.SESSION_COOKIE_NAME, session.token, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      expires: session.expiresAt,
    });
    return session.actor;
  }
  @Get('me') me(@Req() req: AuthRequest) {
    return req.actor;
  }
  @Post('logout')
  async logout(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(req.actor, req.sessionId);
    const config = readConfig();
    res.clearCookie(config.SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
    });
    return { message: 'تم تسجيل الخروج' };
  }
}
