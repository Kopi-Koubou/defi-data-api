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

function whereAsString(value: unknown): string {
  return JSON.stringify(value);
}

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

  it('scans a larger pool candidate set for token search', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/tokens/search?q=eth',
    });

    expect(response.statusCode).toBe(200);
    const [queryArg] = dbMocks.findPoolsMany.mock.calls[0];
    expect(queryArg.limit).toBe(500);
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

  it('normalizes chain query for free-tier token search entitlement checks', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/tokens/search?q=eth&chain=%20SoLaNa%20',
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

  it('preserves non-EVM token address casing in search responses', async () => {
    const solAddress = 'So11111111111111111111111111111111111111112';
    dbMocks.findPoolsMany.mockResolvedValue([
      {
        chainId: 'solana',
        token0Address: solAddress,
        token0Symbol: 'SOL',
        token0Decimals: 9,
        token1Address: null,
        token1Symbol: null,
        token1Decimals: null,
      },
    ]);

    const response = await app.inject({
      method: 'GET',
      url: '/tokens/search?q=so111',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(1);
    expect(response.json().data[0].address).toBe(solAddress);
  });

  it('preserves non-EVM token address casing for detail lookups', async () => {
    const solAddress = 'So11111111111111111111111111111111111111112';
    dbMocks.findTokenPriceFirst.mockResolvedValue({
      tokenAddress: solAddress,
      chainId: 'solana',
      timestamp: new Date('2026-03-01T00:00:00.000Z'),
      priceUsd: 145.12,
    });
    dbMocks.findPoolsFirst.mockResolvedValue({
      chainId: 'solana',
      token0Address: solAddress,
      token0Symbol: 'SOL',
      token0Decimals: 9,
      token1Address: 'EPjFWdd5AufqSSqeM2qR8V8F6hB6vZXv7fT5r3pJd4',
      token1Symbol: 'USDC',
      token1Decimals: 6,
    });
    dbMocks.selectDistinctWhere.mockResolvedValue([{ chainId: 'solana' }]);

    const response = await app.inject({
      method: 'GET',
      url: `/tokens/${solAddress}?chain=solana`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.address).toBe(solAddress);

    const [findPriceArgs] = dbMocks.findTokenPriceFirst.mock.calls[0];
    const whereText = whereAsString(findPriceArgs.where);
    expect(whereText).toContain(solAddress);
  });

  it('ranks token search results by relevance (exact > prefix > partial)', async () => {
    dbMocks.findPoolsMany.mockResolvedValue([
      {
        chainId: 'ethereum',
        token0Address: '0x1111111111111111111111111111111111111111',
        token0Symbol: 'WETH',
        token0Decimals: 18,
        token1Address: null,
        token1Symbol: null,
        token1Decimals: null,
      },
      {
        chainId: 'ethereum',
        token0Address: '0x2222222222222222222222222222222222222222',
        token0Symbol: 'ETHX',
        token0Decimals: 18,
        token1Address: null,
        token1Symbol: null,
        token1Decimals: null,
      },
      {
        chainId: 'ethereum',
        token0Address: '0x3333333333333333333333333333333333333333',
        token0Symbol: 'ETH',
        token0Decimals: 18,
        token1Address: null,
        token1Symbol: null,
        token1Decimals: null,
      },
    ]);

    const response = await app.inject({
      method: 'GET',
      url: '/tokens/search?q=eth',
    });

    expect(response.statusCode).toBe(200);
    const symbols = response.json().data.map((token: { symbol: string }) => token.symbol);
    expect(symbols).toEqual(['ETH', 'ETHX', 'WETH']);
  });

  it('normalizes chain query values for token detail lookups', async () => {
    const solAddress = 'So11111111111111111111111111111111111111112';
    dbMocks.findTokenPriceFirst.mockResolvedValue({
      tokenAddress: solAddress,
      chainId: 'solana',
      timestamp: new Date('2026-03-01T00:00:00.000Z'),
      priceUsd: 145.12,
    });
    dbMocks.findPoolsFirst.mockResolvedValue({
      chainId: 'solana',
      token0Address: solAddress,
      token0Symbol: 'SOL',
      token0Decimals: 9,
      token1Address: 'EPjFWdd5AufqSSqeM2qR8V8F6hB6vZXv7fT5r3pJd4',
      token1Symbol: 'USDC',
      token1Decimals: 6,
    });
    dbMocks.selectDistinctWhere.mockResolvedValue([{ chainId: 'solana' }]);

    const response = await app.inject({
      method: 'GET',
      url: `/tokens/${solAddress}?chain=%20SoLaNa%20`,
    });

    expect(response.statusCode).toBe(200);

    const [findPriceArgs] = dbMocks.findTokenPriceFirst.mock.calls[0];
    const whereText = whereAsString(findPriceArgs.where);
    expect(whereText).toContain('solana');
    expect(whereText).not.toContain('SoLaNa');
  });

  it('rejects explicitly empty chain filters for token detail', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/tokens/0xabc?chain=%20%20',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('BAD_REQUEST');
    expect(dbMocks.findTokenPriceFirst).not.toHaveBeenCalled();
  });

  it('rejects explicitly empty token addresses for token detail', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/tokens/%20%20',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('BAD_REQUEST');
    expect(dbMocks.findTokenPriceFirst).not.toHaveBeenCalled();
  });

  it('rejects explicitly empty token addresses for token price history', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/tokens/%20%20/price/history',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('BAD_REQUEST');
    expect(dbMocks.selectDistinct).not.toHaveBeenCalled();
  });

  it('rejects explicitly empty chain filters for token search', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/tokens/search?q=eth&chain=%20%20',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('BAD_REQUEST');
    expect(dbMocks.findPoolsMany).not.toHaveBeenCalled();
  });

  it('rejects explicitly empty chain filters for token price history', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/tokens/0xabc/price/history?chain=%20%20',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('BAD_REQUEST');
  });
});
