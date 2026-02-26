/**
 * Protocol service
 */

import { eq, desc, asc, and, gte, lte, sql } from 'drizzle-orm';
import { db, protocols, pools, yields } from '../db/index.js';
import type { Protocol, Pool, AuditStatus } from '../types/index.js';

export interface ProtocolWithStats extends Protocol {
  poolCount: number;
  totalTvlUsd: number;
}

export interface ProtocolTvlHistoryPoint {
  timestamp: Date;
  tvlUsd: number;
}

export async function getAllProtocols(): Promise<ProtocolWithStats[]> {
  const results = await db.query.protocols.findMany({
    orderBy: desc(protocols.tvlUsd),
  });
  
  // Get pool counts for each protocol
  const poolCounts = await db
    .select({
      protocolId: pools.protocolId,
      count: sql<number>`COUNT(*)`.as('count'),
    })
    .from(pools)
    .groupBy(pools.protocolId);
  
  const countMap = new Map(poolCounts.map((p) => [p.protocolId, p.count]));
  
  return results.map((protocol) => ({
    id: protocol.id,
    slug: protocol.slug,
    name: protocol.name,
    chainIds: protocol.chainIds,
    category: protocol.category,
    url: protocol.url,
    auditStatus: protocol.auditStatus as AuditStatus,
    tvlUsd: protocol.tvlUsd,
    createdAt: protocol.createdAt,
    poolCount: countMap.get(protocol.id) || 0,
    totalTvlUsd: protocol.tvlUsd,
  }));
}

export async function getProtocolById(id: string): Promise<ProtocolWithStats | null> {
  const protocol = await db.query.protocols.findFirst({
    where: eq(protocols.id, id),
  });
  
  if (!protocol) {
    return null;
  }
  
  const poolCount = await db
    .select({ count: sql<number>`COUNT(*)`.as('count') })
    .from(pools)
    .where(eq(pools.protocolId, id))
    .then((r) => r[0]?.count || 0);
  
  return {
    id: protocol.id,
    slug: protocol.slug,
    name: protocol.name,
    chainIds: protocol.chainIds,
    category: protocol.category,
    url: protocol.url,
    auditStatus: protocol.auditStatus as AuditStatus,
    tvlUsd: protocol.tvlUsd,
    createdAt: protocol.createdAt,
    poolCount,
    totalTvlUsd: protocol.tvlUsd,
  };
}

export async function getProtocolTvlHistory(
  protocolId: string,
  from: Date,
  to: Date
): Promise<ProtocolTvlHistoryPoint[]> {
  // Get all pool IDs for this protocol
  const poolList = await db
    .select({ id: pools.id })
    .from(pools)
    .where(eq(pools.protocolId, protocolId));
  
  if (poolList.length === 0) {
    return [];
  }
  
  const poolIds = poolList.map((p) => p.id);
  
  // Aggregate TVL by date
  const results = await db
    .select({
      timestamp: sql<Date>`DATE_TRUNC('day', ${yields.timestamp})`.as('date'),
      tvlUsd: sql<number>`SUM(${yields.tvlUsd})`.as('total_tvl'),
    })
    .from(yields)
    .where(
      and(
        sql`${yields.poolId} = ANY(${poolIds})`,
        gte(yields.timestamp, from),
        lte(yields.timestamp, to)
      )
    )
    .groupBy(sql`DATE_TRUNC('day', ${yields.timestamp})`)
    .orderBy(asc(sql`DATE_TRUNC('day', ${yields.timestamp})`));
  
  return results.map((r) => ({
    timestamp: r.timestamp,
    tvlUsd: Math.round(r.tvlUsd),
  }));
}

export async function getProtocolPools(protocolId: string): Promise<Pool[]> {
  const results = await db.query.pools.findMany({
    where: eq(pools.protocolId, protocolId),
    orderBy: desc(pools.createdAt),
  });
  
  return results.map((p) => ({
    id: p.id,
    protocolId: p.protocolId,
    chainId: p.chainId,
    address: p.address,
    token0: {
      symbol: p.token0Symbol,
      address: p.token0Address,
      decimals: p.token0Decimals,
    },
    token1: p.token1Symbol
      ? {
          symbol: p.token1Symbol,
          address: p.token1Address || '',
          decimals: p.token1Decimals || 18,
        }
      : null,
    poolType: p.poolType as Pool['poolType'],
    createdAt: p.createdAt,
  }));
}
