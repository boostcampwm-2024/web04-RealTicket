import { INestApplication } from '@nestjs/common';
import RedisStore from 'connect-redis';
import * as session from 'express-session';
import Redis from 'ioredis';
import * as passport from 'passport';

export function setUpSession(app: INestApplication): void {
  console.log(process.env.REDIS_PORT);
  const port = parseInt(process.env.REDIS_PORT, 10);
  const host = process.env.REDIS_HOST;

  const client = new Redis({
    host,
    port,
  });

  app.use(
    session({
      secret: process.env.REDIS_SECRET,
      saveUninitialized: false,
      resave: false,
      store: new RedisStore({
        client: client,
        ttl: 30,
      }),
      cookie: {
        httpOnly: true,
        secure: true,
        maxAge: 30000,
      },
    }),
  );
  app.use(passport.initialize());
  app.use(passport.session());
}
