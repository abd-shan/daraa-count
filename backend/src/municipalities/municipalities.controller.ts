import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { AdminOnly } from '../auth/auth.guard';
import type { AuthRequest } from '../auth/auth.types';
import { MunicipalitiesService } from './municipalities.service';
@AdminOnly()
@Controller('admin')
export class MunicipalitiesController {
  constructor(private readonly municipalities: MunicipalitiesService) {}
  @Get('municipalities') list(
    @Req() req: AuthRequest,
    @Query() query: unknown,
  ) {
    return this.municipalities.list(req.actor, query);
  }
  @Get('municipalities/options') options(@Req() req: AuthRequest) {
    return this.municipalities.options(req.actor);
  }
  @Post('municipalities') create(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.municipalities.create(req.actor, body);
  }
  @Patch('municipalities/:id') update(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.municipalities.update(req.actor, id, body);
  }
  @Post('municipalities/:id/users') account(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.municipalities.createAccount(req.actor, id, body);
  }
  @Patch('users/:id') user(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.municipalities.updateAccount(req.actor, id, body);
  }
}
