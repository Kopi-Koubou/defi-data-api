import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import * as poolService from '../services/pools.js';
import * as riskService from '../services/risk.js';
import { isDateRangeValid, resolveDateRange } from '../utils/date-range.js';
import { createResponseMeta, Errors, sendSuccess } from '../utils/response.js';
import {
  buildChainLimitMessage,
  buildHistoryLimitMessage,
  getDefaultHistoryLookbackDays,
  hasRiskAccess,
  isChainAllowed,
  isDateWithinHistoryWindow,
} from '../utils/tier.js';

const ilHistoryQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  interval: z.enum(['1h', '1d', '1w']).optional().default('1d'),
});

export default async function poolRoutes(fastify: FastifyInstance) {
  // GET /v1/pools/:pool_id/risk-score
  fastify.get('/:pool_id/risk-score', async (request: FastifyRequest, reply: FastifyReply) => {
    const meta = createResponseMeta();
    const { pool_id } = request.params as { pool_id: string };

    if (!hasRiskAccess(request.apiKey?.tier)) {
      Errors.FORBIDDEN(reply, meta, 'Risk scores are available on paid tiers');
      return;
    }

    try {
      const riskScore = await riskService.getPoolRiskScore(pool_id);

      if (!riskScore) {
        Errors.NOT_FOUND(reply, meta, 'Pool');
        return;
      }

      if (!isChainAllowed(riskScore.chain, request.apiKey?.tier)) {
        Errors.FORBIDDEN(reply, meta, buildChainLimitMessage(request.apiKey?.tier));
        return;
      }

      sendSuccess(reply, riskScore, meta);
    } catch (error) {
      request.log.error(error);
      Errors.INTERNAL_ERROR(reply, meta);
    }
  });

  // GET /v1/pools/:pool_id/il/history
  fastify.get('/:pool_id/il/history', async (request: FastifyRequest, reply: FastifyReply) => {
    const meta = createResponseMeta();
    const { pool_id } = request.params as { pool_id: string };

    const parseResult = ilHistoryQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      Errors.BAD_REQUEST(reply, meta, 'Invalid query parameters');
      return;
    }

    const { from, to, interval } = parseResult.data;
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
      const history = await poolService.getPoolIlHistory(pool_id, {
        from: fromDate,
        to: toDate,
        interval,
      });

      if (!history) {
        Errors.NOT_FOUND(reply, meta, 'Pool');
        return;
      }

      if (!isChainAllowed(history.chain, request.apiKey?.tier)) {
        Errors.FORBIDDEN(reply, meta, buildChainLimitMessage(request.apiKey?.tier));
        return;
      }

      sendSuccess(reply, history, meta);
    } catch (error) {
      if (error instanceof poolService.UnsupportedPoolError) {
        Errors.BAD_REQUEST(reply, meta, error.message);
        return;
      }

      request.log.error(error);
      Errors.INTERNAL_ERROR(reply, meta);
    }
  });
}
