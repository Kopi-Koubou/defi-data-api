/**
 * Chain endpoints
 * GET /v1/chains/:chain_id/tvl
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { createResponseMeta, sendSuccess, Errors } from '../utils/response.js';
import { isDateRangeValid, resolveDateRange } from '../utils/date-range.js';
import {
  buildChainLimitMessage,
  buildHistoryLimitMessage,
  getDefaultHistoryLookbackDays,
  isChainAllowed,
  isDateWithinHistoryWindow,
} from '../utils/tier.js';
import { db, pools, yields } from '../db/index.js';
import { eq, and, gte, lte, sql, asc } from 'drizzle-orm';

const historyQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

interface ChainTvlPoint {
  timestamp: Date;
  tvlUsd: number;
  protocolCount: number;
  poolCount: number;
}

export default async function chainRoutes(fastify: FastifyInstance) {
  // GET /v1/chains/:chain_id/tvl
  fastify.get('/:chain_id/tvl', async (request: FastifyRequest, reply: FastifyReply) => {
    const meta = createResponseMeta();
    const { chain_id } = request.params as { chain_id: string };
    const normalizedChainId = chain_id.toLowerCase();

    if (!isChainAllowed(normalizedChainId, request.apiKey?.tier)) {
      Errors.FORBIDDEN(reply, meta, buildChainLimitMessage(request.apiKey?.tier));
      return;
    }
    
    const parseResult = historyQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      Errors.BAD_REQUEST(reply, meta, 'Invalid query parameters');
      return;
    }
    
    const { from, to } = parseResult.data;
    const defaultLookbackDays = getDefaultHistoryLookbackDays(90, request.apiKey?.tier);
    const { from: fromDate, to: toDate } = resolveDateRange(from, to, defaultLookbackDays);

    if (!isDateRangeValid({ from: fromDate, to: toDate })) {
      Errors.BAD_REQUEST(reply, meta, '`from` must be before `to`');
      return;
    }

    if (!isDateWithinHistoryWindow(fromDate, request.apiKey?.tier)) {
      Errors.FORBIDDEN(reply, meta, buildHistoryLimitMessage(request.apiKey?.tier));
      return;
    }
    
    try {
      // Get all pools on this chain
      const chainPools = await db
        .select({ id: pools.id })
        .from(pools)
        .where(eq(pools.chainId, normalizedChainId));
      
      if (chainPools.length === 0) {
        Errors.NOT_FOUND(reply, meta, 'Chain');
        return;
      }
      
      const poolIds = chainPools.map((p) => p.id);
      
      const dayExpr = sql`DATE_TRUNC('day', ${yields.timestamp})`;
      const latestPoolSnapshots = db
        .select({
          day: dayExpr.as('day'),
          poolId: yields.poolId,
          maxTimestamp: sql<Date>`MAX(${yields.timestamp})`.as('max_timestamp'),
        })
        .from(yields)
        .where(
          and(
            sql`${yields.poolId} = ANY(${poolIds})`,
            gte(yields.timestamp, fromDate),
            lte(yields.timestamp, toDate)
          )
        )
        .groupBy(dayExpr, yields.poolId)
        .as('latest_pool_snapshots');

      // Aggregate daily TVL from each pool's latest snapshot in that interval.
      const results = await db
        .select({
          timestamp: latestPoolSnapshots.day,
          tvlUsd: sql<number>`SUM(${yields.tvlUsd})`.as('total_tvl'),
          poolCount: sql<number>`COUNT(${latestPoolSnapshots.poolId})`.as('pool_count'),
        })
        .from(latestPoolSnapshots)
        .innerJoin(
          yields,
          and(
            eq(yields.poolId, latestPoolSnapshots.poolId),
            eq(yields.timestamp, latestPoolSnapshots.maxTimestamp)
          )
        )
        .groupBy(latestPoolSnapshots.day)
        .orderBy(asc(latestPoolSnapshots.day));
      
      // Get protocol count on this chain
      const protocolCount = await db
        .select({ count: sql<number>`COUNT(DISTINCT ${pools.protocolId})`.as('count') })
        .from(pools)
        .where(eq(pools.chainId, normalizedChainId))
        .then((r) => r[0]?.count || 0);
      
      const history: ChainTvlPoint[] = results.map((r) => ({
        timestamp: r.timestamp as Date,
        tvlUsd: Math.round(r.tvlUsd),
        protocolCount,
        poolCount: r.poolCount,
      }));
      
      const latestPerPool = db
        .select({
          poolId: yields.poolId,
          maxTimestamp: sql<Date>`MAX(${yields.timestamp})`.as('max_timestamp'),
        })
        .from(yields)
        .where(sql`${yields.poolId} = ANY(${poolIds})`)
        .groupBy(yields.poolId)
        .as('latest_per_pool');

      // Get current stats from latest snapshot per pool.
      const currentStats = await db
        .select({
          tvlUsd: sql<number>`SUM(${yields.tvlUsd})`.as('current_tvl'),
        })
        .from(latestPerPool)
        .innerJoin(
          yields,
          and(
            eq(yields.poolId, latestPerPool.poolId),
            eq(yields.timestamp, latestPerPool.maxTimestamp)
          )
        )
        .then((r) => r[0]);
      
      sendSuccess(
        reply,
        {
          chain: normalizedChainId,
          currentTvlUsd: Math.round(currentStats?.tvlUsd || 0),
          protocolCount,
          poolCount: chainPools.length,
          history,
        },
        meta
      );
    } catch (error) {
      request.log.error(error);
      Errors.INTERNAL_ERROR(reply, meta);
    }
  });
}
