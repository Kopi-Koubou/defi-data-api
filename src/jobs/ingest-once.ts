import 'dotenv/config';
import { runDefiLlamaIngestion } from '../ingestion/defillama.js';

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

async function main(): Promise<void> {
  const backfillDays = parsePositiveInt(process.env.INGEST_BACKFILL_DAYS, 0);
  const maxBackfillPools = parsePositiveInt(process.env.INGEST_MAX_BACKFILL_POOLS, 25);

  const summary = await runDefiLlamaIngestion({
    backfillDays,
    maxBackfillPools,
  });

  console.log('[ingest:once] complete');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error('[ingest:once] failed');
  console.error(error);
  process.exit(1);
});

