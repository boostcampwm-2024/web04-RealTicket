import { INestApplication } from '@nestjs/common';
import supertest from 'supertest';

import { createTestApp } from './helpers/e2e-setup';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/ (GET)', () => {
    return supertest(app.getHttpServer()).get('/').expect(200).expect('Hello World!');
  });
});
