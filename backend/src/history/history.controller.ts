import { Controller, Get, Query, Req } from '@nestjs/common';
import { AdminOnly } from '../auth/auth.guard';
import type { AuthRequest } from '../auth/auth.types';
import { HistoryService } from './history.service';
@AdminOnly()
@Controller('admin')
export class HistoryController {
  constructor(private readonly history: HistoryService) {}
  @Get('audit') audit(@Req() req: AuthRequest, @Query() query: unknown) {
    return this.history.audit(req.actor, query);
  }
  @Get('imports') imports(@Req() req: AuthRequest, @Query() query: unknown) {
    return this.history.imports(req.actor, query);
  }
}
