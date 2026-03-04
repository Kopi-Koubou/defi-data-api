import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import yieldRoutes from './yields.js';
import * as yieldService from '../services/yields.js';

vi.mock('../services/yields.js', () => ({
  getLatestYields: vi.fn(),
  getYieldByPoolId: vi.fn(),
  getYieldHistory: vi.fn(),
}));

vi.mock('../services/risk.js', () => ({
  getRiskAdjustedYields: vi.fn(),
}));

const mockYield = {
  poolId: 'pool-1',
  protocol: 'jupiter',
  chain: 'solana',
  token0: { symbol: 'SOL', address: 'So11111111111111111111111111111111111111112' },
  token1: { symbol: 'USDC', address: 'EPjFWdd5AufqSSqeM2qR8V8F6hB6vZXv7fT5r3pJd4' },
  poolType: 'lp',
  apy: {
    total: 10,
    base: 8,
    reward: 2,
  },
  tvlUsd: 1000000,
  updatedAt: new Date('2026-03-01T00:00:00.000Z'),
};

describe('yield routes', () => {
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

    await app.register(yieldRoutes, { prefix: '/yields' });
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejects pool detail access on disallowed chains for free tier', async () => {
    vi.mocked(yieldService.getYieldByPoolId).mockResolvedValue(mockYield);

    const response = await app.inject({
      method: 'GET',
      url: '/yields/pool-1',
      headers: {
        'x-test-tier': 'free',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('FORBIDDEN');
  });

  it('rejects yield history access on disallowed chains for free tier before loading history', async () => {
    vi.mocked(yieldService.getYieldByPoolId).mockResolvedValue(mockYield);
    vi.mocked(yieldService.getYieldHistory).mockResolvedValue([]);

    const response = await app.inject({
      method: 'GET',
      url: '/yields/pool-1/history',
      headers: {
        'x-test-tier': 'free',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('FORBIDDEN');
    expect(yieldService.getYieldHistory).not.toHaveBeenCalled();
  });
});
