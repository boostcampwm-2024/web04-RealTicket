import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';

import { AppModule } from './app.module';
import { setupSwagger } from './config/setupSwagger';
import { winstonLoggerConfig } from './util/winstonlogger.config';
import { loggerMiddleware } from './util/winstonlogger.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: winstonLoggerConfig,
  });
  setupSwagger(app);
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
    }),
  );
  app.use(cookieParser());
  app.use(loggerMiddleware(winstonLoggerConfig));
  await app.listen(process.env.PORT ?? 8080);
}

bootstrap();
