/**
 * Protocol service
 */

import { eq, desc, asc, and, gte, lte, sql } from 'drizzle-orm';
import { db, protocols, pools, yields } from '../db/index.js';
import type { Protocol, Pool, AuditStatus } from '../types/index.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export interface ProtocolTvlTrend {
  asOf: Date | null;
  currentTvlUsd: number;
  change7dPct: number | null;
  change30dPct: number | null;
}

export interface ProtocolWithStats extends Protocol {
  poolCount: number;
  totalTvlUsd: number;
  tvlTrend?: ProtocolTvlTrend;
}

export interface ProtocolAuditStatus {
  protocolId: string;
  slug: string;
  name: string;
  auditStatus: AuditStatus;
  updatedAt: Date;
}

export interface ProtocolTvlHistoryPoint {
  timestamp: Date;
  tvlUsd: number;
}

export function calculatePercentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) {
    return null;
  }

  const change = ((current - previous) / previous) * 100;
  return Number(change.toFixed(2));
}

export function findLatestPointAtOrBefore(
  history: ProtocolTvlHistoryPoint[],
  target: Date
): ProtocolTvlHistoryPoint | null {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].timestamp <= target) {
      return history[i];
    }
  }

  return null;
}

async function getProtocolPoolIds(protocolId: string): Promise<string[]> {
  const poolList = await db
    .select({ id: pools.id })
    .from(pools)
    .where(eq(pools.protocolId, protocolId));

  return poolList.map((p) => p.id);
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

  const tvlTrend = await getProtocolTvlTrend(id);
  const effectiveTvlUsd = tvlTrend.currentTvlUsd > 0 ? tvlTrend.currentTvlUsd : protocol.tvlUsd;
  
  return {
    id: protocol.id,
    slug: protocol.slug,
    name: protocol.name,
    chainIds: protocol.chainIds,
    category: protocol.category,
    url: protocol.url,
    auditStatus: protocol.auditStatus as AuditStatus,
    tvlUsd: effectiveTvlUsd,
    createdAt: protocol.createdAt,
    poolCount,
    totalTvlUsd: effectiveTvlUsd,
    tvlTrend,
  };
}

export async function getProtocolTvlHistory(
  protocolId: string,
  from: Date,
  to: Date
): Promise<ProtocolTvlHistoryPoint[]> {
  // Get all pool IDs for this protocol
  const poolIds = await getProtocolPoolIds(protocolId);
  if (poolIds.length === 0) {
    return [];
  }

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

export async function getProtocolTvlTrend(protocolId: string): Promise<ProtocolTvlTrend> {
  const to = new Date();
  const from = new Date(to.getTime() - 35 * ONE_DAY_MS);
  const history = await getProtocolTvlHistory(protocolId, from, to);

  if (history.length === 0) {
    return {
      asOf: null,
      currentTvlUsd: 0,
      change7dPct: null,
      change30dPct: null,
    };
  }

  const latest = history[history.length - 1];
  const sevenDaysAgo = new Date(latest.timestamp.getTime() - 7 * ONE_DAY_MS);
  const thirtyDaysAgo = new Date(latest.timestamp.getTime() - 30 * ONE_DAY_MS);
  const point7d = findLatestPointAtOrBefore(history, sevenDaysAgo);
  const point30d = findLatestPointAtOrBefore(history, thirtyDaysAgo);

  return {
    asOf: latest.timestamp,
    currentTvlUsd: latest.tvlUsd,
    change7dPct: point7d ? calculatePercentChange(latest.tvlUsd, point7d.tvlUsd) : null,
    change30dPct: point30d ? calculatePercentChange(latest.tvlUsd, point30d.tvlUsd) : null,
  };
}

export async function getProtocolAuditStatus(protocolId: string): Promise<ProtocolAuditStatus | null> {
  const protocol = await db.query.protocols.findFirst({
    where: eq(protocols.id, protocolId),
  });

  if (!protocol) {
    return null;
  }

  return {
    protocolId: protocol.id,
    slug: protocol.slug,
    name: protocol.name,
    auditStatus: protocol.auditStatus as AuditStatus,
    updatedAt: protocol.updatedAt,
  };
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
