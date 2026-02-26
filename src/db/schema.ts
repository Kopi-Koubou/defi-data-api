/**
 * Database schema using Drizzle ORM
 * Matches the PRD specification
 */

import {
  pgTable,
  text,
  timestamp,
  integer,
  real,
  boolean,
  jsonb,
  index,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

// Core tables
export const protocols = pgTable(
  'protocols',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    slug: varchar('slug', { length: 64 }).notNull(),
    name: varchar('name', { length: 128 }).notNull(),
    chainIds: text('chain_ids').array().notNull().default([]),
    category: varchar('category', { length: 32 }).notNull(),
    url: text('url').notNull(),
    auditStatus: varchar('audit_status', { length: 16 }).notNull().default('unknown'),
    tvlUsd: real('tvl_usd').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    slugIdx: uniqueIndex('protocols_slug_idx').on(table.slug),
    categoryIdx: index('protocols_category_idx').on(table.category),
  })
);

export const pools = pgTable(
  'pools',
  {
    id: varchar('id', { length: 128 }).primaryKey(),
    protocolId: varchar('protocol_id', { length: 64 })
      .notNull()
      .references(() => protocols.id),
    chainId: varchar('chain_id', { length: 32 }).notNull(),
    address: varchar('address', { length: 64 }).notNull(),
    token0Symbol: varchar('token0_symbol', { length: 32 }).notNull(),
    token0Address: varchar('token0_address', { length: 64 }).notNull(),
    token0Decimals: integer('token0_decimals').notNull().default(18),
    token1Symbol: varchar('token1_symbol', { length: 32 }),
    token1Address: varchar('token1_address', { length: 64 }),
    token1Decimals: integer('token1_decimals'),
    poolType: varchar('pool_type', { length: 16 }).notNull(), // lending, lp, staking, vault, restaking
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    protocolIdx: index('pools_protocol_idx').on(table.protocolId),
    chainIdx: index('pools_chain_idx').on(table.chainId),
    typeIdx: index('pools_type_idx').on(table.poolType),
    addressIdx: index('pools_address_idx').on(table.address),
  })
);

export const yields = pgTable(
  'yields',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    poolId: varchar('pool_id', { length: 128 })
      .notNull()
      .references(() => pools.id),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
    apyBase: real('apy_base').notNull().default(0),
    apyReward: real('apy_reward').notNull().default(0),
    apyTotal: real('apy_total').notNull().default(0),
    tvlUsd: real('tvl_usd').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    poolIdx: index('yields_pool_idx').on(table.poolId),
    timestampIdx: index('yields_timestamp_idx').on(table.timestamp),
    poolTimestampIdx: index('yields_pool_timestamp_idx').on(table.poolId, table.timestamp),
  })
);

export const tokenPrices = pgTable(
  'token_prices',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    tokenAddress: varchar('token_address', { length: 64 }).notNull(),
    chainId: varchar('chain_id', { length: 32 }).notNull(),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
    priceUsd: real('price_usd').notNull(),
    source: varchar('source', { length: 32 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tokenChainIdx: index('prices_token_chain_idx').on(table.tokenAddress, table.chainId),
    timestampIdx: index('prices_timestamp_idx').on(table.timestamp),
  })
);

export const riskScores = pgTable(
  'risk_scores',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    poolId: varchar('pool_id', { length: 128 })
      .notNull()
      .references(() => pools.id),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
    score: integer('score').notNull(), // 0-100
    factors: jsonb('factors').notNull().$type<{
      smartContractRisk: number;
      impermanentLossRisk: number;
      liquidityDepth: number;
      protocolMaturity: number;
    }>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    poolIdx: index('risk_pool_idx').on(table.poolId),
    timestampIdx: index('risk_timestamp_idx').on(table.timestamp),
  })
);

// API management tables
export const apiKeys = pgTable(
  'api_keys',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    userId: varchar('user_id', { length: 64 }).notNull(),
    keyHash: varchar('key_hash', { length: 128 }).notNull(),
    tier: varchar('tier', { length: 16 }).notNull().default('free'), // free, builder, pro, enterprise
    rateLimit: integer('rate_limit').notNull().default(10), // requests per minute
    requestQuota: integer('request_quota').notNull().default(1000), // daily quota
    requestsUsed: integer('requests_used').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    resetAt: timestamp('reset_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index('api_keys_user_idx').on(table.userId),
    keyHashIdx: uniqueIndex('api_keys_hash_idx').on(table.keyHash),
  })
);

export const usageLogs = pgTable(
  'usage_logs',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    apiKeyId: varchar('api_key_id', { length: 64 })
      .notNull()
      .references(() => apiKeys.id),
    endpoint: varchar('endpoint', { length: 256 }).notNull(),
    method: varchar('method', { length: 8 }).notNull(),
    statusCode: integer('status_code').notNull(),
    responseMs: integer('response_ms').notNull(),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    apiKeyIdx: index('usage_api_key_idx').on(table.apiKeyId),
    timestampIdx: index('usage_timestamp_idx').on(table.timestamp),
    endpointIdx: index('usage_endpoint_idx').on(table.endpoint),
  })
);

export const webhookSubscriptions = pgTable(
  'webhook_subscriptions',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    userId: varchar('user_id', { length: 64 }).notNull(),
    apiKeyId: varchar('api_key_id', { length: 64 })
      .notNull()
      .references(() => apiKeys.id),
    eventType: varchar('event_type', { length: 32 }).notNull(), // yield_alert, tvl_alert, etc.
    config: jsonb('config').notNull().$type<Record<string, unknown>>(),
    url: text('url').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastTriggeredAt: timestamp('last_triggered_at', { withTimezone: true }),
  },
  (table) => ({
    userIdx: index('webhooks_user_idx').on(table.userId),
    apiKeyIdx: index('webhooks_api_key_idx').on(table.apiKeyId),
  })
);

// Type exports
export type Protocol = typeof protocols.$inferSelect;
export type NewProtocol = typeof protocols.$inferInsert;
export type Pool = typeof pools.$inferSelect;
export type NewPool = typeof pools.$inferInsert;
export type Yield = typeof yields.$inferSelect;
export type NewYield = typeof yields.$inferInsert;
export type TokenPrice = typeof tokenPrices.$inferSelect;
export type NewTokenPrice = typeof tokenPrices.$inferInsert;
export type RiskScore = typeof riskScores.$inferSelect;
export type NewRiskScore = typeof riskScores.$inferInsert;
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type UsageLog = typeof usageLogs.$inferSelect;
export type NewUsageLog = typeof usageLogs.$inferInsert;
export type WebhookSubscription = typeof webhookSubscriptions.$inferSelect;
export type NewWebhookSubscription = typeof webhookSubscriptions.$inferInsert;
