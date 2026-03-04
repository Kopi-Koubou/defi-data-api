/**
 * Protocol endpoints
 * GET /v1/protocols
 * GET /v1/protocols/:protocol_id
 * GET /v1/protocols/:protocol_id/audit-status
 * GET /v1/protocols/:protocol_id/tvl/history
 * GET /v1/protocols/:protocol_id/pools
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
import * as protocolService from '../services/protocols.js';

const historyQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export default async function protocolRoutes(fastify: FastifyInstance) {
  // GET /v1/protocols - List all protocols
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const meta = createResponseMeta();
    
    try {
      const protocols = await protocolService.getAllProtocols();
      sendSuccess(reply, protocols, meta);
    } catch (error) {
      request.log.error(error);
      Errors.INTERNAL_ERROR(reply, meta);
    }
  });
  
  // GET /v1/protocols/:protocol_id - Get protocol details
  fastify.get('/:protocol_id', async (request: FastifyRequest, reply: FastifyReply) => {
    const meta = createResponseMeta();
    const { protocol_id } = request.params as { protocol_id: string };
    
    try {
      const protocol = await protocolService.getProtocolById(protocol_id);
      
      if (!protocol) {
        Errors.NOT_FOUND(reply, meta, 'Protocol');
        return;
      }
      
      sendSuccess(reply, protocol, meta);
    } catch (error) {
      request.log.error(error);
      Errors.INTERNAL_ERROR(reply, meta);
    }
  });

  // GET /v1/protocols/:protocol_id/audit-status
  fastify.get('/:protocol_id/audit-status', async (request: FastifyRequest, reply: FastifyReply) => {
    const meta = createResponseMeta();
    const { protocol_id } = request.params as { protocol_id: string };

    try {
      const auditStatus = await protocolService.getProtocolAuditStatus(protocol_id);
      if (!auditStatus) {
        Errors.NOT_FOUND(reply, meta, 'Protocol');
        return;
      }

      sendSuccess(reply, auditStatus, meta);
    } catch (error) {
      request.log.error(error);
      Errors.INTERNAL_ERROR(reply, meta);
    }
  });
  
  // GET /v1/protocols/:protocol_id/tvl/history
  fastify.get('/:protocol_id/tvl/history', async (request: FastifyRequest, reply: FastifyReply) => {
    const meta = createResponseMeta();
    const { protocol_id } = request.params as { protocol_id: string };
    
    const parseResult = historyQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      Errors.BAD_REQUEST(reply, meta, 'Invalid query parameters');
      return;
    }
    
    const params = parseResult.data;
    const defaultLookbackDays = getDefaultHistoryLookbackDays(90, request.apiKey?.tier);
    const { from, to } = resolveDateRange(params.from, params.to, defaultLookbackDays);

    if (!isDateRangeValid({ from, to })) {
      Errors.BAD_REQUEST(reply, meta, '`from` must be before `to`');
      return;
    }

    if (!isDateWithinHistoryWindow(from, request.apiKey?.tier, to)) {
      Errors.FORBIDDEN(reply, meta, buildHistoryLimitMessage(request.apiKey?.tier));
      return;
    }
    
    try {
      const history = await protocolService.getProtocolTvlHistory(protocol_id, from, to);
      
      if (history.length === 0) {
        // Check if protocol exists
        const protocol = await protocolService.getProtocolById(protocol_id);
        if (!protocol) {
          Errors.NOT_FOUND(reply, meta, 'Protocol');
          return;
        }
      }
      
      sendSuccess(reply, history, meta);
    } catch (error) {
      request.log.error(error);
      Errors.INTERNAL_ERROR(reply, meta);
    }
  });
  
  // GET /v1/protocols/:protocol_id/pools
  fastify.get('/:protocol_id/pools', async (request: FastifyRequest, reply: FastifyReply) => {
    const meta = createResponseMeta();
    const { protocol_id } = request.params as { protocol_id: string };
    
    try {
      const pools = await protocolService.getProtocolPools(protocol_id);
      
      if (pools.length === 0) {
        // Check if protocol exists
        const protocol = await protocolService.getProtocolById(protocol_id);
        if (!protocol) {
          Errors.NOT_FOUND(reply, meta, 'Protocol');
          return;
        }
      }
      
      sendSuccess(reply, pools, meta);
    } catch (error) {
      request.log.error(error);
      Errors.INTERNAL_ERROR(reply, meta);
    }
  });
}
