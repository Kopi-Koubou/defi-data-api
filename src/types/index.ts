/**
 * Core types for DeFi Data API
 */

export interface Pool {
  id: string;
  protocolId: string;
  chainId: string;
  address: string;
  token0: TokenInfo;
  token1: TokenInfo | null;
  poolType: PoolType;
  createdAt: Date;
}

export interface TokenInfo {
  symbol: string;
  address: string;
  decimals: number;
  name?: string;
  logoUrl?: string;
}

export type PoolType = 'lending' | 'lp' | 'staking' | 'vault' | 'restaking';

export interface Protocol {
  id: string;
  slug: string;
  name: string;
  chainIds: string[];
  category: string;
  url: string;
  auditStatus: AuditStatus;
  tvlUsd: number;
  createdAt: Date;
}

export type AuditStatus = 'audited' | 'partial' | 'unaudited' | 'unknown';

export interface YieldData {
  poolId: string;
  timestamp: Date;
  apyBase: number;
  apyReward: number;
  apyTotal: number;
  tvlUsd: number;
}

export interface TokenPrice {
  tokenAddress: string;
  chainId: string;
  timestamp: Date;
  priceUsd: number;
  source: string;
}

export interface RiskScore {
  poolId: string;
  timestamp: Date;
  score: number;
  factors: RiskFactors;
}

export interface RiskFactors {
  smartContractRisk: number;
  impermanentLossRisk: number;
  liquidityDepth: number;
  protocolMaturity: number;
}

export interface ApiKey {
  id: string;
  userId: string;
  keyHash: string;
  tier: ApiTier;
  rateLimit: number;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export type ApiTier = 'free' | 'builder' | 'pro' | 'enterprise';

export interface ApiResponse<T> {
  data: T;
  meta: {
    requestId: string;
    latencyMs: number;
  };
  pagination?: PaginationInfo;
}

export interface PaginationInfo {
  cursor: string | null;
  hasMore: boolean;
  total?: number;
}

export interface YieldFilters {
  chain?: string;
  protocol?: string;
  minTvl?: number;
  poolType?: PoolType;
  sortBy?: 'apy' | 'tvl';
  limit?: number;
  cursor?: string;
}

export interface ImpermanentLossInput {
  token0: string;
  token1: string;
  entryPriceRatio: number;
  currentPriceRatio: number;
}

export interface ImpermanentLossResult {
  token0: string;
  token1: string;
  entryPriceRatio: number;
  currentPriceRatio: number;
  ilPercentage: number;
  ilVsHoldPercentage: number;
}
