import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import tokenRoutes from './tokens.js';

const dbMocks = vi.hoisted(() => ({
  findPoolsMany: vi.fn(),
  findPoolsFirst: vi.fn(),
  findTokenPriceFirst: vi.fn(),
  selectDistinct: vi.fn(),
  selectDistinctFrom: vi.fn(),
  selectDistinctWhere: vi.fn(),
  selectDistinctOn: vi.fn(),
  selectDistinctOnFrom: vi.fn(),
  selectDistinctOnWhere: vi.fn(),
  selectDistinctOnOrderBy: vi.fn(),
}));

vi.mock('drizzle-orm', () => ({
  eq: (column: unknown, value: unknown) => ({ eq: [column, value] }),
  and: (...conditions: unknown[]) => ({ and: conditions }),
  gte: (column: unknown, value: unknown) => ({ gte: [column, value] }),
  lte: (column: unknown, value: unknown) => ({ lte: [column, value] }),
  desc: (column: unknown) => ({ desc: column }),
  asc: (column: unknown) => ({ asc: column }),
  inArray: (column: unknown, values: unknown[]) => ({ inArray: [column, values] }),
  or: (...conditions: unknown[]) => ({ or: conditions }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      sql: strings.join('?'),
      values,
      as: () => ({}),
    }),
    {
      raw: (value: string) => ({ raw: value }),
    }
  ),
}));

vi.mock('../db/index.js', () => ({
  db: {
    query: {
      pools: {
        findMany: dbMocks.findPoolsMany,
        findFirst: dbMocks.findPoolsFirst,
      },
      tokenPrices: {
        findFirst: dbMocks.findTokenPriceFirst,
      },
    },
    selectDistinct: dbMocks.selectDistinct,
    selectDistinctOn: dbMocks.selectDistinctOn,
  },
  pools: {
    id: 'id',
    chainId: 'chain_id',
    token0Address: 'token0_address',
    token0Symbol: 'token0_symbol',
    token0Decimals: 'token0_decimals',
    token1Address: 'token1_address',
    token1Symbol: 'token1_symbol',
    token1Decimals: 'token1_decimals',
  },
  tokenPrices: {
    tokenAddress: 'token_address',
    chainId: 'chain_id',
    timestamp: 'timestamp',
    priceUsd: 'price_usd',
  },
}));

describe('token routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();

    dbMocks.findPoolsMany.mockResolvedValue([]);
    dbMocks.findPoolsFirst.mockResolvedValue(null);
    dbMocks.findTokenPriceFirst.mockResolvedValue(null);

    dbMocks.selectDistinctWhere.mockResolvedValue([]);
    dbMocks.selectDistinctFrom.mockReturnValue({
      where: dbMocks.selectDistinctWhere,
    });
    dbMocks.selectDistinct.mockReturnValue({
      from: dbMocks.selectDistinctFrom,
    });

    dbMocks.selectDistinctOnOrderBy.mockResolvedValue([]);
    dbMocks.selectDistinctOnWhere.mockReturnValue({
      orderBy: dbMocks.selectDistinctOnOrderBy,
    });
    dbMocks.selectDistinctOnFrom.mockReturnValue({
      where: dbMocks.selectDistinctOnWhere,
    });
    dbMocks.selectDistinctOn.mockReturnValue({
      from: dbMocks.selectDistinctOnFrom,
    });

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

    await app.register(tokenRoutes, { prefix: '/tokens' });
  });

  afterEach(async () => {
    await app.close();
  });

  it('routes /tokens/search to search handler (not token detail)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/tokens/search?q=eth',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([]);
    expect(dbMocks.findPoolsMany).toHaveBeenCalledTimes(1);
    expect(dbMocks.findTokenPriceFirst).not.toHaveBeenCalled();
  });

  it('rejects token search on disallowed chain for free tier', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/tokens/search?q=eth&chain=solana',
      headers: {
        'x-test-tier': 'free',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('FORBIDDEN');
    expect(dbMocks.findPoolsMany).not.toHaveBeenCalled();
  });

  it('rejects token detail on disallowed chain for free tier', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/tokens/0xabc?chain=solana',
      headers: {
        'x-test-tier': 'free',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('FORBIDDEN');
    expect(dbMocks.findTokenPriceFirst).not.toHaveBeenCalled();
  });
});
