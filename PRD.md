# Product Requirements Document: DeFi Data API Service

**Author:** Xavier Liew
**Date:** 2026-02-11
**Status:** Draft
**Target Revenue:** $5K MRR within 90 days

---

## 1. Problem Statement

DeFi developers and analysts waste 10-20+ hours/week scraping, normalizing, and maintaining data pipelines across dozens of protocols. Every DeFi protocol exposes data differently — different ABIs, different subgraph schemas, different chain-specific quirks. The result: fragile scrapers, stale data, and duplicated effort across thousands of teams.

**Who has this problem:**
- Solo DeFi devs building dashboards, bots, or analytics tools
- Fintech apps integrating DeFi yields into traditional finance products
- Quant analysts running yield strategies across protocols
- DeFi protocols themselves needing competitive benchmarking

**How they solve it today:**
- DIY subgraph queries + custom indexers (expensive, breaks constantly)
- DefiLlama API (free but limited — no historical queries, no IL calc, rate-limited)
- Dune Analytics (SQL-based, not real-time, not API-first)
- Token Terminal / Messari (expensive enterprise contracts, $1K+/mo)

**The gap:** No affordable, developer-first REST API that provides clean, structured, real-time DeFi data with historical depth and computed metrics (impermanent loss, risk-adjusted yields).

---

## 2. The Audience

- **Primary:** DeFi developers building yield aggregators, portfolio trackers, or trading bots (indie devs and small teams, 1-10 people)
- **Secondary:** Fintech product teams integrating DeFi yield data into CeFi/TradFi apps
- **Tertiary:** Analysts and researchers running yield optimization strategies
- **Size:** ~50K active DeFi developers globally (Alchemy reports 100K+ web3 devs; ~50% touch DeFi)
- **Where they hang out:** Crypto Twitter, DeFi-focused Discords (Yearn, Aave, Uniswap), r/defi, Telegram alpha groups, ETH/Solana developer forums
- **What they already use:** DefiLlama (free, limited), Dune (SQL, not API-first), Zapper API (deprecated), custom subgraphs

---

## 3. Solution Overview

**DeFi Data API** — a REST API service that ingests raw on-chain and protocol data, cleans/normalizes it, and serves it through simple, well-documented endpoints. Think "Stripe for DeFi data" — developer experience is the product.

### Core Value Props

1. **One API, all protocols** — Unified schema across 50+ protocols on day one
2. **Computed metrics** — Impermanent loss, risk-adjusted APY, TVL trends (not just raw data)
3. **Historical depth** — Query yield/TVL data going back 12+ months
4. **Sub-minute freshness** — Data updated every 30 seconds for major protocols
5. **Actually good docs** — OpenAPI spec, SDK, copy-paste examples, Postman collection

---

## 4. Core Features & Endpoints

### 4.1 Yield & APY Data

```
GET /v1/yields
GET /v1/yields/{pool_id}
GET /v1/yields/{pool_id}/history?from=&to=&interval=
GET /v1/yields/top?chain=&protocol=&min_tvl=&sort_by=apy
```

- Current APY/APR for every tracked pool (base + reward breakdowns)
- Historical yield data with configurable intervals (1h, 1d, 1w)
- Filter by chain, protocol, asset pair, TVL minimum
- Yield type classification: lending, LP, staking, vault, restaking

### 4.2 Protocol TVL

```
GET /v1/protocols
GET /v1/protocols/{protocol_id}
GET /v1/protocols/{protocol_id}/tvl/history?from=&to=
GET /v1/protocols/{protocol_id}/pools
GET /v1/chains/{chain_id}/tvl
```

- Real-time TVL per protocol, per chain, per pool
- TVL breakdown by asset composition
- Historical TVL with trend indicators (7d, 30d change)
- Chain-level aggregate TVL

### 4.3 Impermanent Loss Calculator

```
GET  /v1/tools/impermanent-loss?token0=ETH&token1=USDC&entry_price_ratio=2000&current_price_ratio=2500
POST /v1/tools/impermanent-loss/simulate
GET  /v1/pools/{pool_id}/il/history
```

- Real-time IL calculation for any token pair at any price ratio
- Batch simulation: model IL across price scenarios
- Historical IL for tracked pools (actual realized IL over time)
- IL vs. holding comparison with fee income factored in

### 4.4 Risk & Analytics

```
GET /v1/pools/{pool_id}/risk-score
GET /v1/yields/risk-adjusted?min_score=&sort_by=sharpe
GET /v1/protocols/{protocol_id}/audit-status
```

