/**
 * Health check endpoint
 * GET /health
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db/index.js';
import { sql } from 'drizzle-orm';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  services: {
    database: 'connected' | 'error';
    cache: 'connected' | 'error' | 'skipped';
  };
  uptime: number;
}

export default async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    const status: HealthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '0.1.0',
      services: {
        database: 'error',
        cache: 'skipped', // Redis not configured for MVP
      },
      uptime: process.uptime(),
    };
    
    // Check database connection
    try {
      await db.execute(sql`SELECT 1`);
      status.services.database = 'connected';
    } catch (error) {
      status.services.database = 'error';
      status.status = 'unhealthy';
      request.log.error({ error }, 'Database health check failed');
    }
    
    const statusCode = status.status === 'healthy' ? 200 : 503;
    void reply.status(statusCode).send(status);
  });
}
