import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import webhookRoutes from './webhooks.js';

const dbMocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
  insert: vi.fn(),
  insertValues: vi.fn(),
  update: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
}));

vi.mock('drizzle-orm', () => ({
  and: (...conditions: unknown[]) => ({ and: conditions }),
  desc: (column: unknown) => ({ desc: column }),
  eq: (column: unknown, value: unknown) => ({ eq: [column, value] }),
}));

vi.mock('../db/index.js', () => ({
  db: {
    query: {
      webhookSubscriptions: {
        findMany: dbMocks.findMany,
        findFirst: dbMocks.findFirst,
      },
    },
    insert: dbMocks.insert,
    update: dbMocks.update,
  },
  webhookSubscriptions: {
    id: 'id',
    userId: 'user_id',
    apiKeyId: 'api_key_id',
    active: 'active',
    createdAt: 'created_at',
  },
}));

function whereAsString(value: unknown): string {
  return JSON.stringify(value);
}

describe('webhook routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();

    dbMocks.findMany.mockResolvedValue([]);
    dbMocks.findFirst.mockResolvedValue(null);
    dbMocks.insertValues.mockResolvedValue(undefined);
    dbMocks.updateWhere.mockResolvedValue(undefined);
    dbMocks.insert.mockReturnValue({ values: dbMocks.insertValues });
    dbMocks.update.mockReturnValue({ set: dbMocks.updateSet });
    dbMocks.updateSet.mockReturnValue({ where: dbMocks.updateWhere });

    app = Fastify({ logger: false });
    app.addHook('onRequest', async (request) => {
      const tierHeader = request.headers['x-test-tier'];
      const tier = typeof tierHeader === 'string' ? tierHeader : 'builder';
      request.apiKey = {
        id: 'test-key',
        userId: 'user-1',
        tier,
        rateLimit: 1000,
        requestQuota: 50000,
      };
    });

    await app.register(webhookRoutes, { prefix: '/webhooks' });
  });

  afterEach(async () => {
    await app.close();
  });

  it('lists webhooks scoped to user id (not api key id)', async () => {
    dbMocks.findMany.mockResolvedValue([
      {
        id: 'wh_1',
        eventType: 'yield_alert',
        config: {},
        url: 'https://example.com/a',
        active: true,
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
        lastTriggeredAt: null,
      },
      {
        id: 'wh_2',
        eventType: 'tvl_alert',
        config: {},
        url: 'https://example.com/b',
        active: true,
        createdAt: new Date('2026-03-02T00:00:00.000Z'),
        lastTriggeredAt: null,
      },
    ]);

    const response = await app.inject({
      method: 'GET',
      url: '/webhooks',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(2);

    const [queryArg] = dbMocks.findMany.mock.calls[0];
    const whereText = whereAsString(queryArg.where);
    expect(whereText).toContain('user_id');
    expect(whereText).not.toContain('api_key_id');
  });

  it('parses active=false query flag correctly when listing webhooks', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/webhooks?active=false',
    });

    expect(response.statusCode).toBe(200);
    const [queryArg] = dbMocks.findMany.mock.calls[0];
    const whereText = whereAsString(queryArg.where);
    expect(whereText).toContain('active');
    expect(whereText).toContain('false');
  });

  it('rejects invalid active query flag values', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/webhooks?active=not-a-boolean',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('BAD_REQUEST');
    expect(dbMocks.findMany).not.toHaveBeenCalled();
  });

  it('deletes a webhook owned by the same user even with a different source api key', async () => {
    dbMocks.findFirst.mockResolvedValue({
      id: 'wh_1',
      userId: 'user-1',
      apiKeyId: 'old-key',
      active: true,
    });

    const response = await app.inject({
      method: 'DELETE',
      url: '/webhooks/wh_1',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({ id: 'wh_1', deleted: true });

    const [findArg] = dbMocks.findFirst.mock.calls[0];
    const whereText = whereAsString(findArg.where);
    expect(whereText).toContain('user_id');
    expect(whereText).not.toContain('api_key_id');
    expect(dbMocks.updateWhere).toHaveBeenCalledTimes(1);
  });

  it('does not delete a webhook when it is not owned by the requester', async () => {
    dbMocks.findFirst.mockResolvedValue(null);

    const response = await app.inject({
      method: 'DELETE',
      url: '/webhooks/wh_missing',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('NOT_FOUND');
    expect(dbMocks.updateWhere).not.toHaveBeenCalled();
  });

  it('rejects empty webhook ids for delete endpoint', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/webhooks/%20%20',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('BAD_REQUEST');
    expect(dbMocks.findFirst).not.toHaveBeenCalled();
  });

  it('rejects webhook endpoints for free tier', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/webhooks',
      headers: {
        'x-test-tier': 'free',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('FORBIDDEN');
  });
});
