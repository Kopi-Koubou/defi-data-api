import { and, asc, desc, eq, gte, or, sql, type SQL } from 'drizzle-orm';

import { db, pools, protocols, riskScores, yields } from '../db/index.js';
import type { AuditStatus, PoolType } from '../types/index.js';
import {
  calculateRiskAdjustedApy,
  calculateSharpeLikeMetric,
  computeHeuristicRiskScore,
  type RiskScoreFactors,
} from '../utils/risk.js';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export interface PoolRiskScore {
  poolId: string;
  protocol: string;
  chain: string;
  poolType: string;
  score: number;
  factors: RiskScoreFactors;
  source: 'recorded' | 'computed';
  updatedAt: Date;
}

export interface RiskAdjustedYield {
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
  riskScore: PoolRiskScore;
  metrics: {
    riskAdjustedApy: number;
    apyVolatility30d: number | null;
    sharpeLike: number;
  };
}

export interface RiskAdjustedYieldFilters {
  chain?: string;
  protocol?: string;
  asset?: string;
  assetPair?: string;
  minTvl?: number;
  poolType?: PoolType;
  minScore?: number;
  sortBy?: 'sharpe' | 'apy' | 'score';
  limit?: number;
}

type CandidateRow = {
  pool: typeof pools.$inferSelect;
  protocol: typeof protocols.$inferSelect;
  yield: typeof yields.$inferSelect;
};

type PoolProtocolRow = Pick<CandidateRow, 'pool' | 'protocol'>;

function buildToken0MatchCondition(token: string): SQL<unknown> {
  const normalized = token.trim().toLowerCase();
  if (!normalized) {
    return sql`FALSE`;
  }

  return sql`LOWER(${pools.token0Symbol}) = ${normalized} OR LOWER(${pools.token0Address}) = ${normalized}`;
}

function buildToken1MatchCondition(token: string): SQL<unknown> {
  const normalized = token.trim().toLowerCase();
  if (!normalized) {
    return sql`FALSE`;
  }

  return sql`LOWER(${pools.token1Symbol}) = ${normalized} OR LOWER(${pools.token1Address}) = ${normalized}`;
}

function parseAssetPair(assetPair: string): [string, string] | null {
  const parts = assetPair
    .split(/[\/\-_:]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length !== 2) {
    return null;
  }

  return [parts[0], parts[1]];
}

function formatPoolRisk(
  row: PoolProtocolRow,
  score: number,
  factors: RiskScoreFactors,
  source: 'recorded' | 'computed',
  updatedAt: Date
): PoolRiskScore {
  return {
    poolId: row.pool.id,
    protocol: row.protocol.slug,
    chain: row.pool.chainId,
    poolType: row.pool.poolType,
    score,
    factors,
    source,
    updatedAt,
  };
}

