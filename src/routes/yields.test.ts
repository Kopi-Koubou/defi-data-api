import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import yieldRoutes from './yields.js';
import * as riskService from '../services/risk.js';
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

  it('passes asset and asset-pair filters to yield listing service', async () => {
    vi.mocked(yieldService.getLatestYields).mockResolvedValue({
      yields: [],
      hasMore: false,
      nextCursor: null,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/yields?asset=ETH&asset_pair=ETH-USDC',
    });

    expect(response.statusCode).toBe(200);
    expect(yieldService.getLatestYields).toHaveBeenCalledWith(
      expect.objectContaining({
        asset: 'ETH',
        assetPair: 'ETH-USDC',
      })
    );
  });

  it('rejects whitespace-only asset filters for yield listing', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/yields?asset=%20%20',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('BAD_REQUEST');
    expect(yieldService.getLatestYields).not.toHaveBeenCalled();
  });

  it('rejects malformed asset-pair filters for yield listing', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/yields?asset_pair=%20-%20',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('BAD_REQUEST');
    expect(yieldService.getLatestYields).not.toHaveBeenCalled();
  });

  it('normalizes chain and protocol filters for yield listing', async () => {
    vi.mocked(yieldService.getLatestYields).mockResolvedValue({
      yields: [],
      hasMore: false,
      nextCursor: null,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/yields?chain=SoLaNa&protocol=AAVE-V3',
    });

    expect(response.statusCode).toBe(200);
    expect(yieldService.getLatestYields).toHaveBeenCalledWith(
      expect.objectContaining({
        chain: 'solana',
        protocol: 'aave-v3',
      })
    );
  });

  it('rejects whitespace-only asset filters for top yields', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/yields/top?asset=%20%20',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('BAD_REQUEST');
    expect(yieldService.getLatestYields).not.toHaveBeenCalled();
  });

  it('rejects explicitly empty chain filters for yield listing', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/yields?chain=%20%20',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('BAD_REQUEST');
    expect(yieldService.getLatestYields).not.toHaveBeenCalled();
  });

  it('passes asset and asset-pair filters to top yield service', async () => {
    vi.mocked(yieldService.getLatestYields).mockResolvedValue({
      yields: [],
      hasMore: false,
      nextCursor: null,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/yields/top?asset=0xA0b86991c6218b36c1d19D4A2e9Eb0cE3606eB48&asset_pair=ETH-USDC',
    });

    expect(response.statusCode).toBe(200);
    expect(yieldService.getLatestYields).toHaveBeenCalledWith(
      expect.objectContaining({
        asset: '0xA0b86991c6218b36c1d19D4A2e9Eb0cE3606eB48',
        assetPair: 'ETH-USDC',
        sortBy: 'apy',
        limit: 20,
      })
    );
  });

  it('normalizes chain and protocol filters for risk-adjusted yields', async () => {
    vi.mocked(riskService.getRiskAdjustedYields).mockResolvedValue([]);

    const response = await app.inject({
      method: 'GET',
      url: '/yields/risk-adjusted?chain=SoLaNa&protocol=AAVE-V3',
    });

    expect(response.statusCode).toBe(200);
    expect(riskService.getRiskAdjustedYields).toHaveBeenCalledWith(
      expect.objectContaining({
        chain: 'solana',
        protocol: 'aave-v3',
      })
    );
  });

  it('rejects explicitly empty protocol filters for risk-adjusted yields', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/yields/risk-adjusted?protocol=%20%20',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('BAD_REQUEST');
    expect(riskService.getRiskAdjustedYields).not.toHaveBeenCalled();
  });

  it('rejects empty pool ids for yield detail routes', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/yields/%20%20',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('BAD_REQUEST');
    expect(yieldService.getYieldByPoolId).not.toHaveBeenCalled();
  });

  it('rejects empty pool ids for yield history routes', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/yields/%20%20/history',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('BAD_REQUEST');
    expect(yieldService.getYieldByPoolId).not.toHaveBeenCalled();
    expect(yieldService.getYieldHistory).not.toHaveBeenCalled();
  });

  it('passes asset and asset-pair filters to risk-adjusted service', async () => {
    vi.mocked(riskService.getRiskAdjustedYields).mockResolvedValue([]);

    const response = await app.inject({
      method: 'GET',
      url: '/yields/risk-adjusted?asset=ETH&asset_pair=USDC-ETH',
    });

    expect(response.statusCode).toBe(200);
    expect(riskService.getRiskAdjustedYields).toHaveBeenCalledWith(
      expect.objectContaining({
        asset: 'ETH',
        assetPair: 'USDC-ETH',
      })
    );
  });

  it('rejects whitespace-only asset filters for risk-adjusted yields', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/yields/risk-adjusted?asset=%20%20',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('BAD_REQUEST');
    expect(riskService.getRiskAdjustedYields).not.toHaveBeenCalled();
  });

  it('rejects malformed asset-pair filters for risk-adjusted yields', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/yields/risk-adjusted?asset_pair=%20-%20',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('BAD_REQUEST');
    expect(riskService.getRiskAdjustedYields).not.toHaveBeenCalled();
  });
});