- Pool risk scoring (smart contract risk, IL risk, liquidity depth, protocol maturity)
- Risk-adjusted yield rankings (Sharpe-like ratio for DeFi)
- Protocol audit status aggregation (sourced from public audit registries)

### 4.5 Token Prices & Metadata

```
GET /v1/tokens/{address}?chain=
GET /v1/tokens/{address}/price/history
GET /v1/tokens/search?q=
```

- Token prices (sourced from DEX aggregators + oracles, not CoinGecko dependency)
- Token metadata: name, symbol, decimals, chain deployments, logo URI
- Search by name, symbol, or contract address

### 4.6 Webhooks (Paid tier)

```
POST /v1/webhooks
GET  /v1/webhooks
DELETE /v1/webhooks/{webhook_id}
```

- Subscribe to yield threshold alerts (e.g., "notify me when AAVE USDC lending > 8%")
- TVL change alerts (protocol TVL drops > 10% in 1h)
- New pool detection alerts per protocol/chain

---

## 5. Tech Stack

### Backend

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Runtime** | Node.js 22 + TypeScript (strict) | Fast iteration, strong typing, huge ecosystem for web3 libs |
| **Framework** | Fastify | 2-3x faster than Express, schema validation built-in, OpenAPI generation |
| **Database** | PostgreSQL 16 (Supabase) | Time-series historical data, JSONB for flexible protocol metadata |
| **Cache** | Redis (Upstash) | Sub-10ms response times for hot data, rate limiting, API key sessions |
| **Queue** | BullMQ (Redis-backed) | Reliable job scheduling for data ingestion pipelines |
| **ORM** | Drizzle ORM | Type-safe, lightweight, excellent migration tooling |

### Data Ingestion

| Source | Method |
|--------|--------|
| EVM chains (ETH, Arb, Base, Polygon, OP) | ethers.js + Alchemy/Infura RPC |
| Solana | @solana/web3.js + Helius RPC |
| Protocol subgraphs | The Graph (decentralized + hosted) |
| DefiLlama | Public API (backfill + cross-validation) |
| DEX pricing | 0x API, Jupiter (Solana), on-chain oracle reads |

### Infrastructure

| Component | Service |
|-----------|---------|
| **Hosting** | Railway or Fly.io (auto-scaling, $5-50/mo range) |
| **Database** | Supabase Pro ($25/mo, 8GB included) |
| **Cache** | Upstash Redis (pay-per-use, ~$10/mo at scale) |
| **CDN** | Cloudflare (free tier, edge caching for GET endpoints) |
| **Monitoring** | Betterstack (uptime + logging) |
| **Docs** | Mintlify or Scalar (OpenAPI-driven) |
| **Auth/Billing** | Clerk (auth) + Stripe (billing) |

### Estimated Infra Cost at $5K MRR

~$150-300/mo total (96% gross margin)

---

## 6. Database Schema (Key Tables)

```sql
-- Core tables
protocols (id, slug, name, chain_ids[], category, url, audit_status, created_at)
pools (id, protocol_id, chain_id, token0, token1, pool_type, address, created_at)
yields (pool_id, timestamp, apy_base, apy_reward, apy_total, tvl_usd) -- partitioned by month
token_prices (token_address, chain_id, timestamp, price_usd, source)
risk_scores (pool_id, timestamp, score, factors JSONB)

-- API management
api_keys (id, user_id, key_hash, tier, rate_limit, created_at, last_used_at)
webhook_subscriptions (id, user_id, event_type, config JSONB, url, active)
usage_logs (api_key_id, endpoint, timestamp, response_ms) -- for billing + analytics
```

---

## 7. Pricing Tiers

| | **Free** | **Builder** | **Pro** | **Enterprise** |
|---|----------|------------|---------|---------------|
| **Price** | $0/mo | $49/mo | $149/mo | $499+/mo |
| **Requests** | 1,000/day | 50,000/day | 500,000/day | Unlimited |
| **Rate limit** | 10/min | 100/min | 1,000/min | Custom |
| **Historical data** | 7 days | 90 days | Full history | Full history |
| **Chains** | ETH + 2 | All supported | All supported | All + priority new chains |
| **Endpoints** | Core yields + TVL | All endpoints | All endpoints | All + custom |
| **Webhooks** | -- | 5 webhooks | 50 webhooks | Unlimited |
| **IL calculator** | Basic (single pair) | Full + batch sim | Full + batch sim | Full + batch sim |
| **Risk scores** | -- | Read-only | Read-only + export | Custom scoring models |
| **Support** | Docs only | Discord | Priority Discord + email | Dedicated Slack channel |
| **SLA** | Best effort | 99.5% uptime | 99.9% uptime | 99.95% + custom |

### Revenue Model to $5K MRR

