import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import cookieParser from 'cookie-parser';

import './config/loadDotEnv';
import { AppModule } from './app.module';
import { setupSwagger } from './config/setupSwagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {});
  setupSwagger(app);
  app.enableCors({
    origin: [process.env.FRONT_URL ?? 'http://localhost:3000'],
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
    }),
  );
  app.useWebSocketAdapter(new WsAdapter(app));
  app.use(cookieParser());
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 8080);
}

bootstrap();
