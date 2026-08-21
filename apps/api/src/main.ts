import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { CONFIG } from './config';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  try {
    const app = await NestFactory.create(AppModule);
    app.enableCors({ origin: CONFIG.corsOrigin });
    app.enableShutdownHooks();
    await app.listen(CONFIG.port);
    logger.log(`listening on http://localhost:${CONFIG.port}`);
  } catch (e) {
    logger.error(`启动失败: ${(e as Error).message}`, (e as Error).stack);
    process.exit(1);
  }
}

void bootstrap();
