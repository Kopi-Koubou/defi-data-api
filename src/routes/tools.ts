/**
 * Tool endpoints
 * GET /v1/tools/impermanent-loss
 * POST /v1/tools/impermanent-loss/simulate
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { createResponseMeta, sendSuccess, Errors } from '../utils/response.js';
import { calculateImpermanentLoss, simulateILScenarios } from '../utils/il-calculator.js';

const ilQuerySchema = z.object({
  token0: z.string().min(1).max(10),
  token1: z.string().min(1).max(10),
  entry_price_ratio: z.coerce.number().positive(),
  current_price_ratio: z.coerce.number().positive(),
});

const ilSimulateSchema = z.object({
  token0: z.string().min(1).max(10),
  token1: z.string().min(1).max(10),
  entry_price_ratio: z.coerce.number().positive(),
  price_changes: z.array(z.number()).min(1).max(20),
});

export default async function toolsRoutes(fastify: FastifyInstance) {
  // GET /v1/tools/impermanent-loss - Calculate IL for a pair
  fastify.get('/impermanent-loss', async (request: FastifyRequest, reply: FastifyReply) => {
    const meta = createResponseMeta();
    
    const parseResult = ilQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      Errors.BAD_REQUEST(reply, meta, 'Invalid query parameters');
      return;
    }
    
    const params = parseResult.data;
    
    try {
      const result = calculateImpermanentLoss({
        token0: params.token0,
        token1: params.token1,
        entryPriceRatio: params.entry_price_ratio,
        currentPriceRatio: params.current_price_ratio,
      });
      
      sendSuccess(reply, result, meta);
    } catch (error) {
      request.log.error(error);
      Errors.INTERNAL_ERROR(reply, meta);
    }
  });
  
  // POST /v1/tools/impermanent-loss/simulate - Batch simulation
  fastify.post('/impermanent-loss/simulate', async (request: FastifyRequest, reply: FastifyReply) => {
    const meta = createResponseMeta();
    
    const parseResult = ilSimulateSchema.safeParse(request.body);
    if (!parseResult.success) {
      Errors.BAD_REQUEST(reply, meta, 'Invalid request body');
      return;
    }
    
    const params = parseResult.data;
    
    try {
      const scenarios = simulateILScenarios(
        {
          token0: params.token0,
          token1: params.token1,
          entryPriceRatio: params.entry_price_ratio,
        },
        params.price_changes
      );
      
      sendSuccess(reply, {
        token0: params.token0,
        token1: params.token1,
        entryPriceRatio: params.entry_price_ratio,
        scenarios,
      }, meta);
    } catch (error) {
      request.log.error(error);
      Errors.INTERNAL_ERROR(reply, meta);
    }
  });
}
