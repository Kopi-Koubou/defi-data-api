/**
 * DefiLlama ingestion pipeline.
 *
 * Pulls yield pools + token prices, validates records, and persists snapshots.
 */

import { createHash } from 'crypto';
import { and, eq, gte } from 'drizzle-orm';
import { db, pools, protocols, tokenPrices, yields } from '../db/index.js';
import {
  CORE_PROTOCOLS,
  normalizeChain,
  normalizeProtocol,
  type CoreProtocolId,
} from './catalog.js';

const DEFILLAMA_YIELDS_BASE_URL = (process.env.DEFILLAMA_YIELDS_API_URL || 'https://yields.llama.fi').replace(/\/+$/, '');
const DEFILLAMA_COINS_BASE_URL = (process.env.DEFILLAMA_COINS_API_URL || 'https://coins.llama.fi').replace(/\/+$/, '');

const MAX_REASONABLE_APY = 5000;
const MAX_REASONABLE_TVL = 10_000_000_000_000;

interface DefiLlamaPool {
  pool: string;
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apy: number;
  apyBase?: number | null;
  apyReward?: number | null;
  underlyingTokens?: string[];
}

interface DefiLlamaPoolsResponse {
  status?: string;
  data?: DefiLlamaPool[];
}

interface DefiLlamaPoolChartPoint {
  timestamp: number;
  apy?: number;
  apyBase?: number;
  apyReward?: number;
  tvlUsd?: number;
}

interface DefiLlamaPoolChartResponse {
  status?: string;
  data?: DefiLlamaPoolChartPoint[];
}

interface DefiLlamaCoinsResponse {
  coins?: Record<
    string,
    {
      price?: number;
      timestamp?: number;
    }
  >;
}

interface NormalizedPoolSnapshot {
  poolId: string;
  llamaPoolId: string;
  protocolId: CoreProtocolId;
  chainId: string;
  address: string;
  token0Symbol: string;
  token0Address: string;
  token0Decimals: number;
  token1Symbol: string | null;
  token1Address: string | null;
  token1Decimals: number | null;
  poolType: string;
  apyBase: number;
  apyReward: number;
  apyTotal: number;
  tvlUsd: number;
}

interface PriceSnapshot {
  chainId: string;
  address: string;
  priceUsd: number;
  timestamp: Date;
}

export interface IngestionOptions {
  backfillDays?: number;
  maxBackfillPools?: number;
}

export interface IngestionSummary {
  fetchedPools: number;
  processedPools: number;
  skippedPools: number;
  protocolUpserts: number;
  poolUpserts: number;
  yieldInserts: number;
  priceInserts: number;
  backfillInserts: number;
  durationMs: number;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'defi-data-api/0.1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed request ${response.status} ${response.statusText} for ${url}`);
  }

  return response.json() as Promise<T>;
}

function splitSymbolPair(symbol: string): { token0Symbol: string; token1Symbol: string | null } {
  const value = symbol.trim();
  const separators = ['-', '/', '_', ':'];

  for (const separator of separators) {
    if (value.includes(separator)) {
      const [raw0, raw1] = value.split(separator);
      const token0 = (raw0 || '').trim().toUpperCase();
      const token1 = (raw1 || '').trim().toUpperCase();
      return {
        token0Symbol: token0 || 'TOKEN0',
        token1Symbol: token1 || null,
      };
    }
  }

  return {
    token0Symbol: value.toUpperCase() || 'TOKEN0',
    token1Symbol: null,
  };
}

function normalizeAddress(address: string | undefined | null): string | null {
  if (!address) {
    return null;
  }

  const trimmed = address.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('0x')) {
    return trimmed.toLowerCase();
  }

  return trimmed;
}

function syntheticAddress(seed: string): string {
  const hex = createHash('sha1').update(seed).digest('hex').slice(0, 40);
  return `0x${hex}`;
}

function toPoolId(llamaPoolId: string): string {
  const cleaned = llamaPoolId.replace(/[^a-zA-Z0-9:_-]/g, '-');
  const candidate = `llama-${cleaned}`;

  if (candidate.length <= 120) {
    return candidate;
  }

  return `llama-${createHash('sha256').update(llamaPoolId).digest('hex').slice(0, 48)}`;
}

function isValidNumericPool(pool: DefiLlamaPool): boolean {
  if (!Number.isFinite(pool.apy) || pool.apy < -100 || pool.apy > MAX_REASONABLE_APY) {
    return false;
  }

  if (!Number.isFinite(pool.tvlUsd) || pool.tvlUsd < 0 || pool.tvlUsd > MAX_REASONABLE_TVL) {
    return false;
  }

  return true;
}

