/**
 * Tool endpoints
 * GET /v1/tools/impermanent-loss
 * POST /v1/tools/impermanent-loss/simulate
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { createResponseMeta, sendSuccess, Errors } from '../utils/response.js';
import { hasAdvancedIlAccess } from '../utils/tier.js';
import {
  InvalidImpermanentLossInputError,
  calculateILWithFees,
  calculateImpermanentLoss,
  simulateILScenarios,
  simulateILScenariosWithFees,
} from '../utils/il-calculator.js';

const ilQuerySchema = z.object({
  token0: z.string().min(1).max(10),
  token1: z.string().min(1).max(10),
  entry_price_ratio: z.coerce.number().finite().positive(),
  current_price_ratio: z.coerce.number().finite().positive(),
  fee_apr: z.coerce.number().finite().min(0).max(1000).optional(),
  days: z.coerce.number().int().min(1).max(3650).optional(),
});

const ilSimulateSchema = z.object({
  token0: z.string().min(1).max(10),
  token1: z.string().min(1).max(10),
  entry_price_ratio: z.coerce.number().finite().positive(),
  price_changes: z.array(z.number().finite().gt(-1)).min(1).max(20),
  fee_apr: z.coerce.number().finite().min(0).max(1000).optional(),
  days: z.coerce.number().int().min(1).max(3650).optional(),
});

function areFeeInputsValid(
  feeApr: number | undefined,
  days: number | undefined
): { valid: boolean; withFees: boolean } {
  const withFees = feeApr !== undefined || days !== undefined;
  if (!withFees) {
    return { valid: true, withFees: false };
  }

  return {
    valid: feeApr !== undefined && days !== undefined,
    withFees: true,
  };
}

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

    const feeValidation = areFeeInputsValid(params.fee_apr, params.days);
    if (!feeValidation.valid) {
      Errors.BAD_REQUEST(reply, meta, '`fee_apr` and `days` must be provided together');
      return;
    }

    if (feeValidation.withFees && !hasAdvancedIlAccess(request.apiKey?.tier)) {
      Errors.FORBIDDEN(reply, meta, 'Fee-adjusted IL is available on paid tiers');
      return;
    }
    
    try {
      const input = {
        token0: params.token0,
        token1: params.token1,
        entryPriceRatio: params.entry_price_ratio,
        currentPriceRatio: params.current_price_ratio,
      };

      const result = feeValidation.withFees
        ? calculateILWithFees(input, params.fee_apr!, params.days!)
        : calculateImpermanentLoss(input);
      
      sendSuccess(reply, result, meta);
    } catch (error) {
      if (error instanceof InvalidImpermanentLossInputError) {
        Errors.BAD_REQUEST(reply, meta, error.message);
        return;
      }

      request.log.error(error);
      Errors.INTERNAL_ERROR(reply, meta);
    }
  });
  
  // POST /v1/tools/impermanent-loss/simulate - Batch simulation
  fastify.post('/impermanent-loss/simulate', async (request: FastifyRequest, reply: FastifyReply) => {
    const meta = createResponseMeta();

    if (!hasAdvancedIlAccess(request.apiKey?.tier)) {
      Errors.FORBIDDEN(reply, meta, 'Batch IL simulation is available on paid tiers');
      return;
    }
    
    const parseResult = ilSimulateSchema.safeParse(request.body);
    if (!parseResult.success) {
      Errors.BAD_REQUEST(reply, meta, 'Invalid request body');
      return;
    }
    
    const params = parseResult.data;

    const feeValidation = areFeeInputsValid(params.fee_apr, params.days);
    if (!feeValidation.valid) {
      Errors.BAD_REQUEST(reply, meta, '`fee_apr` and `days` must be provided together');
      return;
    }
    
    try {
      const baseInput = {
        token0: params.token0,
        token1: params.token1,
        entryPriceRatio: params.entry_price_ratio,
      };

      const scenarios = feeValidation.withFees
        ? simulateILScenariosWithFees(
            baseInput,
            params.price_changes,
            params.fee_apr!,
            params.days!
          )
        : simulateILScenarios(baseInput, params.price_changes);
      
      sendSuccess(
        reply,
        {
          token0: params.token0,
          token1: params.token1,
          entryPriceRatio: params.entry_price_ratio,
          ...(feeValidation.withFees ? { feeApr: params.fee_apr, days: params.days } : {}),
          scenarios,
        },
        meta
      );
    } catch (error) {
      if (error instanceof InvalidImpermanentLossInputError) {
        Errors.BAD_REQUEST(reply, meta, error.message);
        return;
      }

      request.log.error(error);
      Errors.INTERNAL_ERROR(reply, meta);
    }
  });
}
