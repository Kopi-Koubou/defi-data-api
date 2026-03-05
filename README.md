# DeFi Data API

A REST API service providing real-time DeFi yields, TVL, and risk metrics across 50+ protocols.

## Tech Stack

- **Runtime:** Node.js 22 + TypeScript (strict)
- **Framework:** Fastify
- **Database:** PostgreSQL 16 + Drizzle ORM
- **Cache:** Redis (Upstash)
- **Queue:** BullMQ

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your database credentials

# Run database migrations
npm run db:migrate

# Seed sample data
psql $DATABASE_URL -f drizzle/seed.sql

# Run one ingestion sync from DefiLlama
npm run ingest:once

# Start development server
npm run dev
```

After boot:
- Landing page + live explorer: `http://localhost:3000/`
- OpenAPI docs: `http://localhost:3000/docs`

## Data Ingestion

```bash
# One-shot snapshot ingest (protocols, pools, yields, token prices)
npm run ingest:once

# Continuous ingestion worker (30s refresh by default)
npm run ingest:worker
```

Optional backfill controls:
- `INGEST_BACKFILL_DAYS=90` to pull historical pool charts
- `INGEST_MAX_BACKFILL_POOLS=25` to limit backfill workload
- `INGEST_BACKFILL_ON_START=true` to run backfill once when worker starts

## API Endpoints

### Yields
- `GET /v1/yields` - List all yields with filters
- `GET /v1/yields/top` - Top yields by APY
- `GET /v1/yields/risk-adjusted` - Risk-adjusted yield rankings
- `GET /v1/yields/:pool_id` - Get specific pool yield
- `GET /v1/yields/:pool_id/history` - Historical yield data

### Protocols
- `GET /v1/protocols` - List all protocols
- `GET /v1/protocols/:protocol_id` - Protocol details
- `GET /v1/protocols/:protocol_id/audit-status` - Protocol audit status snapshot
- `GET /v1/protocols/:protocol_id/tvl/history` - TVL history
- `GET /v1/protocols/:protocol_id/pools` - Protocol pools

### Tokens
- `GET /v1/tokens/:address` - Token info and price
- `GET /v1/tokens/:address/price/history` - Price history
- `GET /v1/tokens/search?q=ETH` - Search tokens

### Tools
- `GET /v1/tools/impermanent-loss` - Calculate IL for a pair (optional `fee_apr` + `days` for fee-adjusted net return)
- `POST /v1/tools/impermanent-loss/simulate` - Batch IL simulation (optional `fee_apr` + `days`)

### Chains
- `GET /v1/chains/:chain_id/tvl` - Chain TVL history

### Pools
- `GET /v1/pools/:pool_id/risk-score` - Pool risk score and factor breakdown
- `GET /v1/pools/:pool_id/il/history` - Historical impermanent loss from token prices

### Webhooks (Builder tier and above)
- `POST /v1/webhooks` - Create webhook subscription
- `GET /v1/webhooks` - List webhook subscriptions
- `DELETE /v1/webhooks/:webhook_id` - Deactivate webhook subscription

## TypeScript SDK

A first-party SDK client is available in `src/sdk` (compiled to `dist/sdk`).

```ts
import { DefiDataApiClient } from './dist/sdk/index.js';

const client = new DefiDataApiClient({
  apiKey: 'test-builder-key-67890',
  baseUrl: 'http://localhost:3000/v1',
});

const topYields = await client.getTopYields();
const tokenSearch = await client.searchTokens({ q: 'ETH' });
```

## Authentication

All API requests require an `x-api-key` header:

```bash
curl -H "x-api-key: your-api-key" \
  http://localhost:3000/v1/yields
```

Test keys (for development):
- Free tier: `test-free-key-12345`
- Builder tier: `test-builder-key-67890`

## Response Format

```json
{
  "data": { ... },
  "meta": {
    "requestId": "req_abc123",
    "latencyMs": 12
  },
  "pagination": {
    "cursor": "eyJvZmZzZXQiOjEwMH0",
    "hasMore": true
  }
}
```

## Database Schema

See `src/db/schema.ts` for full schema definition.

Key tables:
- `protocols` - Protocol information
- `pools` - Liquidity pools and vaults
- `yields` - Historical yield data (time-series)
- `token_prices` - Token price history
- `api_keys` - API key management

## Development

```bash
# Run linting
npm run lint

# Run tests
npm run test

# Database studio
npm run db:studio

# Build for production
npm run build
npm start
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | required |
| `REDIS_URL` | Redis connection string | - |
| `PORT` | Server port | 3000 |
| `NODE_ENV` | Environment | development |
| `API_KEY_SALT` | Salt for API key hashing | `default-salt-change-in-production` |
| `DEFILLAMA_YIELDS_API_URL` | DefiLlama yield API base URL | `https://yields.llama.fi` |
| `DEFILLAMA_COINS_API_URL` | DefiLlama coin price API base URL | `https://coins.llama.fi` |
| `INGEST_INTERVAL_MS` | Worker refresh interval | `30000` |
| `INGEST_BACKFILL_DAYS` | Backfill window when enabled | `0` |
| `INGEST_MAX_BACKFILL_POOLS` | Max pools to backfill per run | `25` |
| `INGEST_BACKFILL_ON_START` | Run backfill once on worker boot | `false` |

## License

MIT
