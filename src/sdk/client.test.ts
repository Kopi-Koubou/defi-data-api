import { describe, expect, it, vi } from 'vitest';

import { DefiDataApiClient } from './client.js';

function buildSuccessResponse(data: unknown): Response {
  return new Response(
    JSON.stringify({
      data,
      meta: {
        requestId: 'req_test',
        latencyMs: 3,
      },
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
      },
    }
  );
}

describe('DefiDataApiClient', () => {
  it('sends api key headers and query params for GET requests', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(buildSuccessResponse([{ poolId: 'pool-1' }]));
    const client = new DefiDataApiClient({
      apiKey: 'builder-key',
      baseUrl: 'https://api.example.com/v1/',
      fetchImpl: fetchMock,
    });

    const response = await client.getYields({
      chain: 'ethereum',
      min_tvl: 100000,
      limit: 25,
    });

    expect(response.data).toEqual([{ poolId: 'pool-1' }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.com/v1/yields?chain=ethereum&min_tvl=100000&limit=25');
    expect(init.method).toBe('GET');
    expect(new Headers(init.headers).get('x-api-key')).toBe('builder-key');
  });

  it('sends json payloads for POST requests', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(buildSuccessResponse({ ok: true }));
    const client = new DefiDataApiClient({
      apiKey: 'builder-key',
      baseUrl: 'https://api.example.com/v1',
      fetchImpl: fetchMock,
    });

    await client.simulateImpermanentLoss({
      token0: 'ETH',
      token1: 'USDC',
      entry_price_ratio: 2000,
      price_changes: [-0.2, 0.2],
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
    expect(init.body).toBe(
      JSON.stringify({
        token0: 'ETH',
        token1: 'USDC',
        entry_price_ratio: 2000,
        price_changes: [-0.2, 0.2],
      })
    );
  });

  it('throws typed api errors for non-2xx responses', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'FORBIDDEN',
            message: 'Access denied',
          },
        }),
        {
          status: 403,
          headers: { 'content-type': 'application/json' },
        }
      )
    );

    const client = new DefiDataApiClient({
      apiKey: 'free-key',
      baseUrl: 'https://api.example.com/v1',
      fetchImpl: fetchMock,
    });

    await expect(client.getRiskAdjustedYields()).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
      message: 'Access denied',
    });
  });

  it('validates required constructor options', () => {
    expect(
      () =>
        new DefiDataApiClient({
          apiKey: '   ',
          fetchImpl: vi.fn<typeof fetch>(),
        })
    ).toThrow('apiKey is required');
  });
});
