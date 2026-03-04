/**
 * Webhook endpoints
 * POST /v1/webhooks
 * GET /v1/webhooks
 * DELETE /v1/webhooks/:webhook_id
 */

import { randomUUID } from 'crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, desc, eq, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import { db, webhookSubscriptions } from '../db/index.js';
import { createResponseMeta, Errors, sendSuccess } from '../utils/response.js';
import { getWebhookLimit } from '../utils/tier.js';

const WEBHOOK_TIERS = new Set(['builder', 'pro', 'enterprise']);

const createWebhookSchema = z.object({
  event_type: z.enum(['yield_alert', 'tvl_alert', 'new_pool_alert']),
  config: z.record(z.string(), z.unknown()).default({}),
  url: z.string().url().max(2048),
});

const listWebhookQuerySchema = z.object({
  active: z.coerce.boolean().optional(),
  limit: z.coerce.number().min(1).max(200).optional().default(50),
});

const webhookParamsSchema = z.object({
  webhook_id: z.string().min(1).max(64),
});

function ensurePaidTierAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  meta: ReturnType<typeof createResponseMeta>
): boolean {
  const tier = request.apiKey?.tier ?? 'free';
  if (!WEBHOOK_TIERS.has(tier)) {
    Errors.FORBIDDEN(reply, meta, 'Webhooks are available on paid tiers only');
    return false;
  }

  return true;
}

export default async function webhookRoutes(fastify: FastifyInstance) {
  // POST /v1/webhooks
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const meta = createResponseMeta();
    if (!ensurePaidTierAccess(request, reply, meta)) {
      return;
    }

    const parseResult = createWebhookSchema.safeParse(request.body);
    if (!parseResult.success) {
      Errors.BAD_REQUEST(reply, meta, 'Invalid request body');
      return;
    }

    const { event_type, config, url } = parseResult.data;
    const now = new Date();
    const webhookId = `wh_${randomUUID().replace(/-/g, '').slice(0, 32)}`;
    const webhookLimit = getWebhookLimit(request.apiKey?.tier);

    try {
      if (webhookLimit !== null) {
        const activeWebhooks = await db.query.webhookSubscriptions.findMany({
          where: and(
            eq(webhookSubscriptions.userId, request.apiKey!.userId),
            eq(webhookSubscriptions.active, true)
          ),
          columns: { id: true },
          limit: webhookLimit,
        });

        if (activeWebhooks.length >= webhookLimit) {
          Errors.FORBIDDEN(
            reply,
            meta,
            `${request.apiKey!.tier} tier supports up to ${webhookLimit} active webhooks`
          );
          return;
        }
      }

      await db.insert(webhookSubscriptions).values({
        id: webhookId,
        userId: request.apiKey!.userId,
        apiKeyId: request.apiKey!.id,
        eventType: event_type,
        config,
        url,
        active: true,
        createdAt: now,
      });

      sendSuccess(
        reply,
        {
          id: webhookId,
          eventType: event_type,
          config,
          url,
          active: true,
          createdAt: now,
          lastTriggeredAt: null,
        },
        meta,
        201
      );
    } catch (error) {
      request.log.error(error);
      Errors.INTERNAL_ERROR(reply, meta);
    }
  });

  // GET /v1/webhooks
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const meta = createResponseMeta();
    if (!ensurePaidTierAccess(request, reply, meta)) {
      return;
    }

    const parseResult = listWebhookQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      Errors.BAD_REQUEST(reply, meta, 'Invalid query parameters');
      return;
    }

    const { active, limit } = parseResult.data;
    const conditions: SQL<unknown>[] = [eq(webhookSubscriptions.apiKeyId, request.apiKey!.id)];
    if (typeof active === 'boolean') {
      conditions.push(eq(webhookSubscriptions.active, active));
    }

    try {
      const rows = await db.query.webhookSubscriptions.findMany({
        where: and(...conditions),
        orderBy: desc(webhookSubscriptions.createdAt),
        limit,
      });

      sendSuccess(
        reply,
        rows.map((row) => ({
          id: row.id,
          eventType: row.eventType,
          config: row.config,
          url: row.url,
          active: row.active,
          createdAt: row.createdAt,
          lastTriggeredAt: row.lastTriggeredAt,
        })),
        meta
      );
    } catch (error) {
      request.log.error(error);
      Errors.INTERNAL_ERROR(reply, meta);
    }
  });

  // DELETE /v1/webhooks/:webhook_id
  fastify.delete('/:webhook_id', async (request: FastifyRequest, reply: FastifyReply) => {
    const meta = createResponseMeta();
    if (!ensurePaidTierAccess(request, reply, meta)) {
      return;
    }

    const parseResult = webhookParamsSchema.safeParse(request.params);
    if (!parseResult.success) {
      Errors.BAD_REQUEST(reply, meta, 'Invalid webhook id');
      return;
    }

    const { webhook_id } = parseResult.data;

    try {
      const webhook = await db.query.webhookSubscriptions.findFirst({
        where: and(
          eq(webhookSubscriptions.id, webhook_id),
          eq(webhookSubscriptions.apiKeyId, request.apiKey!.id)
        ),
      });

      if (!webhook) {
        Errors.NOT_FOUND(reply, meta, 'Webhook');
        return;
      }

      if (webhook.active) {
        await db
          .update(webhookSubscriptions)
          .set({ active: false })
          .where(eq(webhookSubscriptions.id, webhook_id));
      }

      sendSuccess(reply, { id: webhook_id, deleted: true }, meta);
    } catch (error) {
      request.log.error(error);
      Errors.INTERNAL_ERROR(reply, meta);
    }
  });
}
