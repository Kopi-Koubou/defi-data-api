import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import poolRoutes from './pools.js';
import * as poolService from '../services/pools.js';
import * as riskService from '../services/risk.js';

vi.mock('../services/pools.js', () => ({
  getPoolIlHistory: vi.fn(),
  UnsupportedPoolError: class UnsupportedPoolError extends Error {},
}));

vi.mock('../services/risk.js', () => ({
  getPoolRiskScore: vi.fn(),
}));

describe('pool routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();

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

    await app.register(poolRoutes, { prefix: '/pools' });
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejects old historical windows for free tier regardless of custom to-date', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/pools/pool-1/il/history?from=2024-01-01T00:00:00.000Z&to=2024-01-07T00:00:00.000Z',
      headers: {
        'x-test-tier': 'free',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('FORBIDDEN');
    expect(poolService.getPoolIlHistory).not.toHaveBeenCalled();
  });

  it('rejects IL history access on disallowed chains for free tier', async () => {
    vi.mocked(poolService.getPoolIlHistory).mockResolvedValue({
      poolId: 'pool-1',
      chain: 'solana',
      token0: { symbol: 'SOL', address: 'So11111111111111111111111111111111111111112' },
      token1: { symbol: 'USDC', address: 'EPjFWdd5AufqSSqeM2qR8V8F6hB6vZXv7fT5r3pJd4' },
      interval: '1d',
      from: new Date('2026-03-01T00:00:00.000Z'),
      to: new Date('2026-03-05T00:00:00.000Z'),
      entryPriceRatio: 1,
      points: [],
    });

    const response = await app.inject({
      method: 'GET',
      url: '/pools/pool-1/il/history',
      headers: {
        'x-test-tier': 'free',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('FORBIDDEN');
  });

  it('rejects empty pool ids for risk-score route', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/pools/%20%20/risk-score',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('BAD_REQUEST');
    expect(riskService.getPoolRiskScore).not.toHaveBeenCalled();
  });

  it('rejects empty pool ids for IL history route', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/pools/%20%20/il/history',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('BAD_REQUEST');
    expect(poolService.getPoolIlHistory).not.toHaveBeenCalled();
  });
});
