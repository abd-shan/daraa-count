import {
  Global,
  Injectable,
  Module,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
  }
  async onModuleInit() {
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        await this.$connect();
        return;
      } catch {
        if (attempt === 9) throw new Error('Database connection failed');
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
