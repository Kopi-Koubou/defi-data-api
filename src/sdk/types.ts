export interface ApiPagination {
  cursor: string | null;
  hasMore: boolean;
  total?: number;
}

export interface ApiMeta {
  requestId: string;
  latencyMs: number;
}

export interface ApiResponse<T> {
  data: T;
  meta: ApiMeta;
  pagination?: ApiPagination;
}

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta?: ApiMeta;
}

export type PrimitiveQueryValue = string | number | boolean;

export type QueryParams = Record<
  string,
  PrimitiveQueryValue | PrimitiveQueryValue[] | null | undefined
>;

export interface DefiDataApiClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface YieldListParams {
  chain?: string;
  protocol?: string;
  asset?: string;
  asset_pair?: string;
  min_tvl?: number;
  pool_type?: 'lending' | 'lp' | 'staking' | 'vault' | 'restaking';
  sort_by?: 'apy' | 'tvl';
  limit?: number;
  cursor?: string;
}

export interface YieldHistoryParams {
  from?: string;
  to?: string;
  interval?: '1h' | '1d' | '1w';
}

export interface RiskAdjustedYieldParams {
  chain?: string;
  protocol?: string;
  asset?: string;
  asset_pair?: string;
  min_tvl?: number;
  pool_type?: 'lending' | 'lp' | 'staking' | 'vault' | 'restaking';
  min_score?: number;
  sort_by?: 'sharpe' | 'apy' | 'score';
  limit?: number;
}

export interface ProtocolTvlHistoryParams {
  from?: string;
  to?: string;
}

export interface TokenLookupParams {
  chain?: string;
}

export interface TokenPriceHistoryParams {
  chain?: string;
  from?: string;
  to?: string;
}

export interface TokenSearchParams {
  q: string;
  chain?: string;
}

export interface ChainTvlParams {
  from?: string;
  to?: string;
}

export type WebhookEventType = 'yield_alert' | 'tvl_alert' | 'new_pool_alert';

export interface CreateWebhookPayload {
  event_type: WebhookEventType;
  config?: Record<string, unknown>;
  url: string;
}

export interface ListWebhooksParams {
  active?: boolean;
  limit?: number;
}

export interface ImpermanentLossParams {
  token0: string;
  token1: string;
  entry_price_ratio: number;
  current_price_ratio: number;
  fee_apr?: number;
  days?: number;
}

export interface ImpermanentLossSimulationParams {
  token0: string;
  token1: string;
  entry_price_ratio: number;
  price_changes: number[];
  fee_apr?: number;
  days?: number;
}
