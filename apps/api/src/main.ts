import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: '*' });
  app.enableShutdownHooks();
  await app.listen(3001);
  // eslint-disable-next-line no-console
  console.log('[uno-api] listening on http://localhost:3001');
}
bootstrap();
