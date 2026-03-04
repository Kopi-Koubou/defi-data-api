/**
 * Chain endpoints
 * GET /v1/chains/:chain_id/tvl
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { createResponseMeta, sendSuccess, Errors } from '../utils/response.js';
import { isDateRangeValid, resolveDateRange } from '../utils/date-range.js';
import {
  buildHistoryLimitMessage,
  getDefaultHistoryLookbackDays,
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
    
    const parseResult = historyQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      Errors.BAD_REQUEST(reply, meta, 'Invalid query parameters');
      return;
    }
    
    const { from, to } = parseResult.data;
    const defaultLookbackDays = getDefaultHistoryLookbackDays(30, request.apiKey?.tier);
    const { from: fromDate, to: toDate } = resolveDateRange(from, to, defaultLookbackDays);

    if (!isDateRangeValid({ from: fromDate, to: toDate })) {
      Errors.BAD_REQUEST(reply, meta, '`from` must be before `to`');
      return;
    }

    if (!isDateWithinHistoryWindow(fromDate, request.apiKey?.tier, toDate)) {
      Errors.FORBIDDEN(reply, meta, buildHistoryLimitMessage(request.apiKey?.tier));
      return;
    }
    
    try {
      // Get all pools on this chain
      const chainPools = await db
        .select({ id: pools.id })
        .from(pools)
        .where(eq(pools.chainId, chain_id));
      
      if (chainPools.length === 0) {
        Errors.NOT_FOUND(reply, meta, 'Chain');
        return;
      }
      
      const poolIds = chainPools.map((p) => p.id);
      
      // Aggregate TVL by day
      const results = await db
        .select({
          timestamp: sql<Date>`DATE_TRUNC('day', ${yields.timestamp})`.as('date'),
          tvlUsd: sql<number>`SUM(${yields.tvlUsd})`.as('total_tvl'),
          poolCount: sql<number>`COUNT(DISTINCT ${yields.poolId})`.as('pool_count'),
        })
        .from(yields)
        .where(
          and(
            sql`${yields.poolId} = ANY(${poolIds})`,
            gte(yields.timestamp, fromDate),
            lte(yields.timestamp, toDate)
          )
        )
        .groupBy(sql`DATE_TRUNC('day', ${yields.timestamp})`)
        .orderBy(asc(sql`DATE_TRUNC('day', ${yields.timestamp})`));
      
      // Get protocol count on this chain
      const protocolCount = await db
        .select({ count: sql<number>`COUNT(DISTINCT ${pools.protocolId})`.as('count') })
        .from(pools)
        .where(eq(pools.chainId, chain_id))
        .then((r) => r[0]?.count || 0);
      
      const history: ChainTvlPoint[] = results.map((r) => ({
        timestamp: r.timestamp,
        tvlUsd: Math.round(r.tvlUsd),
        protocolCount,
        poolCount: r.poolCount,
      }));
      
      // Get current stats
      const currentStats = await db
        .select({
          tvlUsd: sql<number>`SUM(${yields.tvlUsd})`.as('current_tvl'),
        })
        .from(yields)
        .where(
          and(
            sql`${yields.poolId} = ANY(${poolIds})`,
            sql`${yields.timestamp} = (SELECT MAX(timestamp) FROM ${yields} WHERE ${sql`${yields.poolId} = ANY(${poolIds})`})`
          )
        )
        .then((r) => r[0]);
      
      sendSuccess(
        reply,
        {
          chain: chain_id,
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
