/**
 * Yield data service
 */

import { eq, and, gte, lte, desc, asc, sql } from 'drizzle-orm';
import { db, pools, yields, protocols } from '../db/index.js';
import type { YieldFilters } from '../types/index.js';

export interface YieldWithPool {
  poolId: string;
  protocol: string;
  chain: string;
  token0: { symbol: string; address: string };
  token1: { symbol: string; address: string } | null;
  poolType: string;
  apy: {
    total: number;
    base: number;
    reward: number;
  };
  tvlUsd: number;
  updatedAt: Date;
}

export interface YieldHistoryPoint {
  timestamp: Date;
  apyTotal: number;
  apyBase: number;
  apyReward: number;
  tvlUsd: number;
}

export async function getLatestYields(
  filters: YieldFilters
): Promise<{ yields: YieldWithPool[]; hasMore: boolean }> {
  const limit = Math.min(filters.limit || 100, 100);
  const offset = filters.cursor ? parseInt(filters.cursor, 10) || 0 : 0;
  
  // Build where conditions
  const conditions = [];
  
  if (filters.chain) {
    conditions.push(eq(pools.chainId, filters.chain));
  }
  
  if (filters.protocol) {
    conditions.push(eq(pools.protocolId, filters.protocol));
  }
  
  if (filters.poolType) {
    conditions.push(eq(pools.poolType, filters.poolType));
  }
  
  // Get latest yield per pool using a subquery
  const latestYieldsSubquery = db
    .select({
      poolId: yields.poolId,
      maxTimestamp: sql<Date>`MAX(${yields.timestamp})`.as('max_timestamp'),
    })
    .from(yields)
    .groupBy(yields.poolId)
    .as('latest');
  
  const results = await db
    .select({
      pool: pools,
      protocol: protocols,
      yield: yields,
    })
    .from(yields)
    .innerJoin(pools, eq(yields.poolId, pools.id))
    .innerJoin(protocols, eq(pools.protocolId, protocols.id))
    .innerJoin(
      latestYieldsSubquery,
      and(
        eq(yields.poolId, latestYieldsSubquery.poolId),
        eq(yields.timestamp, latestYieldsSubquery.maxTimestamp)
      )
    )
    .where(conditions.length > 0 ? and(...conditions, gte(yields.tvlUsd, filters.minTvl || 0)) : gte(yields.tvlUsd, filters.minTvl || 0))
    .orderBy(filters.sortBy === 'apy' ? desc(yields.apyTotal) : desc(yields.tvlUsd))
    .limit(limit + 1)
    .offset(offset);
  
  const hasMore = results.length > limit;
  const data = results.slice(0, limit).map((row) => formatYieldWithPool(row));
  
  return { yields: data, hasMore };
}

export async function getYieldByPoolId(poolId: string): Promise<YieldWithPool | null> {
  const result = await db
    .select({
      pool: pools,
      protocol: protocols,
      yield: yields,
    })
    .from(yields)
    .innerJoin(pools, eq(yields.poolId, pools.id))
    .innerJoin(protocols, eq(pools.protocolId, protocols.id))
    .where(eq(yields.poolId, poolId))
    .orderBy(desc(yields.timestamp))
    .limit(1);
  
  if (result.length === 0) {
    return null;
  }
  
  return formatYieldWithPool(result[0]);
}

export async function getYieldHistory(
  poolId: string,
  from: Date,
  to: Date,
  interval: '1h' | '1d' | '1w' = '1d'
): Promise<YieldHistoryPoint[]> {
  // Validate pool exists
  const pool = await db.query.pools.findFirst({
    where: eq(pools.id, poolId),
  });
  
  if (!pool) {
    return [];
  }
  
  let intervalExpr: ReturnType<typeof sql>;
  switch (interval) {
    case '1h':
      intervalExpr = sql`DATE_TRUNC('hour', ${yields.timestamp})`;
      break;
    case '1w':
      intervalExpr = sql`DATE_TRUNC('week', ${yields.timestamp})`;
      break;
    case '1d':
    default:
      intervalExpr = sql`DATE_TRUNC('day', ${yields.timestamp})`;
  }
  
  const results = await db
    .select({
      timestamp: intervalExpr.as('interval'),
      apyTotal: sql<number>`AVG(${yields.apyTotal})`.as('avg_apy_total'),
      apyBase: sql<number>`AVG(${yields.apyBase})`.as('avg_apy_base'),
      apyReward: sql<number>`AVG(${yields.apyReward})`.as('avg_apy_reward'),
      tvlUsd: sql<number>`AVG(${yields.tvlUsd})`.as('avg_tvl_usd'),
    })
    .from(yields)
    .where(
      and(
        eq(yields.poolId, poolId),
        gte(yields.timestamp, from),
        lte(yields.timestamp, to)
      )
    )
    .groupBy(intervalExpr)
    .orderBy(asc(intervalExpr));
  
  return results.map((r) => ({
    timestamp: r.timestamp as Date,
    apyTotal: Number((r.apyTotal ?? 0).toFixed(4)),
    apyBase: Number((r.apyBase ?? 0).toFixed(4)),
    apyReward: Number((r.apyReward ?? 0).toFixed(4)),
    tvlUsd: Math.round(r.tvlUsd ?? 0),
  }));
}

function formatYieldWithPool(row: {
  pool: typeof pools.$inferSelect;
  protocol: typeof protocols.$inferSelect;
  yield: typeof yields.$inferSelect;
}): YieldWithPool {
  return {
    poolId: row.pool.id,
    protocol: row.protocol.slug,
    chain: row.pool.chainId,
    token0: {
      symbol: row.pool.token0Symbol,
      address: row.pool.token0Address,
    },
    token1: row.pool.token1Symbol
      ? {
          symbol: row.pool.token1Symbol,
          address: row.pool.token1Address || '',
        }
      : null,
    poolType: row.pool.poolType,
    apy: {
      total: Number(row.yield.apyTotal.toFixed(4)),
      base: Number(row.yield.apyBase.toFixed(4)),
      reward: Number(row.yield.apyReward.toFixed(4)),
    },
    tvlUsd: Math.round(row.yield.tvlUsd),
    updatedAt: row.yield.timestamp,
  };
}
