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
import { decodeYieldCursor, encodeYieldCursor } from '../utils/yield-cursor.js';
import * as yieldService from '../services/yields.js';
import type { PoolType } from '../types/index.js';

const querySchema = z.object({
  chain: z.string().optional(),
  protocol: z.string().optional(),
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
    const cursor = decodeYieldCursor(params.cursor, params.sort_by);
    if (params.cursor && !cursor) {
      Errors.BAD_REQUEST(reply, meta, 'Invalid cursor');
      return;
    }
    
    try {
      const { yields, hasMore, nextCursor } = await yieldService.getLatestYields({
        chain: params.chain,
        protocol: params.protocol,
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
    const cursor = decodeYieldCursor(params.cursor, 'apy');
    if (params.cursor && !cursor) {
      Errors.BAD_REQUEST(reply, meta, 'Invalid cursor');
      return;
    }
    
    try {
      const { yields, hasMore, nextCursor } = await yieldService.getLatestYields({
        chain: params.chain,
        protocol: params.protocol,
        minTvl: params.min_tvl || 100000, // Default $100K min TVL for top
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
    
    // Default to last 90 days for MVP historical depth
    const to = params.to ? new Date(params.to) : new Date();
    const from = params.from
      ? new Date(params.from)
      : new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);

    if (from > to) {
      Errors.BAD_REQUEST(reply, meta, '`from` must be before `to`');
      return;
    }
    
    try {
      const history = await yieldService.getYieldHistory(pool_id, from, to, params.interval);
      
      if (history.length === 0) {
        // Check if pool exists
        const poolExists = await yieldService.getYieldByPoolId(pool_id);
        if (!poolExists) {
          Errors.NOT_FOUND(reply, meta, 'Pool');
          return;
        }
      }
      
      sendSuccess(reply, history, meta);
    } catch (error) {
      request.log.error(error);
      Errors.INTERNAL_ERROR(reply, meta);
    }
  });
}
