import { Module } from '@nestjs/common';
import { Controller, Get } from '@nestjs/common';
import { PrismaModule, PrismaService } from './prisma/prisma.service';
import { AuthModule } from './auth/auth.module';
import { RecordsModule } from './records/records.module';
import { MunicipalitiesModule } from './municipalities/municipalities.module';
import { ExcelModule } from './excel/excel.module';
import { HistoryModule } from './history/history.module';
import { Public } from './auth/auth.guard';

@Controller('health')
class HealthController {
  constructor(private readonly db: PrismaService) {}
  @Public() @Get() async health() {
    await this.db.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }
}

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    RecordsModule,
    MunicipalitiesModule,
    ExcelModule,
    HistoryModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
