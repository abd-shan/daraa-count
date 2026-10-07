import { Module } from '@nestjs/common';
import { RecordsModule } from '../records/records.module';
import { ExcelController } from './excel.controller';
import { ExcelService } from './excel.service';
@Module({
  imports: [RecordsModule],
  controllers: [ExcelController],
  providers: [ExcelService],
  exports: [ExcelService],
})
export class ExcelModule {}
