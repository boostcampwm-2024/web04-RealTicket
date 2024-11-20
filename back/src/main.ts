import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';

import { AppModule } from './app.module';
import { setupSwagger } from './config/setupSwagger';
import { TransformInterceptor } from './util/convention-transformer/transformer.interceptor';
import { winstonLoggerConfig } from './util/logger/winstonlogger.config';
import { loggerMiddleware } from './util/logger/winstonlogger.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: winstonLoggerConfig,
  });
  setupSwagger(app);
  app.enableCors({
    origin: '*',
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
    }),
  );
  app.useGlobalInterceptors(new TransformInterceptor());
  app.use(cookieParser());
  app.use(loggerMiddleware(winstonLoggerConfig));
  await app.listen(process.env.PORT ?? 8080);
}

bootstrap();
