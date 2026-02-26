/**
 * Standard API response utilities
 */

import { randomUUID } from 'crypto';
import type { FastifyReply } from 'fastify';
import type { ApiResponse, PaginationInfo } from '../types/index.js';

interface ResponseMeta {
  requestId: string;
  startTime: number;
}

export function createResponseMeta(): ResponseMeta {
  return {
    requestId: randomUUID(),
    startTime: Date.now(),
  };
}

export function buildResponse<T>(
  data: T,
  meta: ResponseMeta,
  pagination?: PaginationInfo
): ApiResponse<T> {
  return {
    data,
    meta: {
      requestId: meta.requestId,
      latencyMs: Date.now() - meta.startTime,
    },
    ...(pagination && { pagination }),
  };
}

export function sendSuccess<T>(
  reply: FastifyReply,
  data: T,
  meta: ResponseMeta,
  statusCode: number = 200,
  pagination?: PaginationInfo
): void {
  void reply.status(statusCode).send(buildResponse(data, meta, pagination));
}

export function sendError(
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
  meta: ResponseMeta,
  details?: Record<string, unknown>
): void {
  void reply.status(statusCode).send({
    error: {
      code,
      message,
      ...(details && { details }),
    },
    meta: {
      requestId: meta.requestId,
      latencyMs: Date.now() - meta.startTime,
    },
  });
}

// Common error responses
export const Errors = {
  BAD_REQUEST: (reply: FastifyReply, meta: ResponseMeta, message = 'Bad request') =>
    sendError(reply, 400, 'BAD_REQUEST', message, meta),
  
  UNAUTHORIZED: (reply: FastifyReply, meta: ResponseMeta, message = 'Unauthorized') =>
    sendError(reply, 401, 'UNAUTHORIZED', message, meta),
  
  FORBIDDEN: (reply: FastifyReply, meta: ResponseMeta, message = 'Forbidden') =>
    sendError(reply, 403, 'FORBIDDEN', message, meta),
  
  NOT_FOUND: (reply: FastifyReply, meta: ResponseMeta, resource = 'Resource') =>
    sendError(reply, 404, 'NOT_FOUND', `${resource} not found`, meta),
  
  RATE_LIMITED: (reply: FastifyReply, meta: ResponseMeta, message = 'Rate limit exceeded') =>
    sendError(reply, 429, 'RATE_LIMITED', message, meta),
  
  INTERNAL_ERROR: (reply: FastifyReply, meta: ResponseMeta, message = 'Internal server error') =>
    sendError(reply, 500, 'INTERNAL_ERROR', message, meta),
};