function normalizePool(pool: DefiLlamaPool): NormalizedPoolSnapshot | null {
  const protocolId = normalizeProtocol(pool.project);
  const chainId = normalizeChain(pool.chain);

  if (!protocolId || !chainId || !isValidNumericPool(pool)) {
    return null;
  }

  const { token0Symbol, token1Symbol } = splitSymbolPair(pool.symbol);
  const token0Address =
    normalizeAddress(pool.underlyingTokens?.[0]) ||
    syntheticAddress(`${chainId}:${protocolId}:${pool.pool}:token0`);
  const token1Address = token1Symbol
    ? normalizeAddress(pool.underlyingTokens?.[1]) ||
      syntheticAddress(`${chainId}:${protocolId}:${pool.pool}:token1`)
    : null;

  const apyBase = Number.isFinite(pool.apyBase) ? Number(pool.apyBase) : 0;
  const apyTotal = Number(pool.apy);
  const apyRewardRaw = Number.isFinite(pool.apyReward)
    ? Number(pool.apyReward)
    : Math.max(0, apyTotal - apyBase);

  return {
    poolId: toPoolId(pool.pool),
    llamaPoolId: pool.pool,
    protocolId,
    chainId,
    address: normalizeAddress(pool.pool) || syntheticAddress(`${chainId}:${pool.pool}:address`),
    token0Symbol,
    token0Address,
    token0Decimals: 18,
    token1Symbol,
    token1Address,
    token1Decimals: token1Symbol ? 18 : null,
    poolType: CORE_PROTOCOLS[protocolId].poolType,
    apyBase,
    apyReward: apyRewardRaw,
    apyTotal,
    tvlUsd: Number(pool.tvlUsd),
  };
}

async function fetchYieldPools(): Promise<DefiLlamaPool[]> {
  const payload = await fetchJson<DefiLlamaPoolsResponse>(`${DEFILLAMA_YIELDS_BASE_URL}/pools`);
  return Array.isArray(payload.data) ? payload.data : [];
}

async function upsertProtocols(snapshotPools: NormalizedPoolSnapshot[]): Promise<number> {
  const protocolChains = new Map<CoreProtocolId, Set<string>>();
  const protocolTvls = new Map<CoreProtocolId, number>();

  for (const pool of snapshotPools) {
    if (!protocolChains.has(pool.protocolId)) {
      protocolChains.set(pool.protocolId, new Set<string>());
      protocolTvls.set(pool.protocolId, 0);
    }

    protocolChains.get(pool.protocolId)?.add(pool.chainId);
    protocolTvls.set(pool.protocolId, (protocolTvls.get(pool.protocolId) || 0) + pool.tvlUsd);
  }

  let upserts = 0;
  const now = new Date();

  for (const [protocolId, chainIds] of protocolChains.entries()) {
    const config = CORE_PROTOCOLS[protocolId];
    const tvlUsd = Number((protocolTvls.get(protocolId) || 0).toFixed(2));

    await db
      .insert(protocols)
      .values({
        id: config.id,
        slug: config.slug,
        name: config.name,
        chainIds: Array.from(chainIds),
        category: config.category,
        url: config.url,
        auditStatus: config.auditStatus,
        tvlUsd,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: protocols.id,
        set: {
          slug: config.slug,
          name: config.name,
          chainIds: Array.from(chainIds),
          category: config.category,
          url: config.url,
          auditStatus: config.auditStatus,
          tvlUsd,
          updatedAt: now,
        },
      });

    upserts += 1;
  }

  return upserts;
}

function toCoinLookupKey(chainId: string, address: string): string {
  return `${chainId}:${address}`;
}

async function fetchCurrentTokenPrices(keys: string[]): Promise<PriceSnapshot[]> {
  if (keys.length === 0) {
    return [];
  }

  const chunkSize = 75;
  const snapshots: PriceSnapshot[] = [];

  for (let i = 0; i < keys.length; i += chunkSize) {
    const chunk = keys.slice(i, i + chunkSize);
    const encodedKeys = chunk.map((key) => encodeURIComponent(key)).join(',');
    const payload = await fetchJson<DefiLlamaCoinsResponse>(
      `${DEFILLAMA_COINS_BASE_URL}/prices/current/${encodedKeys}`
    );

    const coins = payload.coins || {};
    for (const [lookupKey, info] of Object.entries(coins)) {
      if (!info || !Number.isFinite(info.price)) {
        continue;
      }

      const [chainId, ...addressParts] = lookupKey.split(':');
      const address = addressParts.join(':');
      if (!chainId || !address) {
        continue;
      }

      const timestampMs =
        typeof info.timestamp === 'number' && Number.isFinite(info.timestamp)
          ? (info.timestamp > 1_000_000_000_000 ? info.timestamp : info.timestamp * 1000)
          : Date.now();

      snapshots.push({
        chainId,
        address: address.startsWith('0x') ? address.toLowerCase() : address,
        priceUsd: Number(info.price),
        timestamp: new Date(timestampMs),
      });
    }
  }

  return snapshots;
}

