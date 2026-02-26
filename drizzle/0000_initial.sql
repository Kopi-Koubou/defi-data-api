-- Initial migration for DeFi Data API
-- Run with: drizzle-kit migrate

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Protocols table
CREATE TABLE IF NOT EXISTS protocols (
    id VARCHAR(64) PRIMARY KEY,
    slug VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(128) NOT NULL,
    chain_ids TEXT[] NOT NULL DEFAULT '{}',
    category VARCHAR(32) NOT NULL,
    url TEXT NOT NULL,
    audit_status VARCHAR(16) NOT NULL DEFAULT 'unknown',
    tvl_usd REAL NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS protocols_slug_idx ON protocols(slug);
CREATE INDEX IF NOT EXISTS protocols_category_idx ON protocols(category);

-- Pools table
CREATE TABLE IF NOT EXISTS pools (
    id VARCHAR(128) PRIMARY KEY,
    protocol_id VARCHAR(64) NOT NULL REFERENCES protocols(id),
    chain_id VARCHAR(32) NOT NULL,
    address VARCHAR(64) NOT NULL,
    token0_symbol VARCHAR(32) NOT NULL,
    token0_address VARCHAR(64) NOT NULL,
    token0_decimals INTEGER NOT NULL DEFAULT 18,
    token1_symbol VARCHAR(32),
    token1_address VARCHAR(64),
    token1_decimals INTEGER,
    pool_type VARCHAR(16) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pools_protocol_idx ON pools(protocol_id);
CREATE INDEX IF NOT EXISTS pools_chain_idx ON pools(chain_id);
CREATE INDEX IF NOT EXISTS pools_type_idx ON pools(pool_type);
CREATE INDEX IF NOT EXISTS pools_address_idx ON pools(address);

-- Yields table (time-series data)
CREATE TABLE IF NOT EXISTS yields (
    id SERIAL PRIMARY KEY,
    pool_id VARCHAR(128) NOT NULL REFERENCES pools(id),
    timestamp TIMESTAMPTZ NOT NULL,
    apy_base REAL NOT NULL DEFAULT 0,
    apy_reward REAL NOT NULL DEFAULT 0,
    apy_total REAL NOT NULL DEFAULT 0,
    tvl_usd REAL NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS yields_pool_idx ON yields(pool_id);
CREATE INDEX IF NOT EXISTS yields_timestamp_idx ON yields(timestamp);
CREATE INDEX IF NOT EXISTS yields_pool_timestamp_idx ON yields(pool_id, timestamp);

-- Token prices table
CREATE TABLE IF NOT EXISTS token_prices (
    id SERIAL PRIMARY KEY,
    token_address VARCHAR(64) NOT NULL,
    chain_id VARCHAR(32) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    price_usd REAL NOT NULL,
    source VARCHAR(32) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS prices_token_chain_idx ON token_prices(token_address, chain_id);
CREATE INDEX IF NOT EXISTS prices_timestamp_idx ON token_prices(timestamp);

-- Risk scores table
CREATE TABLE IF NOT EXISTS risk_scores (
    id SERIAL PRIMARY KEY,
    pool_id VARCHAR(128) NOT NULL REFERENCES pools(id),
    timestamp TIMESTAMPTZ NOT NULL,
    score INTEGER NOT NULL,
    factors JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS risk_pool_idx ON risk_scores(pool_id);
CREATE INDEX IF NOT EXISTS risk_timestamp_idx ON risk_scores(timestamp);

-- API keys table
CREATE TABLE IF NOT EXISTS api_keys (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    key_hash VARCHAR(128) NOT NULL UNIQUE,
    tier VARCHAR(16) NOT NULL DEFAULT 'free',
    rate_limit INTEGER NOT NULL DEFAULT 10,
    request_quota INTEGER NOT NULL DEFAULT 1000,
    requests_used INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    reset_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS api_keys_user_idx ON api_keys(user_id);

-- Usage logs table
CREATE TABLE IF NOT EXISTS usage_logs (
    id SERIAL PRIMARY KEY,
    api_key_id VARCHAR(64) NOT NULL REFERENCES api_keys(id),
    endpoint VARCHAR(256) NOT NULL,
    method VARCHAR(8) NOT NULL,
    status_code INTEGER NOT NULL,
    response_ms INTEGER NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS usage_api_key_idx ON usage_logs(api_key_id);
CREATE INDEX IF NOT EXISTS usage_timestamp_idx ON usage_logs(timestamp);
CREATE INDEX IF NOT EXISTS usage_endpoint_idx ON usage_logs(endpoint);

-- Webhook subscriptions table
CREATE TABLE IF NOT EXISTS webhook_subscriptions (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    api_key_id VARCHAR(64) NOT NULL REFERENCES api_keys(id),
    event_type VARCHAR(32) NOT NULL,
    config JSONB NOT NULL,
    url TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_triggered_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS webhooks_user_idx ON webhook_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS webhooks_api_key_idx ON webhook_subscriptions(api_key_id);
