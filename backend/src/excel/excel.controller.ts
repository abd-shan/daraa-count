import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { AdminOnly } from '../auth/auth.guard';
import type { AuthRequest } from '../auth/auth.types';
import { ExcelService } from './excel.service';
import type { Upload } from './workbook';
import { readConfig } from '../config';
const uploadOptions = {
  storage: memoryStorage(),
  limits: {
    fileSize: Number(process.env.MAX_IMPORT_FILE_MB || 10) * 1024 * 1024,
    files: 1,
    fields: 2,
    fieldSize: 200,
    parts: 3,
  },
};
@Controller()
export class ExcelController {
  constructor(private readonly excel: ExcelService) {}
  @Get('records/export/xlsx')
  async export(
    @Req() req: AuthRequest,
    @Query() query: unknown,
    @Res() res: Response,
  ) {
    const result = await this.excel.export(req.actor, query);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      "attachment; filename=count-daraa.xlsx; filename*=UTF-8''" +
        encodeURIComponent(result.filename),
    );
    res.send(result.buffer);
  }
  @AdminOnly()
  @Post('admin/imports/preview')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  preview(
    @Req() req: AuthRequest,
    @Body() body: unknown,
    @UploadedFile() file?: Upload,
  ) {
    readConfig();
    return this.excel.preview(req.actor, body, file);
  }
  @AdminOnly()
  @Post('admin/imports/confirm')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  confirm(
    @Req() req: AuthRequest,
    @Body() body: unknown,
    @UploadedFile() file?: Upload,
  ) {
    return this.excel.confirm(req.actor, body, file);
  }
}