async function backfillPoolHistory(pool: NormalizedPoolSnapshot, backfillDays: number): Promise<number> {
  const chart = await fetchJson<DefiLlamaPoolChartResponse>(
    `${DEFILLAMA_YIELDS_BASE_URL}/chart/${encodeURIComponent(pool.llamaPoolId)}`
  );

  const rows = Array.isArray(chart.data) ? chart.data : [];
  if (rows.length === 0) {
    return 0;
  }

  const cutoffDate = new Date(Date.now() - backfillDays * 24 * 60 * 60 * 1000);
  const existingTimestamps = await db
    .select({ timestamp: yields.timestamp })
    .from(yields)
    .where(and(eq(yields.poolId, pool.poolId), gte(yields.timestamp, cutoffDate)));

  const existingSet = new Set(existingTimestamps.map((entry) => entry.timestamp.toISOString()));
  const inserts: typeof yields.$inferInsert[] = [];

  for (const row of rows) {
    if (!Number.isFinite(row.timestamp) || !Number.isFinite(row.apy) || !Number.isFinite(row.tvlUsd)) {
      continue;
    }

    const timestampMs = row.timestamp > 1_000_000_000_000 ? row.timestamp : row.timestamp * 1000;
    const timestamp = new Date(timestampMs);
    if (timestamp < cutoffDate) {
      continue;
    }

    const isoKey = timestamp.toISOString();
    if (existingSet.has(isoKey)) {
      continue;
    }

    const apyBase = Number.isFinite(row.apyBase) ? Number(row.apyBase) : 0;
    const apyTotal = Number(row.apy);
    const apyReward = Number.isFinite(row.apyReward) ? Number(row.apyReward) : Math.max(0, apyTotal - apyBase);

    inserts.push({
      poolId: pool.poolId,
      timestamp,
      apyBase,
      apyReward,
      apyTotal,
      tvlUsd: Number(row.tvlUsd),
    });

    existingSet.add(isoKey);
  }

  if (inserts.length > 0) {
    await db.insert(yields).values(inserts);
  }

  return inserts.length;
}

export async function runDefiLlamaIngestion(options: IngestionOptions = {}): Promise<IngestionSummary> {
  const startedAt = Date.now();
  const summary: IngestionSummary = {
    fetchedPools: 0,
    processedPools: 0,
    skippedPools: 0,
    protocolUpserts: 0,
    poolUpserts: 0,
    yieldInserts: 0,
    priceInserts: 0,
    backfillInserts: 0,
    durationMs: 0,
  };

  const rawPools = await fetchYieldPools();
  summary.fetchedPools = rawPools.length;

  const normalizedPools: NormalizedPoolSnapshot[] = [];
  for (const rawPool of rawPools) {
    const normalized = normalizePool(rawPool);
    if (!normalized) {
      summary.skippedPools += 1;
      continue;
    }

    normalizedPools.push(normalized);
  }

  summary.processedPools = normalizedPools.length;
  summary.protocolUpserts = await upsertProtocols(normalizedPools);

  const now = new Date();
  const priceLookupKeys = new Set<string>();

  for (const pool of normalizedPools) {
    await db
      .insert(pools)
      .values({
        id: pool.poolId,
        protocolId: pool.protocolId,
        chainId: pool.chainId,
        address: pool.address,
        token0Symbol: pool.token0Symbol,
        token0Address: pool.token0Address,
        token0Decimals: pool.token0Decimals,
        token1Symbol: pool.token1Symbol,
        token1Address: pool.token1Address,
        token1Decimals: pool.token1Decimals,
        poolType: pool.poolType,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: pools.id,
        set: {
          protocolId: pool.protocolId,
          chainId: pool.chainId,
          address: pool.address,
          token0Symbol: pool.token0Symbol,
          token0Address: pool.token0Address,
          token0Decimals: pool.token0Decimals,
          token1Symbol: pool.token1Symbol,
          token1Address: pool.token1Address,
          token1Decimals: pool.token1Decimals,
          poolType: pool.poolType,
          updatedAt: now,
        },
      });

    summary.poolUpserts += 1;

    await db.insert(yields).values({
      poolId: pool.poolId,
      timestamp: now,
      apyBase: pool.apyBase,
      apyReward: pool.apyReward,
      apyTotal: pool.apyTotal,
      tvlUsd: pool.tvlUsd,
    });

    summary.yieldInserts += 1;

    priceLookupKeys.add(toCoinLookupKey(pool.chainId, pool.token0Address));
    if (pool.token1Address) {
      priceLookupKeys.add(toCoinLookupKey(pool.chainId, pool.token1Address));
    }
  }

  const prices = await fetchCurrentTokenPrices(Array.from(priceLookupKeys));
  if (prices.length > 0) {
    await db.insert(tokenPrices).values(
      prices.map((price) => ({
        tokenAddress: price.address,
        chainId: price.chainId,
        timestamp: price.timestamp,
        priceUsd: price.priceUsd,
        source: 'defillama',
      }))
    );
    summary.priceInserts = prices.length;
  }

  const backfillDays = Math.max(0, options.backfillDays || 0);
  if (backfillDays > 0 && normalizedPools.length > 0) {
    const poolLimit = Math.max(1, options.maxBackfillPools || 25);
    const poolsToBackfill = normalizedPools.slice(0, Math.min(poolLimit, normalizedPools.length));

    for (const pool of poolsToBackfill) {
      try {
        summary.backfillInserts += await backfillPoolHistory(pool, backfillDays);
      } catch {
        // Non-blocking for a single pool backfill failure.
      }
    }
  }

  summary.durationMs = Date.now() - startedAt;
  return summary;
}
