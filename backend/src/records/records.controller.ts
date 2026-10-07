import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { AuthRequest } from '../auth/auth.types';
import { RecordsService } from './records.service';
import { AdminOnly } from '../auth/auth.guard';
@Controller('records')
export class RecordsController {
  constructor(private readonly records: RecordsService) {}
  @Get() list(@Req() req: AuthRequest, @Query() query: unknown) {
    return this.records.list(req.actor, query);
  }
  @Get('summary') summary(@Req() req: AuthRequest) {
    return this.records.summary(req.actor);
  }
  @Get(':id') get(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.records.get(req.actor, id);
  }
  @Post() create(@Req() req: AuthRequest, @Body() body: unknown) {
    return this.records.create(req.actor, body);
  }
  @Patch(':id') update(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.records.update(req.actor, id, body);
  }
  @Delete(':id') remove(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.records.remove(req.actor, id);
  }
  @AdminOnly() @Post(':id/restore') restore(
    @Req() req: AuthRequest,
    @Param('id') id: string,
  ) {
    return this.records.remove(req.actor, id, true);
  }
}
