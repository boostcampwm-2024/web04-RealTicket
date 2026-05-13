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

  it('/ (GET)', async () => {
    const res = await supertest(app.getHttpServer()).get('/').expect(200);
    expect(res.body).toEqual({ success: true, data: 'Hello World!' });
  });
});
