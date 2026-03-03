/**
 * DeFi Data API Server
 * 
 * Fastify-based REST API for DeFi yield, TVL, and risk data
 */

import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

// Import routes
import healthRoutes from './routes/health.js';
import yieldRoutes from './routes/yields.js';
import protocolRoutes from './routes/protocols.js';
import toolsRoutes from './routes/tools.js';
import tokenRoutes from './routes/tokens.js';
import chainRoutes from './routes/chains.js';

// Import middleware
import { authenticateRequest, trackUsage } from './middleware/auth.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';

async function buildServer() {
  const fastify = Fastify({
    logger: {
      level: NODE_ENV === 'production' ? 'info' : 'debug',
      transport: NODE_ENV === 'development' ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      } : undefined,
    },
    requestTimeout: 30000,
  });

  // Register security plugins
  await fastify.register(helmet, {
    contentSecurityPolicy: false, // Disable for Swagger UI
  });
  
  await fastify.register(cors, {
    origin: true, // Configure based on your needs
    credentials: true,
  });

  // Register rate limiting
  await fastify.register(rateLimit, {
    global: false,
    skipOnError: true,
  });

  // Register Swagger/OpenAPI documentation
  await fastify.register(swagger, {
    openapi: {
      info: {
        title: 'DeFi Data API',
        description: 'Real-time yields, TVL, and risk metrics for DeFi protocols',
        version: '1.0.0',
        contact: {
          name: 'API Support',
          email: 'support@defidata.io',
        },
      },
      servers: [
        {
          url: 'http://localhost:3000',
          description: 'Local development',
        },
      ],
      components: {
        securitySchemes: {
          apiKey: {
            type: 'apiKey',
            name: 'x-api-key',
            in: 'header',
            description: 'API key for authentication',
          },
        },
      },
      security: [{ apiKey: [] }],
      tags: [
        { name: 'Yields', description: 'Yield and APY data endpoints' },
        { name: 'Protocols', description: 'Protocol and TVL endpoints' },
        { name: 'Tools', description: 'Calculator and utility endpoints' },
        { name: 'Tokens', description: 'Token price and metadata endpoints' },
        { name: 'Chains', description: 'Chain-level data endpoints' },
        { name: 'Health', description: 'Health check endpoints' },
      ],
    },
  });

  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  });

  // Add request timing hook
  fastify.addHook('onRequest', async (request) => {
    (request as unknown as { _startTime: number })._startTime = Date.now();
  });

  // Register public routes (no auth required)
  await fastify.register(healthRoutes);

  // Register authenticated routes with /v1 prefix
  await fastify.register(
    async (instance) => {
      // Add authentication hook
      instance.addHook('onRequest', authenticateRequest);
      instance.addHook(
        'preHandler',
        instance.rateLimit({
          max: (request) => request.apiKey?.rateLimit ?? 10,
          timeWindow: '1 minute',
          keyGenerator: (request) => request.apiKey?.id || request.ip,
          errorResponseBuilder: (request) => ({
            error: {
              code: 'RATE_LIMITED',
              message: 'Rate limit exceeded',
            },
            meta: {
              requestId: request.id,
              latencyMs: 0,
            },
          }),
        })
      );
      instance.addHook('onSend', async (request, reply) => {
        await trackUsage(request, reply);
      });

      // Register v1 routes
      await instance.register(yieldRoutes, { prefix: '/yields' });
      await instance.register(protocolRoutes, { prefix: '/protocols' });
      await instance.register(toolsRoutes, { prefix: '/tools' });
      await instance.register(tokenRoutes, { prefix: '/tokens' });
      await instance.register(chainRoutes, { prefix: '/chains' });
    },
    { prefix: '/v1' }
  );

  // Root route redirect to docs
  fastify.get('/', async (_, reply) => {
    return reply.redirect('/docs');
  });

  // 404 handler
  fastify.setNotFoundHandler((request, reply) => {
    void reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found`,
      },
      meta: {
        requestId: request.id,
        latencyMs: 0,
      },
    });
  });

  // Error handler
  fastify.setErrorHandler((error: Error & { statusCode?: number; code?: string }, request, reply) => {
    fastify.log.error(error);
    
    void reply.status(error.statusCode || 500).send({
      error: {
        code: error.code || 'INTERNAL_ERROR',
        message: NODE_ENV === 'production' 
          ? 'Internal server error' 
          : error.message,
      },
      meta: {
        requestId: request.id,
        latencyMs: 0,
      },
    });
  });

  return fastify;
}

async function start() {
  try {
    const fastify = await buildServer();
    
    await fastify.listen({ 
      port: PORT, 
      host: '0.0.0.0',
    });
    
    fastify.log.info(`Server running on http://localhost:${PORT}`);
    fastify.log.info(`API Documentation: http://localhost:${PORT}/docs`);
  } catch (error) {
    console.error('Error starting server:', error);
    process.exit(1);
  }
}

// Start server if not in test mode
if (process.env.NODE_ENV !== 'test') {
  void start();
}

export { buildServer };