| Tier | Customers needed | Revenue |
|------|-----------------|---------|
| Builder ($49) | 40 | $1,960 |
| Pro ($149) | 15 | $2,235 |
| Enterprise ($499) | 2 | $998 |
| **Total** | **57 paying** | **$5,193** |

Free tier target: 500+ users (conversion funnel)

---

## 8. Distribution Strategy

### Week 1-2: Build in Public + Seed Users

- **Crypto Twitter thread:** "I built the DeFi data API that DefiLlama should have been" — show real code examples, response times, data quality comparisons
- **DM campaign:** Identify 50 DeFi devs who've publicly complained about data quality (search CT for "defilama api", "subgraph broken", "where do you get yield data")
- **Discord seeding:** Post in developer channels of top 10 DeFi protocols (Aave, Uniswap, Lido, Compound, Curve, Maker, Yearn, Pendle, Eigenlayer, Jupiter)
- **Dev.to / Hashnode:** Tutorial — "Build a DeFi yield dashboard in 30 minutes with [API name]"

### Week 3-4: Community + Content Flywheel

- **Product Hunt launch** (target: top 5 of the day)
- **GitHub:** Open-source the TypeScript SDK + example projects (yield dashboard, Telegram bot, Discord bot)
- **Partnerships:** Reach out to 5 DeFi dashboard projects offering free Pro tier in exchange for "Powered by" attribution
- **Telegram bot:** Free public bot showing top yields — drives awareness to API
- **Substack/blog:** Weekly "DeFi Yield Report" powered by the API (content marketing)

### Ongoing: Developer Flywheel

- Open-source SDK with great DX → devs star/fork → organic discovery
- Community showcase: feature apps built on the API
- Protocol partnerships: offer free data to protocols in exchange for promotion
- Affiliate: 20% recurring commission for developer advocates

---

## 9. API Design Principles

1. **Consistent response format** — Every endpoint returns `{ data, meta, pagination }`
2. **Sensible defaults** — `GET /v1/yields` returns top 100 by TVL without params
3. **Cursor pagination** — No offset-based pagination; cursor-based for stable results
4. **ISO timestamps** — All times in UTC ISO 8601
5. **USD normalization** — All monetary values in USD (original amounts available in metadata)
6. **Idempotent** — All GET requests are safe to cache and retry
7. **Versioned** — `/v1/` prefix, backward-compatible changes only within version
8. **Error codes** — Machine-readable error codes, human-readable messages

### Example Response

```json
{
  "data": {
    "pool_id": "aave-v3-eth-usdc",
    "protocol": "aave-v3",
    "chain": "ethereum",
    "token0": { "symbol": "ETH", "address": "0x..." },
    "token1": { "symbol": "USDC", "address": "0x..." },
    "apy": {
      "total": 4.82,
      "base": 3.21,
      "reward": 1.61,
      "breakdown": [
        { "source": "lending_interest", "apy": 3.21 },
        { "source": "AAVE_rewards", "apy": 1.61 }
      ]
    },
    "tvl_usd": 142500000,
    "risk_score": 87,
    "pool_type": "lending",
    "updated_at": "2026-02-11T14:30:00Z"
  },
  "meta": {
    "request_id": "req_abc123",
    "latency_ms": 12
  }
}
```

---

## 10. MVP Scope (What's In / What's Out)

### In for MVP (Day 1-14)

- Yield/APY endpoints (current + 90-day history)
- TVL endpoints (protocol + chain level)
- Basic IL calculator (single pair, no batch)
- Token price endpoints
- 15 protocols: Aave v3, Compound v3, Uniswap v3, Curve, Lido, Maker, Yearn, Pendle, Eigenlayer, Jupiter, Raydium, Marinade, Morpho, Spark, Ethena
- 5 chains: Ethereum, Arbitrum, Base, Solana, Polygon
- API key auth + rate limiting
- Free + Builder tiers
- Interactive API docs (Scalar)
- TypeScript SDK (npm package)

### NOT in MVP

- Webhooks (Month 2)
- Risk scoring (Month 2)
- Enterprise tier + custom SLA (Month 3)
- GraphQL endpoint (Month 3, if demand)
- Batch simulation endpoint (Month 2)
- More chains (Optimism, Avalanche, BSC — based on demand)
- WebSocket streaming (Month 3+)

---

## 11. 30-Day Launch Plan

### Days 1-3: Foundation

- [ ] Set up monorepo (Fastify + Drizzle + TypeScript)
- [ ] PostgreSQL schema + migrations (Supabase)
- [ ] Redis setup (Upstash) + caching layer
- [ ] API key generation + rate limiting middleware
- [ ] CI/CD pipeline (GitHub Actions → Railway)

