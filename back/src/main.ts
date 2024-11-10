import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { setUpSession } from './redis/redis.setting';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  setUpSession(app);
  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();
