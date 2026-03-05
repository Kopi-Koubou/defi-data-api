import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import protocolRoutes from './protocols.js';
import * as protocolService from '../services/protocols.js';

vi.mock('../services/protocols.js', () => ({
  getAllProtocols: vi.fn(),
  getProtocolById: vi.fn(),
  getProtocolAuditStatus: vi.fn(),
  getProtocolTvlHistory: vi.fn(),
  getProtocolPools: vi.fn(),
}));

const mockProtocol = {
  id: 'aave-v3',
  slug: 'aave-v3',
  name: 'Aave V3',
  chainIds: ['ethereum'],
  category: 'lending',
  url: 'https://aave.com',
  auditStatus: 'audited' as const,
  tvlUsd: 123456,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  poolCount: 10,
  totalTvlUsd: 123456,
};

describe('protocol routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();

    app = Fastify({ logger: false });
    app.addHook('onRequest', async (request) => {
      const tierHeader = request.headers['x-test-tier'];
      const tier = typeof tierHeader === 'string' ? tierHeader : 'builder';
      request.apiKey = {
        id: 'test-key',
        userId: 'user-1',
        tier,
        rateLimit: 1000,
        requestQuota: 50000,
      };
    });

    await app.register(protocolRoutes, { prefix: '/protocols' });
  });

  afterEach(async () => {
    await app.close();
  });

  it('passes free-tier allowed chains to list endpoint service calls', async () => {
    vi.mocked(protocolService.getAllProtocols).mockResolvedValue([]);

    const response = await app.inject({
      method: 'GET',
      url: '/protocols',
      headers: {
        'x-test-tier': 'free',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(protocolService.getAllProtocols).toHaveBeenCalledWith([
      'ethereum',
      'arbitrum',
      'base',
    ]);
  });

  it('returns forbidden for free tier when protocol exists but is outside chain entitlement', async () => {
    vi.mocked(protocolService.getProtocolById)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(mockProtocol);

    const response = await app.inject({
      method: 'GET',
      url: '/protocols/aave-v3',
      headers: {
        'x-test-tier': 'free',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('FORBIDDEN');
    expect(protocolService.getProtocolById).toHaveBeenNthCalledWith(1, 'aave-v3', [
      'ethereum',
      'arbitrum',
      'base',
    ]);
    expect(protocolService.getProtocolById).toHaveBeenNthCalledWith(2, 'aave-v3');
  });

  it('returns not found when protocol does not exist', async () => {
    vi.mocked(protocolService.getProtocolById).mockResolvedValue(null);

    const response = await app.inject({
      method: 'GET',
      url: '/protocols/non-existent',
      headers: {
        'x-test-tier': 'free',
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('NOT_FOUND');
  });

  it('returns forbidden for scoped TVL history when protocol is outside free-tier chains', async () => {
    vi.mocked(protocolService.getProtocolTvlHistory).mockResolvedValue([]);
    vi.mocked(protocolService.getProtocolById)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(mockProtocol);

    const response = await app.inject({
      method: 'GET',
      url: '/protocols/aave-v3/tvl/history',
      headers: {
        'x-test-tier': 'free',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('FORBIDDEN');
    expect(protocolService.getProtocolTvlHistory).toHaveBeenCalledWith(
      'aave-v3',
      expect.any(Date),
      expect.any(Date),
      ['ethereum', 'arbitrum', 'base']
    );
  });

  it('normalizes protocol id path params before service calls', async () => {
    vi.mocked(protocolService.getProtocolById).mockResolvedValue(mockProtocol);

    const response = await app.inject({
      method: 'GET',
      url: '/protocols/AAVE-V3',
    });

    expect(response.statusCode).toBe(200);
    expect(protocolService.getProtocolById).toHaveBeenCalledWith('aave-v3', null);
  });
});
