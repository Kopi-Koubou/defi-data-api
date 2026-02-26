/**
 * API Key authentication middleware
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { createHash } from 'crypto';
import { db, apiKeys, usageLogs } from '../db/index.js';
import { eq, and, sql } from 'drizzle-orm';
import { createResponseMeta, Errors } from '../utils/response.js';

// Extend FastifyRequest to include apiKey info
declare module 'fastify' {
  interface FastifyRequest {
    apiKey?: {
      id: string;
      tier: string;
      rateLimit: number;
      requestQuota: number;
    };
  }
}

const SALT = process.env.API_KEY_SALT || 'default-salt-change-in-production';

function hashApiKey(key: string): string {
  return createHash('sha256').update(key + SALT).digest('hex');
}

export async function authenticateRequest(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const meta = createResponseMeta();
  
  // Get API key from header
  const apiKeyHeader = request.headers['x-api-key'] as string | undefined;
  
  if (!apiKeyHeader) {
    Errors.UNAUTHORIZED(reply, meta, 'API key required. Provide x-api-key header.');
    return;
  }
  
  const keyHash = hashApiKey(apiKeyHeader);
  
  // Lookup API key in database
  const keyRecord = await db.query.apiKeys.findFirst({
    where: and(
      eq(apiKeys.keyHash, keyHash),
      eq(apiKeys.active, true)
    ),
  });
  
  if (!keyRecord) {
    Errors.UNAUTHORIZED(reply, meta, 'Invalid API key');
    return;
  }
  
  // Check daily quota reset
  const now = new Date();
  const resetAt = new Date(keyRecord.resetAt);
  const isNewDay = now.getUTCDate() !== resetAt.getUTCDate() ||
    now.getUTCMonth() !== resetAt.getUTCMonth() ||
    now.getUTCFullYear() !== resetAt.getUTCFullYear();
  
  if (isNewDay) {
    // Reset quota
    await db.update(apiKeys)
      .set({ 
        requestsUsed: 0,
        resetAt: now 
      })
      .where(eq(apiKeys.id, keyRecord.id));
  } else if (keyRecord.requestsUsed >= keyRecord.requestQuota) {
    Errors.FORBIDDEN(reply, meta, 'Daily request quota exceeded');
    return;
  }
  
  // Attach API key info to request
  request.apiKey = {
    id: keyRecord.id,
    tier: keyRecord.tier,
    rateLimit: keyRecord.rateLimit,
    requestQuota: keyRecord.requestQuota,
  };
}

export async function trackUsage(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.apiKey) return;
  
  // Increment usage counter
  await db.update(apiKeys)
    .set({ 
      requestsUsed: sql`${apiKeys.requestsUsed} + 1`,
      lastUsedAt: new Date()
    })
    .where(eq(apiKeys.id, request.apiKey.id));
  
  // Log usage (async, don't await)
  const startTime = (request as unknown as { _startTime?: number })._startTime;
  void db.insert(usageLogs).values({
    apiKeyId: request.apiKey.id,
    endpoint: (request as unknown as { routeOptions?: { url?: string } }).routeOptions?.url || request.url,
    method: request.method,
    statusCode: reply.statusCode,
    responseMs: startTime ? Date.now() - startTime : 0,
  }).catch(() => {
    // Silently fail logging errors
  });
}
