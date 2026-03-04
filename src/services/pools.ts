import { and, asc, eq, gte, lte, or, sql } from 'drizzle-orm';

import { db, pools, tokenPrices } from '../db/index.js';
import { buildIlHistorySeries, type IlHistoryPoint } from '../utils/il-history.js';

export interface PoolIlHistoryQuery {
  from: Date;
  to: Date;
  interval: '1h' | '1d' | '1w';
}

export interface PoolIlHistoryResult {
  poolId: string;
  chain: string;
  token0: {
    symbol: string;
    address: string;
  };
  token1: {
    symbol: string;
    address: string;
  };
  interval: '1h' | '1d' | '1w';
  from: Date;
  to: Date;
  entryPriceRatio: number | null;
  points: IlHistoryPoint[];
}

export class UnsupportedPoolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedPoolError';
  }
}

function resolveIntervalExpression(interval: '1h' | '1d' | '1w') {
  switch (interval) {
    case '1h':
      return sql`DATE_TRUNC('hour', ${tokenPrices.timestamp})`;
    case '1w':
      return sql`DATE_TRUNC('week', ${tokenPrices.timestamp})`;
    case '1d':
    default:
      return sql`DATE_TRUNC('day', ${tokenPrices.timestamp})`;
  }
}

export async function getPoolIlHistory(
  poolId: string,
  query: PoolIlHistoryQuery
): Promise<PoolIlHistoryResult | null> {
  const pool = await db.query.pools.findFirst({
    where: eq(pools.id, poolId),
  });

  if (!pool) {
    return null;
  }

  if (!pool.token1Symbol || !pool.token1Address) {
    throw new UnsupportedPoolError('Impermanent loss history is available only for two-token pools');
  }

  const token0Address = pool.token0Address.toLowerCase();
  const token1Address = pool.token1Address.toLowerCase();
  const intervalExpr = resolveIntervalExpression(query.interval);

  const rows = await db
    .select({
      timestamp: intervalExpr.as('interval'),
      tokenAddress: tokenPrices.tokenAddress,
      avgPriceUsd: sql<number>`AVG(${tokenPrices.priceUsd})`.as('avg_price'),
    })
    .from(tokenPrices)
    .where(
      and(
        eq(tokenPrices.chainId, pool.chainId),
        or(
          eq(tokenPrices.tokenAddress, token0Address),
          eq(tokenPrices.tokenAddress, token1Address)
        ),
        gte(tokenPrices.timestamp, query.from),
        lte(tokenPrices.timestamp, query.to)
      )
    )
    .groupBy(intervalExpr, tokenPrices.tokenAddress)
    .orderBy(asc(intervalExpr));

  const alignedMap = new Map<
    string,
    { timestamp: Date; token0PriceUsd?: number; token1PriceUsd?: number }
  >();

  for (const row of rows) {
    const timestamp = row.timestamp as Date;
    const key = timestamp.toISOString();
    const item = alignedMap.get(key) || { timestamp };

    if (row.tokenAddress === token0Address) {
      item.token0PriceUsd = Number(row.avgPriceUsd);
    } else if (row.tokenAddress === token1Address) {
      item.token1PriceUsd = Number(row.avgPriceUsd);
    }

    alignedMap.set(key, item);
  }

  const pricePoints = Array.from(alignedMap.values())
    .filter(
      (point): point is { timestamp: Date; token0PriceUsd: number; token1PriceUsd: number } =>
        Number.isFinite(point.token0PriceUsd) && Number.isFinite(point.token1PriceUsd)
    )
    .map((point) => ({
      timestamp: point.timestamp,
      token0PriceUsd: point.token0PriceUsd,
      token1PriceUsd: point.token1PriceUsd,
    }));

  const series = buildIlHistorySeries(pool.token0Symbol, pool.token1Symbol, pricePoints);

  return {
    poolId: pool.id,
    chain: pool.chainId,
    token0: {
      symbol: pool.token0Symbol,
      address: token0Address,
    },
    token1: {
      symbol: pool.token1Symbol,
      address: token1Address,
    },
    interval: query.interval,
    from: query.from,
    to: query.to,
    entryPriceRatio: series.entryPriceRatio,
    points: series.points,
  };
}