function formatYield(row: CandidateRow): Omit<RiskAdjustedYield, 'riskScore' | 'metrics'> {
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

function buildYieldConditions(filters: RiskAdjustedYieldFilters): SQL<unknown>[] {
  const conditions: SQL<unknown>[] = [];

  if (filters.chain) {
    conditions.push(eq(pools.chainId, filters.chain));
  }

  if (filters.protocol) {
    conditions.push(eq(pools.protocolId, filters.protocol));
  }

  if (filters.poolType) {
    conditions.push(eq(pools.poolType, filters.poolType));
  }

  if (filters.asset) {
    conditions.push(
      or(
        buildToken0MatchCondition(filters.asset),
        buildToken1MatchCondition(filters.asset)
      ) as SQL<unknown>
    );
  }

  if (filters.assetPair) {
    const assetPair = parseAssetPair(filters.assetPair);
    if (assetPair) {
      const [assetA, assetB] = assetPair;
      conditions.push(
        or(
          and(buildToken0MatchCondition(assetA), buildToken1MatchCondition(assetB)),
          and(buildToken0MatchCondition(assetB), buildToken1MatchCondition(assetA))
        ) as SQL<unknown>
      );
    } else {
      conditions.push(sql`FALSE`);
    }
  }

  conditions.push(gte(yields.tvlUsd, filters.minTvl || 0));

  return conditions;
}

async function fetchLatestYieldCandidates(filters: RiskAdjustedYieldFilters): Promise<CandidateRow[]> {
  const requestedLimit = Math.min(Math.max(filters.limit || 50, 1), 100);
  const candidateLimit = Math.min(Math.max(requestedLimit * 4, 100), 400);
  const whereConditions = buildYieldConditions(filters);

  const latestYieldsSubquery = db
    .select({
      poolId: yields.poolId,
      maxTimestamp: sql<Date>`MAX(${yields.timestamp})`.as('max_timestamp'),
    })
    .from(yields)
    .groupBy(yields.poolId)
    .as('latest');

  return db
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
    .where(and(...whereConditions))
    .orderBy(desc(yields.tvlUsd), asc(pools.id))
    .limit(candidateLimit);
}

async function getRecordedRiskMap(poolIds: string[]): Promise<Map<string, { score: number; factors: RiskScoreFactors; timestamp: Date }>> {
  if (poolIds.length === 0) {
    return new Map();
  }

  const latestRows = await db
    .selectDistinctOn([riskScores.poolId], {
      poolId: riskScores.poolId,
      score: riskScores.score,
      factors: riskScores.factors,
      timestamp: riskScores.timestamp,
    })
    .from(riskScores)
    .where(sql`${riskScores.poolId} = ANY(${poolIds})`)
    .orderBy(riskScores.poolId, desc(riskScores.timestamp));

  return new Map(
    latestRows.map((row) => [
      row.poolId,
      {
        score: row.score,
        factors: row.factors as RiskScoreFactors,
        timestamp: row.timestamp,
      },
    ])
  );
}

async function getApyVolatilityMap(poolIds: string[]): Promise<Map<string, number>> {
  if (poolIds.length === 0) {
    return new Map();
  }

  const since = new Date(Date.now() - THIRTY_DAYS_MS);
  const rows = await db
    .select({
      poolId: yields.poolId,
      volatility: sql<number>`STDDEV_POP(${yields.apyTotal})`.as('volatility'),
    })
    .from(yields)
    .where(and(sql`${yields.poolId} = ANY(${poolIds})`, gte(yields.timestamp, since)))
    .groupBy(yields.poolId);

  return new Map(
    rows
      .filter((row) => Number.isFinite(row.volatility) && row.volatility > 0)
      .map((row) => [row.poolId, Number(row.volatility)])
  );
}

function getComputedRiskFromFields(args: {
  auditStatus: AuditStatus;
  poolType: PoolType;
  poolTvlUsd: number;
  protocolTvlUsd: number;
  hasTokenPair: boolean;
}): { score: number; factors: RiskScoreFactors } {
  return computeHeuristicRiskScore({
    auditStatus: args.auditStatus,
    poolType: args.poolType,
    poolTvlUsd: args.poolTvlUsd,
    protocolTvlUsd: args.protocolTvlUsd,
    hasTokenPair: args.hasTokenPair,
  });
}

export async function getPoolRiskScore(poolId: string): Promise<PoolRiskScore | null> {
  const latestYieldsSubquery = db
    .select({
      poolId: yields.poolId,
      maxTimestamp: sql<Date>`MAX(${yields.timestamp})`.as('max_timestamp'),
    })
    .from(yields)
    .where(eq(yields.poolId, poolId))
    .groupBy(yields.poolId)
    .as('latest');

  const rows = await db
    .select({
      pool: pools,
      protocol: protocols,
      yield: yields,
    })
    .from(pools)
    .innerJoin(protocols, eq(pools.protocolId, protocols.id))
    .leftJoin(
      latestYieldsSubquery,
      eq(pools.id, latestYieldsSubquery.poolId)
    )
    .leftJoin(
      yields,
      and(eq(yields.poolId, pools.id), eq(yields.timestamp, latestYieldsSubquery.maxTimestamp))
    )
    .where(eq(pools.id, poolId))
    .limit(1);

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];

  const recorded = await db.query.riskScores.findFirst({
    where: eq(riskScores.poolId, poolId),
    orderBy: desc(riskScores.timestamp),
  });

  if (recorded) {
    return formatPoolRisk(
      row,
      recorded.score,
      recorded.factors as RiskScoreFactors,
      'recorded',
      recorded.timestamp
    );
  }

  const computed = getComputedRiskFromFields({
    auditStatus: row.protocol.auditStatus as AuditStatus,
    poolType: row.pool.poolType as PoolType,
    poolTvlUsd: row.yield?.tvlUsd ?? 0,
    protocolTvlUsd: row.protocol.tvlUsd,
    hasTokenPair: Boolean(row.pool.token1Symbol && row.pool.token1Address),
  });

  return formatPoolRisk(row, computed.score, computed.factors, 'computed', new Date());
}

export async function getRiskAdjustedYields(
  filters: RiskAdjustedYieldFilters
): Promise<RiskAdjustedYield[]> {
  const requestedLimit = Math.min(Math.max(filters.limit || 50, 1), 100);
  const minScore = Math.max(0, Math.min(100, filters.minScore || 0));
  const sortBy = filters.sortBy || 'sharpe';
  const candidates = await fetchLatestYieldCandidates(filters);

  if (candidates.length === 0) {
    return [];
  }

  const poolIds = candidates.map((row) => row.pool.id);
  const riskMap = await getRecordedRiskMap(poolIds);
  const volatilityMap = await getApyVolatilityMap(poolIds);

  const ranked = candidates
    .map((row) => {
      const risk = riskMap.get(row.pool.id);
      const resolvedRisk = risk
        ? formatPoolRisk(row, risk.score, risk.factors, 'recorded', risk.timestamp)
        : (() => {
            const computed = getComputedRiskFromFields({
              auditStatus: row.protocol.auditStatus as AuditStatus,
              poolType: row.pool.poolType as PoolType,
              poolTvlUsd: row.yield.tvlUsd,
              protocolTvlUsd: row.protocol.tvlUsd,
              hasTokenPair: Boolean(row.pool.token1Symbol && row.pool.token1Address),
            });
            return formatPoolRisk(row, computed.score, computed.factors, 'computed', new Date());
          })();

      const apyVolatility30d = volatilityMap.get(row.pool.id) ?? null;
      const riskAdjustedApy = calculateRiskAdjustedApy(row.yield.apyTotal, resolvedRisk.score);
      const sharpeLike = calculateSharpeLikeMetric(
        row.yield.apyTotal,
        apyVolatility30d,
        resolvedRisk.score
      );

      return {
        ...formatYield(row),
        riskScore: resolvedRisk,
        metrics: {
          riskAdjustedApy,
          apyVolatility30d: apyVolatility30d !== null ? Number(apyVolatility30d.toFixed(4)) : null,
          sharpeLike,
        },
      };
    })
    .filter((row) => row.riskScore.score >= minScore);

  ranked.sort((a, b) => {
    if (sortBy === 'apy') {
      return b.apy.total - a.apy.total;
    }

    if (sortBy === 'score') {
      return b.riskScore.score - a.riskScore.score;
    }

    return b.metrics.sharpeLike - a.metrics.sharpeLike;
  });

  return ranked.slice(0, requestedLimit);
}
