import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import homeRoutes from './home.js';

describe('home routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await app.register(homeRoutes);
  });

  afterEach(async () => {
    await app.close();
  });

  it('serves the landing page with api explorer markup', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/',
      headers: {
        host: 'localhost:3000',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain('Live API Explorer');
    expect(response.body).toContain('--color-bg');
    expect(response.body).toContain('/docs');
    expect(response.body).toContain('http://localhost:3000/v1');
    expect(response.body).toContain('POST /v1/tools/impermanent-loss/simulate');
  });
});
