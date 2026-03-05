import type {
  ApiErrorEnvelope,
  ApiResponse,
  ChainTvlParams,
  CreateWebhookPayload,
  DefiDataApiClientOptions,
  ImpermanentLossParams,
  ImpermanentLossSimulationParams,
  ListWebhooksParams,
  ProtocolTvlHistoryParams,
  RiskAdjustedYieldParams,
  TokenLookupParams,
  TokenPriceHistoryParams,
  TokenSearchParams,
  YieldHistoryParams,
  YieldListParams,
} from './types.js';

export class DefiDataApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'DefiDataApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (!trimmed) {
    throw new Error('baseUrl must be a non-empty string');
  }

  return trimmed;
}

function buildQueryString(params: unknown): string {
  if (!params || typeof params !== 'object') {
    return '';
  }

  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (value === undefined || value === null) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item === undefined || item === null) {
          continue;
        }
        searchParams.append(key, String(item));
      }
      continue;
    }

    searchParams.set(key, String(value));
  }

  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

function isApiErrorEnvelope(payload: unknown): payload is ApiErrorEnvelope {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const envelope = payload as Partial<ApiErrorEnvelope>;
  if (!envelope.error || typeof envelope.error !== 'object') {
    return false;
  }

  const code = (envelope.error as { code?: unknown }).code;
  const message = (envelope.error as { message?: unknown }).message;

  return typeof code === 'string' && typeof message === 'string';
}

function parseJsonPayload(payload: string): unknown {
  if (!payload.trim()) {
    return null;
  }

  try {
    return JSON.parse(payload) as unknown;
  } catch (error) {
    throw new DefiDataApiError(500, 'INVALID_JSON', `Failed to parse JSON response: ${String(error)}`);
  }
}

export class DefiDataApiClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: DefiDataApiClientOptions) {
    if (!options.apiKey || !options.apiKey.trim()) {
      throw new Error('apiKey is required');
    }

    this.apiKey = options.apiKey.trim();
    this.baseUrl = normalizeBaseUrl(options.baseUrl || 'http://localhost:3000/v1');

    const fetchImpl = options.fetchImpl || globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
      throw new Error('fetch implementation is required');
    }

    this.fetchImpl = fetchImpl;
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    query?: unknown,
    body?: unknown
  ): Promise<ApiResponse<T>> {
    const queryString = buildQueryString(query);
    const url = `${this.baseUrl}${path}${queryString}`;

    const headers = new Headers();
    headers.set('x-api-key', this.apiKey);
    headers.set('accept', 'application/json');

    let encodedBody: string | undefined;
    if (body !== undefined) {
      headers.set('content-type', 'application/json');
      encodedBody = JSON.stringify(body);
    }

    const response = await this.fetchImpl(url, {
      method,
      headers,
      body: encodedBody,
    });

    const text = await response.text();
    const payload = parseJsonPayload(text);

    if (!response.ok) {
      if (isApiErrorEnvelope(payload)) {
        throw new DefiDataApiError(
          response.status,
          payload.error.code,
          payload.error.message,
          payload.error.details
        );
      }

      throw new DefiDataApiError(
        response.status,
        'HTTP_ERROR',
        `Request failed with status ${response.status}`
      );
    }

    return payload as ApiResponse<T>;
  }

  getYields<T = unknown>(params?: YieldListParams): Promise<ApiResponse<T>> {
    return this.request<T>('GET', '/yields', params);
  }

  getTopYields<T = unknown>(params?: Omit<YieldListParams, 'sort_by' | 'limit'>): Promise<ApiResponse<T>> {
    return this.request<T>('GET', '/yields/top', params);
  }

  getRiskAdjustedYields<T = unknown>(params?: RiskAdjustedYieldParams): Promise<ApiResponse<T>> {
    return this.request<T>('GET', '/yields/risk-adjusted', params);
  }

  getYieldByPoolId<T = unknown>(poolId: string): Promise<ApiResponse<T>> {
    return this.request<T>('GET', `/yields/${encodeURIComponent(poolId)}`);
  }

  getYieldHistory<T = unknown>(
    poolId: string,
    params?: YieldHistoryParams
  ): Promise<ApiResponse<T>> {
    return this.request<T>('GET', `/yields/${encodeURIComponent(poolId)}/history`, params);
  }

  getProtocols<T = unknown>(): Promise<ApiResponse<T>> {
    return this.request<T>('GET', '/protocols');
  }

  getProtocolById<T = unknown>(protocolId: string): Promise<ApiResponse<T>> {
    return this.request<T>('GET', `/protocols/${encodeURIComponent(protocolId)}`);
  }

  getProtocolAuditStatus<T = unknown>(protocolId: string): Promise<ApiResponse<T>> {
    return this.request<T>('GET', `/protocols/${encodeURIComponent(protocolId)}/audit-status`);
  }

  getProtocolTvlHistory<T = unknown>(
    protocolId: string,
    params?: ProtocolTvlHistoryParams
  ): Promise<ApiResponse<T>> {
    return this.request<T>(
      'GET',
      `/protocols/${encodeURIComponent(protocolId)}/tvl/history`,
      params
    );
  }

  getProtocolPools<T = unknown>(protocolId: string): Promise<ApiResponse<T>> {
    return this.request<T>('GET', `/protocols/${encodeURIComponent(protocolId)}/pools`);
  }

  getToken<T = unknown>(
    address: string,
    params?: TokenLookupParams
  ): Promise<ApiResponse<T>> {
    return this.request<T>('GET', `/tokens/${encodeURIComponent(address)}`, params);
  }

  getTokenPriceHistory<T = unknown>(
    address: string,
    params?: TokenPriceHistoryParams
  ): Promise<ApiResponse<T>> {
    return this.request<T>('GET', `/tokens/${encodeURIComponent(address)}/price/history`, params);
  }

  searchTokens<T = unknown>(params: TokenSearchParams): Promise<ApiResponse<T>> {
    return this.request<T>('GET', '/tokens/search', params);
  }

  getChainTvl<T = unknown>(
    chainId: string,
    params?: ChainTvlParams
  ): Promise<ApiResponse<T>> {
    return this.request<T>('GET', `/chains/${encodeURIComponent(chainId)}/tvl`, params);
  }

  getPoolRiskScore<T = unknown>(poolId: string): Promise<ApiResponse<T>> {
    return this.request<T>('GET', `/pools/${encodeURIComponent(poolId)}/risk-score`);
  }

  getPoolIlHistory<T = unknown>(
    poolId: string,
    params?: YieldHistoryParams
  ): Promise<ApiResponse<T>> {
    return this.request<T>('GET', `/pools/${encodeURIComponent(poolId)}/il/history`, params);
  }

  createWebhook<T = unknown>(payload: CreateWebhookPayload): Promise<ApiResponse<T>> {
    return this.request<T>('POST', '/webhooks', undefined, payload);
  }

  listWebhooks<T = unknown>(params?: ListWebhooksParams): Promise<ApiResponse<T>> {
    return this.request<T>('GET', '/webhooks', params);
  }

  deleteWebhook<T = unknown>(webhookId: string): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', `/webhooks/${encodeURIComponent(webhookId)}`);
  }

  calculateImpermanentLoss<T = unknown>(params: ImpermanentLossParams): Promise<ApiResponse<T>> {
    return this.request<T>('GET', '/tools/impermanent-loss', params);
  }

  simulateImpermanentLoss<T = unknown>(
    params: ImpermanentLossSimulationParams
  ): Promise<ApiResponse<T>> {
    return this.request<T>('POST', '/tools/impermanent-loss/simulate', undefined, params);
  }
}
