import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as cookieParser from 'cookie-parser';

import { AppModule } from './app.module';
import { setUpSession } from './redis/redis.setting';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
    }),
  );
  setUpSession(app);
  app.use(cookieParser());
  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();
