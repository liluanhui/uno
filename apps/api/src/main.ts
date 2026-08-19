import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: '*' });
  app.enableShutdownHooks();
  const port = Number(process.env.PORT) || 5001;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`[uno-api] listening on http://localhost:${port}`);
}
bootstrap();
