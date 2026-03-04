/**
 * Yield endpoints
 * GET /v1/yields
 * GET /v1/yields/:pool_id
 * GET /v1/yields/:pool_id/history
 * GET /v1/yields/top
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { createResponseMeta, sendSuccess, Errors } from '../utils/response.js';
import {
  buildChainLimitMessage,
  buildHistoryLimitMessage,
  getAllowedChains,
  getDefaultHistoryLookbackDays,
  hasRiskAccess,
  isChainAllowed,
  isDateWithinHistoryWindow,
} from '../utils/tier.js';
import { decodeYieldCursor, encodeYieldCursor } from '../utils/yield-cursor.js';
import * as yieldService from '../services/yields.js';
import * as riskService from '../services/risk.js';
import type { PoolType } from '../types/index.js';

const querySchema = z.object({
  chain: z.string().optional(),
  protocol: z.string().optional(),
  asset: z.string().min(1).max(64).optional(),
  asset_pair: z.string().min(3).max(128).regex(/^[^/\-_:]+[/\-_:][^/\-_:]+$/).optional(),
  min_tvl: z.coerce.number().min(0).optional(),
  pool_type: z.enum(['lending', 'lp', 'staking', 'vault', 'restaking']).optional(),
  sort_by: z.enum(['apy', 'tvl']).optional().default('tvl'),
  limit: z.coerce.number().min(1).max(100).optional().default(100),
  cursor: z.string().optional(),
});

const historyQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  interval: z.enum(['1h', '1d', '1w']).optional().default('1d'),
});

const riskAdjustedQuerySchema = z.object({
  chain: z.string().optional(),
  protocol: z.string().optional(),
  asset: z.string().min(1).max(64).optional(),
  asset_pair: z.string().min(3).max(128).regex(/^[^/\-_:]+[/\-_:][^/\-_:]+$/).optional(),
  min_tvl: z.coerce.number().min(0).optional(),
  pool_type: z.enum(['lending', 'lp', 'staking', 'vault', 'restaking']).optional(),
  min_score: z.coerce.number().min(0).max(100).optional().default(0),
  sort_by: z.enum(['sharpe', 'apy', 'score']).optional().default('sharpe'),
  limit: z.coerce.number().min(1).max(100).optional().default(50),
});

export default async function yieldRoutes(fastify: FastifyInstance) {
  // GET /v1/yields - List yields
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const meta = createResponseMeta();
    
    const parseResult = querySchema.safeParse(request.query);
    if (!parseResult.success) {
      Errors.BAD_REQUEST(reply, meta, 'Invalid query parameters');
      return;
    }
    
    const params = parseResult.data;
    const requestedChain = params.chain?.toLowerCase();
    if (requestedChain && !isChainAllowed(requestedChain, request.apiKey?.tier)) {
      Errors.FORBIDDEN(reply, meta, buildChainLimitMessage(request.apiKey?.tier));
      return;
    }

    const tierChainFilter = !requestedChain ? getAllowedChains(request.apiKey?.tier) : undefined;
    const cursor = decodeYieldCursor(params.cursor, params.sort_by);
    if (params.cursor && !cursor) {
      Errors.BAD_REQUEST(reply, meta, 'Invalid cursor');
      return;
    }
    
    try {
      const { yields, hasMore, nextCursor } = await yieldService.getLatestYields({
        chain: requestedChain,
        chains: tierChainFilter || undefined,
        protocol: params.protocol,
        asset: params.asset,
        assetPair: params.asset_pair,
        minTvl: params.min_tvl,
        poolType: params.pool_type as PoolType | undefined,
        sortBy: params.sort_by,
        limit: params.limit,
        cursor: cursor || undefined,
      });
      
      const encodedCursor = nextCursor ? encodeYieldCursor(nextCursor) : null;
      
      sendSuccess(reply, yields, meta, 200, {
        cursor: encodedCursor,
        hasMore,
      });
    } catch (error) {
      request.log.error(error);
      Errors.INTERNAL_ERROR(reply, meta);
    }
  });
  
  // GET /v1/yields/top - Top yields (alias for /yields with sensible defaults)
  fastify.get('/top', async (request: FastifyRequest, reply: FastifyReply) => {
    const meta = createResponseMeta();
    
    const queryParams = { ...(request.query as Record<string, unknown>) };
    queryParams.sort_by = 'apy';
    queryParams.limit = 20;
    const parseResult = querySchema.safeParse(queryParams);
    
    if (!parseResult.success) {
      Errors.BAD_REQUEST(reply, meta, 'Invalid query parameters');
      return;
    }
    
    const params = parseResult.data;
    const requestedChain = params.chain?.toLowerCase();
    if (requestedChain && !isChainAllowed(requestedChain, request.apiKey?.tier)) {
      Errors.FORBIDDEN(reply, meta, buildChainLimitMessage(request.apiKey?.tier));
      return;
    }

    const tierChainFilter = !requestedChain ? getAllowedChains(request.apiKey?.tier) : undefined;
    const cursor = decodeYieldCursor(params.cursor, 'apy');
    if (params.cursor && !cursor) {
      Errors.BAD_REQUEST(reply, meta, 'Invalid cursor');
      return;
    }
    
    try {
      const { yields, hasMore, nextCursor } = await yieldService.getLatestYields({
        chain: requestedChain,
        chains: tierChainFilter || undefined,
        protocol: params.protocol,
        asset: params.asset,
        assetPair: params.asset_pair,
        minTvl: params.min_tvl ?? 100000, // Default $100K min TVL for top
        poolType: params.pool_type as PoolType | undefined,
        sortBy: 'apy',
        limit: 20,
        cursor: cursor || undefined,
      });
      
      const encodedCursor = nextCursor ? encodeYieldCursor(nextCursor) : null;
      
      sendSuccess(reply, yields, meta, 200, {
        cursor: encodedCursor,
        hasMore,
      });
    } catch (error) {
      request.log.error(error);
      Errors.INTERNAL_ERROR(reply, meta);
    }
  });

  // GET /v1/yields/risk-adjusted - Rank yields by risk-adjusted metrics
  fastify.get('/risk-adjusted', async (request: FastifyRequest, reply: FastifyReply) => {
    const meta = createResponseMeta();

    if (!hasRiskAccess(request.apiKey?.tier)) {
      Errors.FORBIDDEN(reply, meta, 'Risk-adjusted yields are available on paid tiers');
      return;
    }

    const parseResult = riskAdjustedQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      Errors.BAD_REQUEST(reply, meta, 'Invalid query parameters');
      return;
    }

    const params = parseResult.data;

    try {
      const yields = await riskService.getRiskAdjustedYields({
        chain: params.chain,
        protocol: params.protocol,
        asset: params.asset,
        assetPair: params.asset_pair,
        minTvl: params.min_tvl,
        poolType: params.pool_type as PoolType | undefined,
        minScore: params.min_score,
        sortBy: params.sort_by,
        limit: params.limit,
      });

      sendSuccess(reply, yields, meta);
    } catch (error) {
      request.log.error(error);
      Errors.INTERNAL_ERROR(reply, meta);
    }
  });
  
  // GET /v1/yields/:pool_id - Get specific pool yield
  fastify.get('/:pool_id', async (request: FastifyRequest, reply: FastifyReply) => {
    const meta = createResponseMeta();
    const { pool_id } = request.params as { pool_id: string };
    
    try {
      const yieldData = await yieldService.getYieldByPoolId(pool_id);
      
      if (!yieldData) {
        Errors.NOT_FOUND(reply, meta, 'Pool');
        return;
      }

      if (!isChainAllowed(yieldData.chain, request.apiKey?.tier)) {
        Errors.FORBIDDEN(reply, meta, buildChainLimitMessage(request.apiKey?.tier));
        return;
      }
      
      sendSuccess(reply, yieldData, meta);
    } catch (error) {
      request.log.error(error);
      Errors.INTERNAL_ERROR(reply, meta);
    }
  });
  
  // GET /v1/yields/:pool_id/history - Get yield history
  fastify.get('/:pool_id/history', async (request: FastifyRequest, reply: FastifyReply) => {
    const meta = createResponseMeta();
    const { pool_id } = request.params as { pool_id: string };
    
    const parseResult = historyQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      Errors.BAD_REQUEST(reply, meta, 'Invalid query parameters');
      return;
    }
    
    const params = parseResult.data;
    
    const defaultLookbackDays = getDefaultHistoryLookbackDays(90, request.apiKey?.tier);
    const to = params.to ? new Date(params.to) : new Date();
    const from = params.from
      ? new Date(params.from)
      : new Date(to.getTime() - defaultLookbackDays * 24 * 60 * 60 * 1000);

    if (from > to) {
      Errors.BAD_REQUEST(reply, meta, '`from` must be before `to`');
      return;
    }

    if (!isDateWithinHistoryWindow(from, request.apiKey?.tier)) {
      Errors.FORBIDDEN(reply, meta, buildHistoryLimitMessage(request.apiKey?.tier));
      return;
    }
    
    try {
      const poolYield = await yieldService.getYieldByPoolId(pool_id);
      if (!poolYield) {
        Errors.NOT_FOUND(reply, meta, 'Pool');
        return;
      }

      if (!isChainAllowed(poolYield.chain, request.apiKey?.tier)) {
        Errors.FORBIDDEN(reply, meta, buildChainLimitMessage(request.apiKey?.tier));
        return;
      }

      const history = await yieldService.getYieldHistory(pool_id, from, to, params.interval);
      
      sendSuccess(reply, history, meta);
    } catch (error) {
      request.log.error(error);
      Errors.INTERNAL_ERROR(reply, meta);
    }
  });
}
