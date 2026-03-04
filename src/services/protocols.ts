/**
 * Protocol service
 */

import { eq, desc, asc, and, gte, lte, sql, inArray, type SQL } from 'drizzle-orm';
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

function resolveAllowedChains(allowedChains: string[] | null | undefined): string[] | null {
  if (!allowedChains || allowedChains.length === 0) {
    return null;
  }

  return allowedChains;
}

function filterChainIds(chainIds: string[], allowedChains: string[] | null): string[] {
  if (!allowedChains) {
    return [...chainIds];
  }

  return chainIds.filter((chainId) => allowedChains.includes(chainId));
}

function buildChainCondition(allowedChains: string[] | null): SQL<unknown> | undefined {
  if (!allowedChains) {
    return undefined;
  }

  return inArray(pools.chainId, allowedChains);
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

async function getProtocolPoolIds(
  protocolId: string,
  allowedChains: string[] | null
): Promise<string[]> {
  const conditions: SQL<unknown>[] = [eq(pools.protocolId, protocolId)];
  const chainCondition = buildChainCondition(allowedChains);
  if (chainCondition) {
    conditions.push(chainCondition);
  }

  const poolList = await db
    .select({ id: pools.id })
    .from(pools)
    .where(and(...conditions));

  return poolList.map((p) => p.id);
}

export async function getAllProtocols(
  allowedChainsInput?: string[] | null
): Promise<ProtocolWithStats[]> {
  const allowedChains = resolveAllowedChains(allowedChainsInput);
  const chainCondition = buildChainCondition(allowedChains);
  const results = await db.query.protocols.findMany({
    orderBy: desc(protocols.tvlUsd),
  });

  const poolCounts = await db
    .select({
      protocolId: pools.protocolId,
      count: sql<number>`COUNT(*)`.as('count'),
    })
    .from(pools)
    .where(chainCondition)
    .groupBy(pools.protocolId);
  const countMap = new Map(poolCounts.map((p) => [p.protocolId, p.count]));

  const latestYieldsSubquery = db
    .select({
      poolId: yields.poolId,
      maxTimestamp: sql<Date>`MAX(${yields.timestamp})`.as('max_timestamp'),
    })
    .from(yields)
    .groupBy(yields.poolId)
    .as('latest');

  const tvlRows = await db
    .select({
      protocolId: pools.protocolId,
      totalTvlUsd: sql<number>`SUM(${yields.tvlUsd})`.as('total_tvl_usd'),
    })
    .from(yields)
    .innerJoin(pools, eq(yields.poolId, pools.id))
    .innerJoin(
      latestYieldsSubquery,
      and(
        eq(yields.poolId, latestYieldsSubquery.poolId),
        eq(yields.timestamp, latestYieldsSubquery.maxTimestamp)
      )
    )
    .where(chainCondition)
    .groupBy(pools.protocolId);
  const tvlMap = new Map(tvlRows.map((row) => [row.protocolId, Number(row.totalTvlUsd || 0)]));

  const scopedProtocols = results
    .map((protocol) => {
      const scopedChainIds = filterChainIds(protocol.chainIds, allowedChains);
      if (allowedChains && scopedChainIds.length === 0) {
        return null;
      }

      const scopedTvlUsd = tvlMap.get(protocol.id);
      const totalTvlUsd =
        scopedTvlUsd !== undefined ? scopedTvlUsd : allowedChains ? 0 : protocol.tvlUsd;

      return {
        id: protocol.id,
        slug: protocol.slug,
        name: protocol.name,
        chainIds: scopedChainIds,
        category: protocol.category,
        url: protocol.url,
        auditStatus: protocol.auditStatus as AuditStatus,
        tvlUsd: totalTvlUsd,
        createdAt: protocol.createdAt,
        poolCount: countMap.get(protocol.id) || 0,
        totalTvlUsd,
      };
    })
    .filter((protocol): protocol is ProtocolWithStats => Boolean(protocol));

  scopedProtocols.sort((a, b) => b.totalTvlUsd - a.totalTvlUsd);
  return scopedProtocols;
}

export async function getProtocolById(
  id: string,
  allowedChainsInput?: string[] | null
): Promise<ProtocolWithStats | null> {
  const allowedChains = resolveAllowedChains(allowedChainsInput);
  const protocol = await db.query.protocols.findFirst({
    where: eq(protocols.id, id),
  });
  
  if (!protocol) {
    return null;
  }

  const scopedChainIds = filterChainIds(protocol.chainIds, allowedChains);
  if (allowedChains && scopedChainIds.length === 0) {
    return null;
  }

  const conditions: SQL<unknown>[] = [eq(pools.protocolId, id)];
  const chainCondition = buildChainCondition(allowedChains);
  if (chainCondition) {
    conditions.push(chainCondition);
  }
  
  const poolCount = await db
    .select({ count: sql<number>`COUNT(*)`.as('count') })
    .from(pools)
    .where(and(...conditions))
    .then((r) => r[0]?.count || 0);

  const tvlTrend = await getProtocolTvlTrend(id, allowedChains);
  const effectiveTvlUsd =
    tvlTrend.currentTvlUsd > 0 ? tvlTrend.currentTvlUsd : allowedChains ? 0 : protocol.tvlUsd;
  
  return {
    id: protocol.id,
    slug: protocol.slug,
    name: protocol.name,
    chainIds: scopedChainIds,
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
  to: Date,
  allowedChainsInput?: string[] | null
): Promise<ProtocolTvlHistoryPoint[]> {
  const allowedChains = resolveAllowedChains(allowedChainsInput);
  // Get all pool IDs for this protocol
  const poolIds = await getProtocolPoolIds(protocolId, allowedChains);
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

export async function getProtocolTvlTrend(
  protocolId: string,
  allowedChainsInput?: string[] | null
): Promise<ProtocolTvlTrend> {
  const allowedChains = resolveAllowedChains(allowedChainsInput);
  const to = new Date();
  const from = new Date(to.getTime() - 35 * ONE_DAY_MS);
  const history = await getProtocolTvlHistory(protocolId, from, to, allowedChains);

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

export async function getProtocolAuditStatus(
  protocolId: string,
  allowedChainsInput?: string[] | null
): Promise<ProtocolAuditStatus | null> {
  const allowedChains = resolveAllowedChains(allowedChainsInput);
  const protocol = await db.query.protocols.findFirst({
    where: eq(protocols.id, protocolId),
  });

  if (!protocol) {
    return null;
  }

  if (allowedChains) {
    const scopedChainIds = filterChainIds(protocol.chainIds, allowedChains);
    if (scopedChainIds.length === 0) {
      return null;
    }
  }

  return {
    protocolId: protocol.id,
    slug: protocol.slug,
    name: protocol.name,
    auditStatus: protocol.auditStatus as AuditStatus,
    updatedAt: protocol.updatedAt,
  };
}

export async function getProtocolPools(
  protocolId: string,
  allowedChainsInput?: string[] | null
): Promise<Pool[]> {
  const allowedChains = resolveAllowedChains(allowedChainsInput);
  const conditions: SQL<unknown>[] = [eq(pools.protocolId, protocolId)];
  const chainCondition = buildChainCondition(allowedChains);
  if (chainCondition) {
    conditions.push(chainCondition);
  }

  const results = await db.query.pools.findMany({
    where: and(...conditions),
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
