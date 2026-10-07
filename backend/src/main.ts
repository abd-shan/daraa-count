import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { readConfig } from './config';
import { configureHttp } from './common/http';

async function bootstrap() {
  const config = readConfig();
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  configureHttp(app);
  app.enableShutdownHooks();
  await app.listen(
    config.PORT,
    config.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1',
  );
}
void bootstrap().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Startup failed');
  process.exitCode = 1;
});