### Days 4-8: Data Ingestion

- [ ] Build ingestion workers for 5 core protocols (Aave, Uniswap, Lido, Curve, Compound)
- [ ] Token price aggregation pipeline (DEX + oracle sources)
- [ ] Historical data backfill (90 days) from DefiLlama + subgraphs
- [ ] Data validation + anomaly detection (reject obviously wrong APYs)
- [ ] 30-second refresh cycle for major protocols

### Days 9-12: API Endpoints

- [ ] Yields endpoints (list, detail, history, top)
- [ ] Protocol/TVL endpoints
- [ ] IL calculator endpoint
- [ ] Token endpoints (price, search, metadata)
- [ ] Unified error handling + response formatting
- [ ] OpenAPI spec generation from Fastify schemas

### Days 13-16: Developer Experience

- [ ] API documentation site (Scalar or Mintlify)
- [ ] TypeScript SDK (`npm install @defidata/sdk`)
- [ ] Postman collection + curl examples
- [ ] Landing page with live API explorer
- [ ] Stripe billing integration (Free + Builder tiers)

### Days 17-20: Expand Coverage + Polish

- [ ] Add remaining 10 protocols to ingestion
- [ ] Add Solana chain support (Jupiter, Raydium, Marinade)
- [ ] Performance optimization: p99 < 100ms for cached endpoints
- [ ] Load testing: sustain 1,000 req/min without degradation
- [ ] Monitoring + alerting (Betterstack)

### Days 21-24: Soft Launch

- [ ] Invite 20 DeFi devs for private beta (from DM campaign)
- [ ] Collect feedback, fix critical issues
- [ ] Publish tutorial blog post
- [ ] Open-source SDK on GitHub

### Days 25-30: Public Launch

- [ ] CT launch thread + announcement
- [ ] Product Hunt submission
- [ ] Post in 10 DeFi Discord developer channels
- [ ] Dev.to tutorial published
- [ ] Track: signups, API calls, conversion to paid

---

## 12. Success Criteria

| Timeframe | Signal | Keep Building | Kill |
|-----------|--------|--------------|------|
| **Day 7** (beta) | Beta signups | 30+ developers request access | < 10 signups after 50 DMs |
| **Day 14** | API usage | 5+ devs making 100+ calls/day | No one integrates beyond test calls |
| **Day 30** | Revenue | 10+ paying customers, $500+ MRR | < 3 paying, no interest in paid tiers |
| **Day 60** | Growth | $2K MRR, 200+ free users | Flat MRR, high churn |
| **Day 90** | Target | $5K MRR, 500+ free users | < $2K MRR, no enterprise interest |

---

## 13. Competitive Positioning

| Competitor | Strengths | Weaknesses | Our Edge |
|-----------|-----------|------------|----------|
| **DefiLlama** | Free, wide coverage | No history API, rate limits, no computed metrics, community-maintained | Historical data, IL calc, risk scores, reliability SLA |
| **Dune Analytics** | Flexible SQL, great for ad-hoc | Not real-time, not REST API, query latency, learning curve | Real-time REST, sub-100ms, zero SQL needed |
| **Token Terminal** | Clean data, institutional grade | $300+/mo minimum, limited API, slow to add protocols | 10x cheaper, developer-first, faster protocol coverage |
| **Messari** | Institutional trust, broad coverage | Enterprise pricing ($1K+), slow API, bloated responses | Affordable, fast, focused on DeFi (not everything) |
| **Zapper/Zerion** | Portfolio-focused, good UX | APIs deprecated/limited, not developer-first | API-first, reliable, growing |

**Positioning statement:** "The developer-first DeFi data API. Real-time yields, historical data, and computed risk metrics — starting free."

---

## 14. Why Xavier Has Edge

- Active DeFi user and developer — understands the pain firsthand
- Trading tool project already built data pipelines for similar on-chain data
- OpenClaw agent system can automate data quality monitoring and protocol onboarding
- Solo operator with AI-augmented development = ship fast, keep costs near zero
- No VC pressure — can price affordably and grow organically

---

## 15. Open Questions

- [ ] Brand name: "DeFi Data API" is descriptive but generic. Candidates: Yieldstream, Pulsefi, Chainpipe, Yieldr
- [ ] Should free tier require email signup or allow anonymous API keys?
- [ ] Priority: Solana-first or EVM-first? (EVM has more protocols, Solana has less competition for data APIs)
- [ ] Partner with DefiLlama for data backfill, or build independent pipelines from day 1?
- [ ] Legal: any regulatory considerations for providing DeFi yield data commercially?
