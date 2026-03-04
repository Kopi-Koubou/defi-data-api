import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import toolsRoutes from './tools.js';

describe('tools routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await app.register(toolsRoutes, { prefix: '/tools' });
  });

  afterEach(async () => {
    await app.close();
  });

  it('calculates impermanent loss for a valid GET request', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/tools/impermanent-loss?token0=ETH&token1=USDC&entry_price_ratio=2000&current_price_ratio=4000',
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.data.token0).toBe('ETH');
    expect(payload.data.ilPercentage).toBeCloseTo(-5.7191, 4);
    expect(payload.data.ilVsHoldPercentage).toBeCloseTo(-5.7191, 4);
  });

  it('rejects fee fields when only one paired value is provided', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/tools/impermanent-loss?token0=ETH&token1=USDC&entry_price_ratio=2000&current_price_ratio=2400&fee_apr=12',
    });

    expect(response.statusCode).toBe(400);
    const payload = response.json();
    expect(payload.error.code).toBe('BAD_REQUEST');
  });

  it('simulates IL scenarios with fees for valid POST payloads', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/tools/impermanent-loss/simulate',
      payload: {
        token0: 'ETH',
        token1: 'USDC',
        entry_price_ratio: 2000,
        price_changes: [-0.5, 0, 0.5],
        fee_apr: 10,
        days: 30,
      },
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.data.feeApr).toBe(10);
    expect(payload.data.days).toBe(30);
    expect(payload.data.scenarios).toHaveLength(3);
    expect(payload.data.scenarios[0].priceChangePercent).toBe(-50);
    expect(payload.data.scenarios[2].netReturnPercentage).toBeCloseTo(-1.1985, 4);
  });

  it('rejects invalid simulation price changes that imply non-positive ratios', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/tools/impermanent-loss/simulate',
      payload: {
        token0: 'ETH',
        token1: 'USDC',
        entry_price_ratio: 2000,
        price_changes: [-1],
      },
    });

    expect(response.statusCode).toBe(400);
    const payload = response.json();
    expect(payload.error.code).toBe('BAD_REQUEST');
  });
});
